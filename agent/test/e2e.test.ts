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
    env: { ...process.env, A_BOT_HOME: home, A_BOT_WORKSPACE: workspace, A_BOT_DEVICE_NAME: 'Test box', A_BOT_SUPABASE_URL: URL, A_BOT_SUPABASE_ANON_KEY: KEY },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  agent.stdout!.on('data', (d) => (agentOut += d));
  agent.stderr!.on('data', (d) => (agentOut += d));
});

after(() => {
  agent?.kill('SIGTERM');
});

test('pair a device, chat with the Terminal bot, cancel, and keep strangers out', { skip: !KEY && 'A_BOT_SUPABASE_ANON_KEY not set' }, async () => {
  const code = await waitFor(async () => agentOut.match(/Kod parowania:\s+([A-Z0-9]{3}) ([A-Z0-9]{3})/)?.slice(1).join(''));

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
  const shell = online.providers.find((p) => p.id === 'shell');
  assert.ok(shell?.installed && shell.authenticated, 'Terminal bot is ready');

  const { data: conv, error: convErr } = await me.from('conversations').insert({ device_id: device.id, provider_id: 'shell' }).select().single();
  assert.ifError(convErr);

  const { data: reply, error: sendErr } = await me.rpc('send_message', { p_conversation_id: conv.id, p_text: 'echo "cześć z kontenera" && pwd' }).single<MessageRow>();
  assert.ifError(sendErr);
  const done = await waitFor(async () => {
    const { data } = await me.from('messages').select('*').eq('id', reply.id).single<MessageRow>();
    return data && ['done', 'error'].includes(data.status) ? data : undefined;
  });
  assert.equal(done.status, 'done', agentOut);
  assert.match(done.text, /cześć z kontenera/);
  assert.equal(done.steps.length, 1);
  assert.equal(done.steps[0].status, 'done');

  const { data: convAfter } = await me.from('conversations').select('*').eq('id', conv.id).single();
  assert.equal(convAfter.busy, false);
  assert.match(convAfter.title, /echo/);

  // Cancelling a long command stops it.
  const { data: slow } = await me.rpc('send_message', { p_conversation_id: conv.id, p_text: 'sleep 30' }).single<MessageRow>();
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
  const { error: hijack } = await stranger.from('conversations').insert({ device_id: device.id, provider_id: 'shell' });
  assert.ok(hijack, 'cannot create a conversation on someone else’s device');
  const { data: devs } = await stranger.from('devices').select('id');
  assert.equal(devs?.length, 0);
});
