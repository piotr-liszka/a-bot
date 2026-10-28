import type { BackendConfig } from '@a-bot/shared';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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
    if (res.status === 401 || res.status === 403) return 'Serwer odrzucił klucz. Sprawdź klucz publiczny (anon/publishable).';
    if (res.status === 404) return 'Serwer działa, ale nie ma schematu a-bot. Uruchom migracje z katalogu supabase/.';
    if (!res.ok) return `Serwer odpowiedział błędem ${res.status}.`;
    return undefined;
  } catch {
    return 'Nie mogę połączyć się z tym adresem.';
  }
}

export function friendlyError(err: { message?: string } | null | undefined): string {
  const msg = err?.message ?? 'Coś poszło nie tak.';
  if (/Invalid login credentials/i.test(msg)) return 'Nieprawidłowy e-mail lub hasło.';
  if (/User already registered/i.test(msg)) return 'Konto z tym adresem już istnieje. Zaloguj się.';
  if (/Password should be at least/i.test(msg)) return 'Hasło musi mieć co najmniej 6 znaków.';
  if (/Email not confirmed/i.test(msg)) return 'Potwierdź adres e-mail linkiem z wiadomości, a potem się zaloguj.';
  if (/Failed to fetch/i.test(msg)) return 'Brak połączenia z serwerem.';
  return msg;
}
