import { isDeviceOnline, type DeviceRow, type ProviderInfo } from '@a-bot/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { KeyRound, LogOut, RefreshCw, Server, SquareTerminal, UserRound, X } from 'lucide-react';
import { useState } from 'react';
import { activeBackend, isHosted } from '../lib/backend';
import { bridge, bridgeError, type TerminalKind, type WorkerInfo } from '../lib/desktopApi';
import { botState } from '../lib/format';
import { BotAvatar } from './BotAvatar';
import { BotIconPicker } from './BotIconPicker';
import { Xterm, type XtermState } from './Xterm';
import { lang, LANGS, setLang, t, type Lang } from '../lib/i18n';

export type SettingsSection = 'devices' | 'accounts' | 'terminal' | 'account';

const SECTIONS: { id: SettingsSection; label: string; Icon: typeof Server; desktopOnly?: boolean }[] = [
  { id: 'devices', label: 'Devices', Icon: Server },
  { id: 'accounts', label: 'Model accounts', Icon: KeyRound },
  { id: 'terminal', label: 'Terminal', Icon: SquareTerminal, desktopOnly: true },
  { id: 'account', label: 'Account', Icon: UserRound },
];

export function SettingsNav({ section, onSelect }: { section: SettingsSection; onSelect: (s: SettingsSection) => void }) {
  const desktop = Boolean(bridge());
  return (
    <aside className="list" aria-label={t('Settings')}>
      <div className="list-head">
        <div className="list-title">
          <h2>{t('Settings')}</h2>
        </div>
      </div>
      <nav className="settings-nav">
        {SECTIONS.filter((s) => desktop || !s.desktopOnly).map(({ id, label, Icon }) => (
          <button key={id} className="settings-link" aria-current={section === id} onClick={() => onSelect(id)}>
            <Icon size={15} aria-hidden /> {t(label)}
          </button>
        ))}
      </nav>
    </aside>
  );
}

/** Engines that can log in from the app, and the terminal command each one runs. */
const LOGIN: Partial<Record<ProviderInfo['kind'], { terminal: TerminalKind; logout: 'claude-logout' | 'codex-logout'; note: string }>> = {
  claude: { terminal: 'claude-login', logout: 'claude-logout', note: 'A sign-in link opens. After signing in, paste the code from the browser here and press Enter.' },
  codex: { terminal: 'codex-login', logout: 'codex-logout', note: 'Open the link, enter the code shown and confirm in the browser.' },
};

export function AccountsPage({ db, devices, now, workers, onOpenDevices }: { db: SupabaseClient; devices: DeviceRow[]; now: number; workers: WorkerInfo[]; onOpenDevices: () => void }) {
  return (
    <main className="chat">
      <div className="page">
        <div className="page-inner">
          <div>
            <h1>{t('Model accounts')}</h1>
            <p className="page-lede">
              {t('The engines your bots run on. Sign-ins stay in the sandbox on the worker, so you do this once per device. Ollama and custom CLIs need no sign-in.')}
            </p>
          </div>
          {devices.length === 0 && (
            <p className="hint">
              {t('You have no devices yet.')}{' '}
              <button className="link-btn" onClick={onOpenDevices}>
                {t('Add a worker')}
              </button>
            </p>
          )}
          {devices.map((d) => (
            <DeviceAccounts key={d.id} db={db} device={d} online={isDeviceOnline(d, now)} worker={workers.find((w) => w.deviceId === d.id)} onOpenDevices={onOpenDevices} />
          ))}
        </div>
      </div>
    </main>
  );
}

