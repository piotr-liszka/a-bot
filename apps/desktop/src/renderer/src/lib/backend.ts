import type { BackendConfig } from '@a-bot/shared';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { t } from './i18n';

const STORAGE_KEY = 'a-bot.backend';

/** Hosted a-bot backend baked in at build time (A_BOT_PUBLIC_SUPABASE_URL / _ANON_KEY). */
export function hostedBackend(): BackendConfig | undefined {
  const url = import.meta.env.A_BOT_PUBLIC_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.A_BOT_PUBLIC_SUPABASE_ANON_KEY as string | undefined;
  return url && anonKey ? { url, anonKey } : undefined;
}

export function savedBackend(): BackendConfig | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BackendConfig) : undefined;
  } catch {
    return undefined;
  }
}

export function saveBackend(cfg: BackendConfig | undefined) {
  if (cfg) localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  else localStorage.removeItem(STORAGE_KEY);
}

export function activeBackend(): BackendConfig | undefined {
  return savedBackend() ?? hostedBackend();
}

export function isHosted(cfg: BackendConfig): boolean {
  const hosted = hostedBackend();
  return Boolean(hosted && hosted.url === cfg.url);
}

let client: SupabaseClient | undefined;
let clientUrl: string | undefined;

export function getClient(cfg: BackendConfig): SupabaseClient {
  if (!client || clientUrl !== cfg.url) {
    client = createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: `a-bot.auth.${new URL(cfg.url).host}` },
    });
    clientUrl = cfg.url;
  }
  return client;
}

/** Checks that a URL + key pair answers like a Supabase project with the a-bot schema. */
export async function probeBackend(cfg: BackendConfig): Promise<string | undefined> {
  try {
    const res = await fetch(`${cfg.url.replace(/\/$/, '')}/rest/v1/devices?select=id&limit=1`, {
      headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}` },
    });
    if (res.status === 401 || res.status === 403) return t('The server rejected the key. Check the public (anon/publishable) key.');
    if (res.status === 404) return t('The server works but has no a-bot schema. Run the migrations from supabase/.');
    if (!res.ok) return t('The server answered with error {status}.', { status: res.status });
    return undefined;
  } catch {
    return t('Cannot connect to this address.');
  }
}

export function friendlyError(err: { message?: string } | null | undefined): string {
  const msg = err?.message ?? t('Something went wrong.');
  if (/Invalid login credentials/i.test(msg)) return t('Wrong email or password.');
  if (/User already registered/i.test(msg)) return t('An account with this email already exists. Sign in.');
  if (/Password should be at least/i.test(msg)) return t('The password needs at least 6 characters.');
  if (/Email not confirmed/i.test(msg)) return t('Confirm your email with the link we sent, then sign in.');
  if (/Failed to fetch/i.test(msg)) return t('No connection to the server.');
  return t(msg);
}
