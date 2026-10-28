import type { BackendConfig } from '@a-bot/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useState, type FormEvent } from 'react';
import { friendlyError, isHosted } from '../lib/backend';
import { GateSide } from './GateSide';

export function AuthScreen({ db, backend, onChangeBackend }: { db: SupabaseClient; backend: BackendConfig; onChangeBackend: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [info, setInfo] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    setInfo(undefined);
    if (mode === 'signin') {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) setError(friendlyError(error));
    } else {
      const { data, error } = await db.auth.signUp({ email, password });
      if (error) setError(friendlyError(error));
      else if (!data.session) setInfo('Wysłaliśmy link potwierdzający. Kliknij go, a potem zaloguj się tutaj.');
    }
    setBusy(false);
  }

  const host = new URL(backend.url).host;
  return (
    <div className="gate">
      <GateSide />
      <main className="gate-main">
        <form className="gate-card" onSubmit={submit}>
          <h1>{mode === 'signin' ? 'Zaloguj się' : 'Załóż konto'}</h1>
          <p className="lede">
            Serwer: {isHosted(backend) ? 'konto a-bot' : host}.{' '}
            <button type="button" className="btn-link" onClick={onChangeBackend} style={{ border: 0, background: 'none', padding: 0, color: 'var(--accent)' }}>
              Zmień
            </button>
          </p>
          <label className="field">
            <span>E-mail</span>
            <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </label>
          <label className="field">
            <span>Hasło</span>
            <input
              className="input"
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {info && <p className="hint">{info}</p>}
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Chwileczkę…' : mode === 'signin' ? 'Zaloguj się' : 'Załóż konto'}
          </button>
          <p className="gate-switch">
            {mode === 'signin' ? 'Pierwszy raz tutaj? ' : 'Masz już konto? '}
            <button type="button" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
              {mode === 'signin' ? 'Załóż konto' : 'Zaloguj się'}
            </button>
          </p>
        </form>
      </main>
    </div>
  );
}
