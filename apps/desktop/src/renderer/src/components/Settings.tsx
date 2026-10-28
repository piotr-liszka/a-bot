import { isDeviceOnline, type DeviceRow, type ProviderInfo } from '@a-bot/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { KeyRound, LogOut, RefreshCw, Server, SquareTerminal, UserRound, X } from 'lucide-react';
import { useState } from 'react';
import { activeBackend, isHosted } from '../lib/backend';
import { bridge, bridgeError, type TerminalKind, type WorkerInfo } from '../lib/desktopApi';
import { botState } from '../lib/format';
import { BotAvatar } from './BotAvatar';
import { Xterm, type XtermState } from './Xterm';

export type SettingsSection = 'devices' | 'accounts' | 'terminal' | 'account';

const SECTIONS: { id: SettingsSection; label: string; Icon: typeof Server; desktopOnly?: boolean }[] = [
  { id: 'devices', label: 'Urządzenia', Icon: Server },
  { id: 'accounts', label: 'Konta modeli', Icon: KeyRound },
  { id: 'terminal', label: 'Terminal', Icon: SquareTerminal, desktopOnly: true },
  { id: 'account', label: 'Konto', Icon: UserRound },
];

export function SettingsNav({ section, onSelect }: { section: SettingsSection; onSelect: (s: SettingsSection) => void }) {
  const desktop = Boolean(bridge());
  return (
    <aside className="list" aria-label="Ustawienia">
      <div className="list-head">
        <div className="list-title">
          <h2>Ustawienia</h2>
        </div>
      </div>
      <nav className="settings-nav">
        {SECTIONS.filter((s) => desktop || !s.desktopOnly).map(({ id, label, Icon }) => (
          <button key={id} className="settings-link" aria-current={section === id} onClick={() => onSelect(id)}>
            <Icon size={15} aria-hidden /> {label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

/** Engines that can log in from the app, and the terminal command each one runs. */
const LOGIN: Partial<Record<ProviderInfo['kind'], { terminal: TerminalKind; logout: 'claude-logout' | 'codex-logout'; note: string }>> = {
  claude: { terminal: 'claude-login', logout: 'claude-logout', note: 'Otworzy się link do logowania. Po zalogowaniu wklej kod z przeglądarki tutaj i naciśnij Enter.' },
  codex: { terminal: 'codex-login', logout: 'codex-logout', note: 'Otwórz link, wpisz pokazany kod i potwierdź logowanie w przeglądarce.' },
};

export function AccountsPage({ db, devices, now, workers, onOpenDevices }: { db: SupabaseClient; devices: DeviceRow[]; now: number; workers: WorkerInfo[]; onOpenDevices: () => void }) {
  return (
    <main className="chat">
      <div className="page">
        <div className="page-inner">
          <div>
            <h1>Konta modeli</h1>
            <p className="page-lede">
              Silniki, na których działają Twoje boty. Logowanie zostaje w sandboxie na workerze, więc robisz je raz na urządzenie. Ollama i własne CLI nie wymagają
              logowania.
            </p>
          </div>
          {devices.length === 0 && (
            <p className="hint">
              Nie masz jeszcze urządzeń.{' '}
              <button className="link-btn" onClick={onOpenDevices}>
                Dodaj workera
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
      setMessage(`${engine.name}: wylogowano.`);
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
          <div className="sub">{online ? 'Online' : 'Offline: stan logowania może być nieaktualny'}</div>
        </div>
        <button className="btn btn-sm" onClick={refresh} disabled={!online || refreshing}>
          <RefreshCw size={14} aria-hidden className={refreshing ? 'spin' : undefined} /> Sprawdź ponownie
        </button>
      </div>
      {device.providers.length === 0 ? (
        <p className="hint" style={{ padding: '0 16px 14px' }}>
          Agent jeszcze nie przysłał listy silników.
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
                    <span className={`dot ${s.tone}`} aria-hidden /> {s.tone === 'on' && spec ? 'Zalogowano' : s.label}
                  </span>
                  {!spec && s.tone !== 'on' && p.setupHint && <span className="setup-hint">{p.setupHint}</span>}
                </div>
                {spec && p.installed && worker && (
                  <div className="actions">
                    <button
                      className={`btn btn-sm${s.tone === 'on' ? '' : ' btn-primary'}`}
                      disabled={!online || login?.engine === p.id}
                      onClick={() => setLogin({ engine: p.id, kind: spec.terminal, note: spec.note, state: { kind: 'connecting' } })}
                    >
                      {s.tone === 'on' ? 'Zaloguj ponownie' : 'Zaloguj'}
                    </button>
                    {s.tone === 'on' && (
                      <button className="btn btn-sm btn-ghost" disabled={!online} onClick={() => logout(p)}>
                        Wyloguj
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
          Logowanie z aplikacji wymaga dostępu SSH do tego urządzenia.{' '}
          <button className="link-btn" onClick={onOpenDevices}>
            Połącz przez SSH w Urządzeniach
          </button>
        </p>
      )}
      {!bridge() && <p className="hint device-note">Logowanie silników jest dostępne w aplikacji desktopowej.</p>}
      {message && <p className="hint device-note">{message}</p>}
      {login && worker && (
        <div className="login-term">
          <div className="login-term-head">
            <span className="grow">{login.state.kind === 'closed' ? 'Logowanie zakończone. Sprawdzam stan…' : login.note}</span>
            <button
              className="icon-btn"
              aria-label="Zamknij"
              title="Zamknij"
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
          <h1>Konto</h1>
          <dl className="facts">
            <dt>E-mail</dt>
            <dd>{email}</dd>
            <dt>Serwer</dt>
            <dd>{backend ? (isHosted(backend) ? 'a-bot (hostowany)' : backend.url) : '—'}</dd>
          </dl>
          <div className="form-actions">
            <button className="btn" onClick={() => db.auth.signOut()}>
              <LogOut size={14} aria-hidden /> Wyloguj
            </button>
            <button className="btn btn-ghost" onClick={onChangeBackend}>
              Zmień serwer
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
