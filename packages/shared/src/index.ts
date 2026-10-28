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
  created_at: string;
  updated_at: string;
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
