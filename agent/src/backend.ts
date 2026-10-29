import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { join } from 'node:path';
import { agentHome, FileStorage, type AgentConfig } from './config.js';

export type Db = SupabaseClient;

export function createBackend(cfg: AgentConfig): Db {
  return createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      storage: new FileStorage(join(agentHome(), 'session.json')),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}

/** Returns the device id: the uid of the anonymous account this agent signs in with (created once). */
export async function ensureSignedIn(db: Db): Promise<string> {
  const { data } = await db.auth.getSession();
  if (data.session) {
    const { data: user, error } = await db.auth.getUser();
    if (!error && user.user) return user.user.id;
    // Keep the identity across network hiccups; only start over when the account is really gone.
    if (error && error.status !== 401 && error.status !== 403) throw new Error(`Cannot connect to the backend: ${error.message}`);
  }
  const { data: signIn, error } = await db.auth.signInAnonymously();
  if (error || !signIn.user) throw new Error(`Agent sign-in failed: ${error?.message ?? 'no user'}`);
  return signIn.user.id;
}
