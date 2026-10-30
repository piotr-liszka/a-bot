// Types shared by the desktop app and the device agent.
// Row types mirror the Postgres tables in supabase/migrations.

export type ProviderKind = 'claude' | 'codex' | 'ollama' | 'custom';

export interface ProviderInfo {
  id: string;
  kind: ProviderKind;
  name: string;
  description: string;
  installed: boolean;
  authenticated: boolean;
  version?: string;
  models: string[];
  defaultModel?: string;
  /** Human hint shown when the provider is not ready, e.g. how to log in. */
  setupHint?: string;
}

export interface DeviceRow {
  id: string;
  owner_id: string;
  name: string;
  status: 'online' | 'offline';
  last_seen: string | null;
  hostname: string | null;
  platform: string | null;
  agent_version: string | null;
  workspace: string | null;
  providers: ProviderInfo[];
  refresh_requested_at: string | null;
  created_at: string;
}

/** A bot the person created: a name on top of an engine detected on the device. */
export interface BotRow {
  id: string;
  owner_id: string;
  device_id: string;
  name: string;
  /** Provider id on the device: claude, codex, ollama or a custom one. */
  engine: string;
  model: string | null;
  instructions: string | null;
  color: string | null;
  /** The bot's MEMORY.md, mirrored by the agent. */
  memory: string;
  memory_updated_at: string | null;
  /** Extra MCP servers for this bot. */
  mcp: McpServer[];
  created_at: string;
  updated_at: string;
}

/** An MCP server: a command run in the sandbox, or a remote URL. */
export type McpServer =
  | { name: string; command: string; args?: string[]; env?: Record<string, string> }
  | { name: string; url: string; headers?: Record<string, string> };

export type RoutineSchedule =
  | { kind: 'interval'; minutes: number }
  /** days: 0 = Sunday … 6 = Saturday; empty or missing means every day. */
  | { kind: 'daily'; time: string; days?: number[] };

export interface RoutineRow {
  id: string;
  owner_id: string;
  bot_id: string;
  device_id: string;
  name: string;
  prompt: string;
  schedule: RoutineSchedule;
  timezone: string;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: string | null;
  created_at: string;
  updated_at: string;
}

/** UTC offset of `timeZone` at `date`, in minutes (e.g. 60 for Warsaw in winter). */
function zoneOffset(date: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - date.getTime()) / 60_000);
}

/** The first moment after `after` at which the routine is due. */
export function nextRun(schedule: RoutineSchedule, timeZone: string, after: Date = new Date()): Date {
  if (schedule.kind === 'interval') return new Date(after.getTime() + Math.max(5, schedule.minutes) * 60_000);
  const [h, m] = schedule.time.split(':').map(Number);
  const days = schedule.days?.length ? schedule.days : [0, 1, 2, 3, 4, 5, 6];
  // Walk local calendar days in the routine's time zone until one matches and lies in the future.
  const local = new Date(after.getTime() + zoneOffset(after, timeZone) * 60_000);
  for (let i = 0; i < 8; i++) {
    const y = local.getUTCFullYear();
    const mo = local.getUTCMonth();
    const d = local.getUTCDate() + i;
    const guess = Date.UTC(y, mo, d, h, m);
    const weekday = new Date(guess).getUTCDay();
    if (!days.includes(weekday)) continue;
    const at = new Date(guess - zoneOffset(new Date(guess), timeZone) * 60_000);
    if (at.getTime() > after.getTime()) return at;
  }
  return new Date(after.getTime() + 24 * 3_600_000);
}

export interface ConversationRow {
  id: string;
  owner_id: string;
  device_id: string;
  bot_id: string | null;
  provider_id: string;
  model: string | null;
  title: string;
  provider_session_id: string | null;
  busy: boolean;
  last_message_preview: string | null;
  /** Current step while the bot works, cleared when it finishes. */
  activity: string | null;
  created_at: string;
  updated_at: string;
}

export type MessageRole = 'user' | 'assistant';
export type MessageStatus = 'pending' | 'streaming' | 'done' | 'error' | 'cancelled';
export type StepKind = 'command' | 'tool' | 'file' | 'thinking' | 'info';

export interface MessageStep {
  id: string;
  kind: StepKind;
  title: string;
  detail?: string;
  output?: string;
  status: 'running' | 'done' | 'error';
}

export interface MessageUsage {
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  owner_id: string;
  device_id: string;
  role: MessageRole;
  text: string;
  status: MessageStatus;
  provider_id: string;
  model: string | null;
  steps: MessageStep[];
  error: string | null;
  cancel_requested: boolean;
  usage: MessageUsage | null;
  created_at: string;
  finished_at: string | null;
}

export const HEARTBEAT_MS = 20_000;
/** A device whose heartbeat is older than this is shown as offline. */
export const OFFLINE_AFTER_MS = 60_000;

export function isDeviceOnline(device: Pick<DeviceRow, 'status' | 'last_seen'>, now: number = Date.now()): boolean {
  if (device.status !== 'online' || !device.last_seen) return false;
  return now - Date.parse(device.last_seen) < OFFLINE_AFTER_MS;
}

export function normalizePairingCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Merge a step update into a list, keeping earlier fields the update leaves empty. */
export function upsertStep(steps: MessageStep[], update: MessageStep): MessageStep[] {
  const i = steps.findIndex((s) => s.id === update.id);
  if (i === -1) return [...steps, update];
  const prev = steps[i];
  const merged: MessageStep = {
    ...prev,
    ...Object.fromEntries(Object.entries(update).filter(([, v]) => v !== undefined && v !== '')),
    kind: prev.kind,
  } as MessageStep;
  const next = steps.slice();
  next[i] = merged;
  return next;
}

export interface BackendConfig {
  url: string;
  anonKey: string;
}

export function previewText(text: string, max = 90): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
