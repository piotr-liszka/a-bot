// Local API for the a-bot MCP server that bots run: lets a bot list and message the other bots on this device.
// Only the agent talks to Supabase, so its session (and refresh token) is never shared with another process.
import type { BotRow, MessageRow } from '@a-bot/shared';
import { createServer, type Server } from 'node:http';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from './backend.js';
import { agentHome } from './config.js';

export function bridgeSocket(): string {
  return process.env.A_BOT_AGENT_SOCKET || join(agentHome(), 'agent.sock');
}

const ASK_TIMEOUT_MS = 15 * 60_000;

async function listBots(db: Db, deviceId: string, from: string) {
  const { data, error } = await db.from('bots').select('id,name,engine,model,instructions').eq('device_id', deviceId).order('created_at');
  if (error) throw new Error(error.message);
  return (data as Pick<BotRow, 'id' | 'name' | 'engine' | 'model' | 'instructions'>[])
    .filter((b) => b.id !== from)
    .map((b) => ({ name: b.name, engine: b.engine, model: b.model, about: b.instructions?.slice(0, 300) ?? '' }));
}

async function askBot(db: Db, deviceId: string, from: string, to: string, text: string, wait: boolean) {
  const { data: bots } = await db.from('bots').select('id,name').eq('device_id', deviceId);
  const target = (bots ?? []).find((b) => b.id === to || b.name.toLowerCase() === to.toLowerCase());
  if (!target) throw new Error(`No bot named "${to}". Use list_bots.`);
  const { data: reply, error } = await db.rpc('bot_send', { p_from: from, p_to: target.id, p_text: text }).single<MessageRow>();
  if (error) throw new Error(/busy/.test(error.message) ? `${target.name} is busy with another task; try again later.` : error.message);
  if (!wait) return { bot: target.name, status: 'sent' };
  const started = Date.now();
  while (Date.now() - started < ASK_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, 1500));
    const { data } = await db.from('messages').select('status,text,error').eq('id', reply.id).single<Pick<MessageRow, 'status' | 'text' | 'error'>>();
    if (data && !['pending', 'streaming'].includes(data.status)) {
      return { bot: target.name, status: data.status, answer: data.text, error: data.error ?? undefined };
    }
  }
  return { bot: target.name, status: 'timeout', answer: 'Still working; the answer will appear in its chat.' };
}

export function startBridge(db: Db, deviceId: string): Server {
  const path = bridgeSocket();
  if (existsSync(path)) unlinkSync(path);
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        const input = JSON.parse(body || '{}');
        const result =
          req.url === '/list_bots'
            ? await listBots(db, deviceId, input.from)
            : req.url === '/ask_bot'
              ? await askBot(db, deviceId, input.from, String(input.bot ?? ''), String(input.message ?? ''), input.wait !== false)
              : undefined;
        if (result === undefined) throw new Error('unknown call');
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      }
    });
  });
  server.listen(path);
  return server;
}
