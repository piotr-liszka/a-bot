// `a-bot-agent mcp --bot <id>`: a minimal MCP server (stdio, JSON-RPC per line) that the bot's CLI starts.
// It forwards tool calls to the running agent over its local socket.
import { request } from 'node:http';
import { createInterface } from 'node:readline';
import { bridgeSocket } from './bridge.js';

const TOOLS = [
  {
    name: 'list_bots',
    description: 'List the other bots of this person in the sandbox: name, engine, model and what they are for.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ask_bot',
    description:
      'Send a message or task to another bot and (by default) wait for its answer. The exchange also shows up in that bot’s chat.',
    inputSchema: {
      type: 'object',
      properties: {
        bot: { type: 'string', description: 'Name of the bot, as listed by list_bots.' },
        message: { type: 'string', description: 'What to ask or tell it. Include all context it needs.' },
        wait: { type: 'boolean', description: 'Wait for the answer (default true). false only hands the task over.' },
      },
      required: ['bot', 'message'],
    },
  },
];

function call(path: string, body: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = request({ socketPath: bridgeSocket(), path, method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => {
      let out = '';
      res.on('data', (c) => (out += c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(out);
          if (res.statusCode !== 200) reject(new Error(parsed.error ?? out));
          else resolve(parsed);
        } catch {
          reject(new Error(out || `HTTP ${res.statusCode}`));
        }
      });
    });
    req.on('error', (e) => reject(new Error(`The a-bot agent is not reachable: ${e.message}`)));
    req.end(JSON.stringify(body));
  });
}

export async function serveMcp(botId: string): Promise<void> {
  const send = (msg: unknown) => process.stdout.write(`${JSON.stringify(msg)}\n`);
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let msg: { id?: number | string; method?: string; params?: any };
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    const { id, method, params } = msg;
    if (id === undefined) continue; // notifications need no answer
    if (method === 'initialize') {
      send({ jsonrpc: '2.0', id, result: { protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'a-bot', version: '0.2.0' } } });
    } else if (method === 'tools/list') {
      send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    } else if (method === 'tools/call') {
      try {
        const result = await call(`/${params?.name}`, { ...(params?.arguments ?? {}), from: botId });
        send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } });
      } catch (err) {
        send({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }] } });
      }
    } else if (method === 'ping') {
      send({ jsonrpc: '2.0', id, result: {} });
    } else {
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown method ${method}` } });
    }
  }
}
