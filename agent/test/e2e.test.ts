// End-to-end test against a local Supabase (npm run db:start at the repo root).
// Starts a real agent process, pairs it, chats with the Terminal bot and checks access rules.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { DeviceRow, MessageRow } from '@a-bot/shared';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

const URL = process.env.A_BOT_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.A_BOT_SUPABASE_ANON_KEY;

const client = () => createClient(URL, KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

async function signUp(db: SupabaseClient) {
  const email = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const { data, error } = await db.auth.signUp({ email, password: 'correct-horse-battery' });
  assert.ifError(error);
  return data.user!.id;
}

async function waitFor<T>(fn: () => Promise<T | undefined>, timeoutMs = 20_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v !== undefined) return v;
    if (Date.now() - start > timeoutMs) throw new Error(`timeout; agent output:\n${agentOut}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

let agent: ChildProcess;
let agentOut = '';

before(() => {
  if (!KEY) return;
  const home = mkdtempSync(join(tmpdir(), 'a-bot-agent-'));
  const workspace = mkdtempSync(join(tmpdir(), 'a-bot-ws-'));
  agent = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts', 'run'], {
    env: { ...process.env, PATH: `${join(process.cwd(), 'test/fixtures/bin')}:${process.env.PATH}`, A_BOT_HOME: home, A_BOT_WORKSPACE: workspace, A_BOT_DEVICE_NAME: 'Test box', A_BOT_SUPABASE_URL: URL, A_BOT_SUPABASE_ANON_KEY: KEY },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  agent.stdout!.on('data', (d) => (agentOut += d));
  agent.stderr!.on('data', (d) => (agentOut += d));
});

after(() => {
  agent?.kill('SIGTERM');
});

test('pair a device, chat with a bot, cancel, and keep strangers out', { skip: !KEY && 'A_BOT_SUPABASE_ANON_KEY not set' }, async () => {
  const code = await waitFor(async () => agentOut.match(/Pairing code:\s+([A-Z0-9]{3}) ([A-Z0-9]{3})/)?.slice(1).join(''));

  const me = client();
  await signUp(me);
  const { data: device, error: claimErr } = await me.rpc('claim_pairing', { p_code: code.toLowerCase() }).single<DeviceRow>();
  assert.ifError(claimErr);
  assert.equal(device.name, 'Test box');

  // The code is single use.
  const { error: reuseErr } = await me.rpc('claim_pairing', { p_code: code });
  assert.ok(reuseErr, 'a claimed code cannot be claimed again');

  // Agent comes online and publishes its bots.
  const online = await waitFor(async () => {
    const { data } = await me.from('devices').select('*').eq('id', device.id).single<DeviceRow>();
    return data && data.status === 'online' && data.providers.length ? data : undefined;
  });
  const claude = online.providers.find((p) => p.id === 'claude');
  assert.ok(claude?.installed && claude.authenticated, 'claude engine is ready');

  const { data: bot, error: botErr } = await me
    .from('bots')
    .insert({ device_id: device.id, name: 'Asystent', engine: 'claude', model: 'opus', instructions: 'Odpowiadaj krótko.' })
    .select()
    .single();
  assert.ifError(botErr);
  const { data: conv, error: convErr } = await me
    .from('conversations')
    .insert({ device_id: device.id, bot_id: bot.id, provider_id: bot.engine, model: bot.model })
    .select()
    .single();
  assert.ifError(convErr);

  const { data: reply, error: sendErr } = await me.rpc('send_message', { p_conversation_id: conv.id, p_text: 'Co jest w katalogu?' }).single<MessageRow>();
  assert.ifError(sendErr);
  const done = await waitFor(async () => {
    const { data } = await me.from('messages').select('*').eq('id', reply.id).single<MessageRow>();
    return data && ['done', 'error'].includes(data.status) ? data : undefined;
  });
  assert.equal(done.status, 'done', agentOut);
  assert.match(done.text, /dokończyć POC/);
  assert.match(done.text, /Instrukcje bota: Odpowiadaj krótko\./);
  assert.equal(done.model, 'opus');
  assert.equal(done.steps.length, 2);
  assert.ok(done.steps.every((s) => s.status === 'done'));

  const { data: convAfter } = await me.from('conversations').select('*').eq('id', conv.id).single();
  assert.equal(convAfter.busy, false);
  assert.equal(convAfter.provider_session_id, 'fake-session-1');
  assert.match(convAfter.title, /Co jest w katalogu/);

  // Cancelling a long command stops it.
  const { data: slow } = await me.rpc('send_message', { p_conversation_id: conv.id, p_text: 'SLEEP please' }).single<MessageRow>();
  await waitFor(async () => {
    const { data } = await me.from('messages').select('status').eq('id', slow!.id).single();
    return data?.status === 'streaming' ? true : undefined;
  });
  await me.from('messages').update({ cancel_requested: true }).eq('id', slow!.id);
  const cancelled = await waitFor(async () => {
    const { data } = await me.from('messages').select('*').eq('id', slow!.id).single<MessageRow>();
    return data && data.status !== 'streaming' ? data : undefined;
  }, 10_000);
  assert.equal(cancelled.status, 'cancelled');

  // Another person sees nothing and cannot route messages to this device.
  const stranger = client();
  await signUp(stranger);
  const { data: theirView } = await stranger.from('messages').select('id').eq('conversation_id', conv.id);
  assert.equal(theirView?.length, 0);
  const { error: hijack } = await stranger.from('conversations').insert({ device_id: device.id, provider_id: 'claude' });
  assert.ok(hijack, 'cannot create a conversation on someone else’s device');
  const { error: botHijack } = await stranger.from('bots').insert({ device_id: device.id, name: 'x', engine: 'claude' });
  assert.ok(botHijack, 'cannot create a bot on someone else’s device');
  const { data: theirBots } = await stranger.from('bots').select('id');
  assert.equal(theirBots?.length, 0);
  const { data: devs } = await stranger.from('devices').select('id');
  assert.equal(devs?.length, 0);
});
