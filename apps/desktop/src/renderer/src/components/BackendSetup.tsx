import type { BackendConfig } from '@a-bot/shared';
import { useState, type FormEvent } from 'react';
import { hostedBackend, probeBackend } from '../lib/backend';
import { GateSide } from './GateSide';
import { t } from '../lib/i18n';

export function BackendSetup({ initial, onDone, onCancel }: { initial?: BackendConfig; onDone: (cfg: BackendConfig) => void; onCancel?: () => void }) {
  const hosted = hostedBackend();
  const [url, setUrl] = useState(initial?.url ?? '');
  const [anonKey, setAnonKey] = useState(initial?.anonKey ?? '');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const cfg = { url: url.trim().replace(/\/$/, ''), anonKey: anonKey.trim() };
    if (!/^https?:\/\//.test(cfg.url)) return setError(t('The address must start with https:// (or http:// for a local server).'));
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
          <h1>{t('Connect to an a-bot server')}</h1>
          <p className="lede">{t('The server keeps your chat history and connects the app with your devices.')}</p>
          {hosted && (
            <>
              <button type="button" className="btn btn-primary" onClick={() => onDone(hosted)}>
                {t('Use an a-bot account')}
              </button>
              <p className="hint">{t('Or use your own Supabase server:')}</p>
            </>
          )}
          <label className="field">
            <span>{t('Server address')}</span>
            <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-project.supabase.co" autoFocus={!hosted} required />
          </label>
          <label className="field">
            <span>{t('Public key')}</span>
            <input className="input" value={anonKey} onChange={(e) => setAnonKey(e.target.value)} placeholder={t('sb_publishable_… or the anon key')} required />
          </label>
          <p className="hint">{t('Find both in Supabase under Project Settings → API. The key is public; database rules protect access.')}</p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={hosted ? 'btn' : 'btn btn-primary'} disabled={busy}>
              {busy ? t('Checking…') : t('Connect')}
            </button>
            {onCancel && (
              <button type="button" className="btn btn-ghost" onClick={onCancel}>
                {t('Cancel')}
              </button>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}