function DeviceAccounts({ db, device, online, worker, onOpenDevices }: { db: SupabaseClient; device: DeviceRow; online: boolean; worker?: WorkerInfo; onOpenDevices: () => void }) {
  const [login, setLogin] = useState<{ engine: string; kind: TerminalKind; note: string; state: XtermState }>();
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string>();

  async function refresh() {
    setRefreshing(true);
    await db.from('devices').update({ refresh_requested_at: new Date().toISOString() }).eq('id', device.id);
    setTimeout(() => setRefreshing(false), 2500);
  }

  async function logout(engine: ProviderInfo) {
    const spec = LOGIN[engine.kind];
    if (!spec || !worker) return;
    setMessage(undefined);
    try {
      await bridge()!.workers.exec(worker.id, spec.logout);
      setMessage(t('{engine}: signed out.', { engine: engine.name }));
    } catch (err) {
      setMessage(bridgeError(err));
    }
    refresh();
  }

  return (
    <section className="device" aria-label={device.name}>
      <div className="device-head">
        <span className={`dot ${online ? 'on' : 'off'}`} aria-hidden />
        <div className="meta">
          <div className="name">{device.name}</div>
          <div className="sub">{online ? t('Online') : t('Offline: sign-in state may be out of date')}</div>
        </div>
        <button className="btn btn-sm" onClick={refresh} disabled={!online || refreshing}>
          <RefreshCw size={14} aria-hidden className={refreshing ? 'spin' : undefined} /> {t('Check again')}
        </button>
      </div>
      {device.providers.length === 0 ? (
        <p className="hint" style={{ padding: '0 16px 14px' }}>
          {t('The agent has not reported its engines yet.')}
        </p>
      ) : (
        <ul className="engine-list">
          {device.providers.map((p) => {
            const s = botState(p);
            const spec = LOGIN[p.kind];
            return (
              <li key={p.id} className="engine-row">
                <BotAvatar bot={p} size="sm" />
                <div className="meta">
                  <span className="name">
                    {p.name}
                    {p.version && <span className="tabular version"> {p.version}</span>}
                  </span>
                  <span className="state">
                    <span className={`dot ${s.tone}`} aria-hidden /> {s.tone === 'on' && spec ? t('Signed in') : s.label}
                  </span>
                  {!spec && s.tone !== 'on' && p.setupHint && <span className="setup-hint">{t(p.setupHint)}</span>}
                </div>
                {spec && p.installed && worker && (
                  <div className="actions">
                    <button
                      className={`btn btn-sm${s.tone === 'on' ? '' : ' btn-primary'}`}
                      disabled={!online || login?.engine === p.id}
                      onClick={() => setLogin({ engine: p.id, kind: spec.terminal, note: spec.note, state: { kind: 'connecting' } })}
                    >
                      {s.tone === 'on' ? t('Sign in again') : t('Sign in')}
                    </button>
                    {s.tone === 'on' && (
                      <button className="btn btn-sm btn-ghost" disabled={!online} onClick={() => logout(p)}>
                        {t('Sign out')}
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!worker && bridge() && device.providers.some((p) => LOGIN[p.kind]) && (
        <p className="hint device-note">
          {t('Signing in from the app needs SSH access to this device.')}{' '}
          <button className="link-btn" onClick={onOpenDevices}>
            {t('Connect over SSH in Devices')}
          </button>
        </p>
      )}
      {!bridge() && <p className="hint device-note">{t('Engine sign-in is available in the desktop app.')}</p>}
      {message && <p className="hint device-note">{message}</p>}
      {login && worker && (
        <div className="login-term">
          <div className="login-term-head">
            <span className="grow">{login.state.kind === 'closed' ? t('Sign-in finished. Checking…') : t(login.note)}</span>
            <button
              className="icon-btn"
              aria-label={t('Close')}
              title={t('Close')}
              onClick={() => {
                setLogin(undefined);
                refresh();
              }}
            >
              <X size={15} />
            </button>
          </div>
          {login.state.kind === 'closed' && login.state.error && <p className="form-error device-note">{login.state.error}</p>}
          <div className="terminal-stage login-stage">
            <Xterm
              workerId={worker.id}
              kind={login.kind}
              onState={(state) => {
                setLogin((l) => (l ? { ...l, state } : l));
                if (state.kind === 'closed') refresh();
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}

export function AccountPage({ db, email, onChangeBackend }: { db: SupabaseClient; email: string; onChangeBackend: () => void }) {
  const backend = activeBackend();
  return (
    <main className="chat">
      <div className="page">
        <div className="page-inner" style={{ maxWidth: 640 }}>
          <h1>{t('Account')}</h1>
          <dl className="facts">
            <dt>{t('Email')}</dt>
            <dd>{email}</dd>
            <dt>{t('Server')}</dt>
            <dd>{backend ? (isHosted(backend) ? t('a-bot (hosted)') : backend.url) : '—'}</dd>
            <dt>{t('Language')}</dt>
            <dd>
              <select className="input select-inline" value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t('Language')}>
                {LANGS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </dd>
            <dt>{t('Bot icon')}</dt>
            <dd>
              <BotIconPicker />
            </dd>
          </dl>
          <div className="form-actions">
            <button className="btn" onClick={() => db.auth.signOut()}>
              <LogOut size={14} aria-hidden /> {t('Sign out')}
            </button>
            <button className="btn btn-ghost" onClick={onChangeBackend}>
              {t('Change server')}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
