import type { ConversationRow, DeviceRow, MessageRow } from '@a-bot/shared';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

export function useSession(db: SupabaseClient): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    db.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = db.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [db]);
  return session;
}

interface LiveOptions {
  table: 'devices' | 'conversations' | 'messages';
  column: string;
  value: string | undefined;
  orderBy: string;
  ascending: boolean;
}

/** Loads rows matching column=value and keeps them in sync through Realtime. */
function useLiveRows<T extends { id: string }>(db: SupabaseClient, opts: LiveOptions): { rows: T[]; loading: boolean; error?: string } {
  const { table, column, value, orderBy, ascending } = opts;
  const [state, setState] = useState<{ rows: T[]; loading: boolean; error?: string }>({ rows: [], loading: true });

  useEffect(() => {
    if (!value) {
      setState({ rows: [], loading: false });
      return;
    }
    let cancelled = false;
    setState({ rows: [], loading: true });
    const sort = (rows: T[]) =>
      rows.slice().sort((a, b) => {
        const x = String((a as Record<string, unknown>)[orderBy]);
        const y = String((b as Record<string, unknown>)[orderBy]);
        return ascending ? x.localeCompare(y) : y.localeCompare(x);
      });

    const load = async () => {
      const { data, error } = await db.from(table).select('*').eq(column, value).order(orderBy, { ascending });
      if (cancelled) return;
      setState({ rows: (data ?? []) as T[], loading: false, error: error?.message });
    };

    const channel = db
      .channel(`${table}:${column}:${value}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, filter: `${column}=eq.${value}` }, (payload) => {
        setState((prev) => {
          if (payload.eventType === 'DELETE') {
            const id = (payload.old as { id?: string }).id;
            return { ...prev, rows: prev.rows.filter((r) => r.id !== id) };
          }
          const row = payload.new as T;
          const exists = prev.rows.some((r) => r.id === row.id);
          const rows = exists ? prev.rows.map((r) => (r.id === row.id ? row : r)) : [...prev.rows, row];
          return { ...prev, rows: sort(rows) };
        });
      })
      .subscribe((status) => {
        // (Re)load once subscribed so nothing sent in between is missed.
        if (status === 'SUBSCRIBED') load();
      });

    return () => {
      cancelled = true;
      db.removeChannel(channel);
    };
  }, [db, table, column, value, orderBy, ascending]);

  return state;
}

export function useDevices(db: SupabaseClient, uid: string | undefined) {
  return useLiveRows<DeviceRow>(db, { table: 'devices', column: 'owner_id', value: uid, orderBy: 'created_at', ascending: true });
}

export function useConversations(db: SupabaseClient, uid: string | undefined) {
  return useLiveRows<ConversationRow>(db, { table: 'conversations', column: 'owner_id', value: uid, orderBy: 'updated_at', ascending: false });
}

export function useMessages(db: SupabaseClient, conversationId: string | undefined) {
  return useLiveRows<MessageRow>(db, { table: 'messages', column: 'conversation_id', value: conversationId, orderBy: 'created_at', ascending: true });
}

/** Re-renders every `ms` so time-based state (device online, "2 min temu") stays fresh. */
export function useNow(ms = 15_000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
