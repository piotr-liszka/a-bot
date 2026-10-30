import type { BotRow } from '@a-bot/shared';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from './backend.js';
import { log } from './log.js';

const TEMPLATE = (name: string) => `# ${name}: memory

Facts, preferences and ongoing work worth remembering between chats.
`;

/** Where a bot keeps its memory inside the sandbox; the workspace is the person's own folder, so they can read it too. */
export function memoryPath(workspace: string, botId: string): string {
  return join(workspace, '.a-bot', 'bots', botId, 'MEMORY.md');
}

function readFile(path: string): { text: string; mtime: number } | undefined {
  if (!existsSync(path)) return undefined;
  return { text: readFileSync(path, 'utf8'), mtime: statSync(path).mtimeMs };
}

/**
 * Before a run: makes MEMORY.md match the database when the person edited it in the app (or it is missing).
 * Returns the file's path and current text.
 */
export function prepareMemory(workspace: string, bot: BotRow): { path: string; text: string } {
  const path = memoryPath(workspace, bot.id);
  const file = readFile(path);
  const editedInApp = bot.memory_updated_at ? Date.parse(bot.memory_updated_at) : 0;
  if (!file || (file.text !== bot.memory && bot.memory && editedInApp > file.mtime)) {
    mkdirSync(join(path, '..'), { recursive: true });
    const text = bot.memory || TEMPLATE(bot.name);
    writeFileSync(path, text);
    return { path, text };
  }
  return { path, text: file.text };
}

/** After a run: copies what the bot wrote into MEMORY.md to the database, so the app shows it. */
export async function publishMemory(db: Db, workspace: string, bot: BotRow, before: string): Promise<void> {
  const file = readFile(memoryPath(workspace, bot.id));
  if (!file || file.text === before) return;
  const { error } = await db.from('bots').update({ memory: file.text.slice(0, 100_000), memory_updated_at: new Date().toISOString() }).eq('id', bot.id);
  if (error) log.warn(`memory of ${bot.name}: ${error.message}`);
}

/** Standing instructions every bot gets about its memory and the other bots. */
export function memoryInstructions(path: string, text: string, canUseTools: boolean): string {
  if (!canUseTools) {
    return `## Your memory\nThis is what you remembered from earlier chats:\n\n${text}`;
  }
  return [
    '## Your memory',
    `You have a persistent memory file at ${path}. It survives when the chat is cleared.`,
    'Read it at the start of a task. When you learn something worth keeping (facts about the person, their preferences,',
    'ongoing tasks, how things are set up, what worked), update the file: short Markdown, newest first, remove what is outdated.',
    '',
    '## Other bots',
    'Other bots of the same person run in this sandbox. Use the a-bot MCP tools: list_bots to see them,',
    'ask_bot to give one a task and get its answer.',
  ].join('\n');
}
