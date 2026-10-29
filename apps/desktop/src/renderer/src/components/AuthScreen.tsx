import type { BackendConfig } from '@a-bot/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useState, type FormEvent } from 'react';
import { friendlyError, isHosted } from '../lib/backend';
import { GateSide } from './GateSide';
import { t } from '../lib/i18n';

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
      else if (!data.session) setInfo(t('We sent you a confirmation link. Click it, then sign in here.'));
    }
    setBusy(false);
  }

  const host = new URL(backend.url).host;
  return (
    <div className="gate">
      <GateSide />
      <main className="gate-main">
        <form className="gate-card" onSubmit={submit}>
          <h1>{mode === 'signin' ? t('Sign in') : t('Create account')}</h1>
          <p className="lede">
            {t('Server')}: {isHosted(backend) ? t('a-bot account') : host}.{' '}
            <button type="button" className="btn-link" onClick={onChangeBackend} style={{ border: 0, background: 'none', padding: 0, color: 'var(--accent)' }}>
              {t('Change')}
            </button>
          </p>
          <label className="field">
            <span>{t('Email')}</span>
            <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </label>
          <label className="field">
            <span>{t('Password')}</span>
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
            {busy ? t('One moment…') : mode === 'signin' ? t('Sign in') : t('Create account')}
          </button>
          <p className="gate-switch">
            {mode === 'signin' ? t('New here?') : t('Already have an account?')}{' '}
            <button type="button" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
              {mode === 'signin' ? t('Create account') : t('Sign in')}
            </button>
          </p>
        </form>
      </main>
    </div>
  );
}
