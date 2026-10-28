import type { BackendConfig } from '@a-bot/shared';
import { useState, type FormEvent } from 'react';
import { hostedBackend, probeBackend } from '../lib/backend';
import { GateSide } from './GateSide';

export function BackendSetup({ initial, onDone, onCancel }: { initial?: BackendConfig; onDone: (cfg: BackendConfig) => void; onCancel?: () => void }) {
  const hosted = hostedBackend();
  const [url, setUrl] = useState(initial?.url ?? '');
  const [anonKey, setAnonKey] = useState(initial?.anonKey ?? '');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const cfg = { url: url.trim().replace(/\/$/, ''), anonKey: anonKey.trim() };
    if (!/^https?:\/\//.test(cfg.url)) return setError('Adres musi zaczynać się od https:// (albo http:// dla lokalnego serwera).');
    setBusy(true);
    setError(undefined);
    const problem = await probeBackend(cfg);
    setBusy(false);
    if (problem) return setError(problem);
    onDone(cfg);
  }

  return (
    <div className="gate">
      <GateSide />
      <main className="gate-main">
        <form className="gate-card" onSubmit={submit}>
          <h1>Połącz z serwerem a-bot</h1>
          <p className="lede">Serwer przechowuje historię rozmów i łączy aplikację z Twoimi urządzeniami.</p>
          {hosted && (
            <>
              <button type="button" className="btn btn-primary" onClick={() => onDone(hosted)}>
                Użyj konta a-bot
              </button>
              <p className="hint">Albo podaj własny serwer Supabase:</p>
            </>
          )}
          <label className="field">
            <span>Adres serwera</span>
            <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://twoj-projekt.supabase.co" autoFocus={!hosted} required />
          </label>
          <label className="field">
            <span>Klucz publiczny</span>
            <input className="input" value={anonKey} onChange={(e) => setAnonKey(e.target.value)} placeholder="sb_publishable_… albo klucz anon" required />
          </label>
          <p className="hint">Znajdziesz je w Supabase w Project Settings → API. Ten klucz jest publiczny, dostęp chronią reguły bazy.</p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={hosted ? 'btn' : 'btn btn-primary'} disabled={busy}>
              {busy ? 'Sprawdzam…' : 'Połącz'}
            </button>
            {onCancel && (
              <button type="button" className="btn btn-ghost" onClick={onCancel}>
                Anuluj
              </button>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}
