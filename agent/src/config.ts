import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname, homedir } from 'node:os';
import { join } from 'node:path';
import type { CustomProviderConfig } from './providers/index.js';

export interface AgentConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  deviceName: string;
  workspace: string;
  customProviders: CustomProviderConfig[];
  maxParallelJobs: number;
}

export const AGENT_VERSION = '0.1.0';

export function agentHome(): string {
  const dir = process.env.A_BOT_HOME || join(homedir(), '.a-bot');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

/** File config (~/.a-bot/agent.json) overridden by A_BOT_* environment variables. */
export function loadConfig(): AgentConfig {
  const file = join(agentHome(), 'agent.json');
  const fromFile: Partial<AgentConfig> = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const env = process.env;
  const cfg: AgentConfig = {
    supabaseUrl: env.A_BOT_SUPABASE_URL || fromFile.supabaseUrl || '',
    supabaseAnonKey: env.A_BOT_SUPABASE_ANON_KEY || fromFile.supabaseAnonKey || '',
    deviceName: env.A_BOT_DEVICE_NAME || fromFile.deviceName || hostname(),
    workspace: env.A_BOT_WORKSPACE || fromFile.workspace || (existsSync('/workspace') ? '/workspace' : process.cwd()),
    customProviders: fromFile.customProviders ?? [],
    maxParallelJobs: Number(env.A_BOT_MAX_PARALLEL_JOBS || fromFile.maxParallelJobs || 3),
  };
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    throw new Error('Brak konfiguracji backendu: ustaw A_BOT_SUPABASE_URL i A_BOT_SUPABASE_ANON_KEY (albo supabaseUrl/supabaseAnonKey w ~/.a-bot/agent.json).');
  }
  return cfg;
}

/** Minimal synchronous key-value file used as supabase-js auth storage, so the device keeps its identity. */
export class FileStorage {
  private data: Record<string, string>;
  constructor(private path: string) {
    this.data = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  }
  getItem(key: string): string | null {
    return this.data[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.data[key] = value;
    writeFileSync(this.path, JSON.stringify(this.data), { mode: 0o600 });
  }
  removeItem(key: string): void {
    delete this.data[key];
    writeFileSync(this.path, JSON.stringify(this.data), { mode: 0o600 });
  }
}
