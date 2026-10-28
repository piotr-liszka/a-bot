import { isDeviceOnline, normalizePairingCode, type DeviceRow } from '@a-bot/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Check, Copy, KeyRound, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { activeBackend, friendlyError } from '../lib/backend';
import { bridge, type WorkerInfo } from '../lib/desktopApi';
import { botState, relativeSeen } from '../lib/format';
import { BotAvatar } from './BotAvatar';
import { WorkerForm } from './WorkerForm';

interface Props {
  db: SupabaseClient;
  devices: DeviceRow[];
  loading: boolean;
  now: number;
  workers: WorkerInfo[];
  onWorkersChanged: () => void;
  onPaired: (device: DeviceRow) => void;
}

export function DevicesPage({ db, devices, loading, now, workers, onWorkersChanged, onPaired }: Props) {
  const first = !loading && devices.length === 0;
  const ssh = Boolean(bridge());
  return (
    <main className="chat">
      <div className="page">
        <div className="page-inner">
          <div>
            <div className="page-head">
              <h1>{first ? 'Dodaj swojego pierwszego workera' : 'Workery'}</h1>
            </div>
            <p className="page-lede">
              Worker to dowolny komputer lub serwer z Dockerem. Działa na nim jeden wspólny sandbox z Linuksem, pulpitem i przeglądarką, w którym pracują
              wszystkie boty. Wybrany katalog jest w nim widoczny jako <code>/workspace</code>.
            </p>
          </div>
          {loading && <div className="skeleton" style={{ height: 120 }} />}
          {devices.map((d) => (
            <DeviceCard
              key={d.id}
              db={db}
              device={d}
              online={isDeviceOnline(d, now)}
              now={now}
              worker={workers.find((w) => w.deviceId === d.id)}
              onWorkersChanged={onWorkersChanged}
            />
          ))}
          {ssh ? (
            <>
              <section className="pair" aria-labelledby="add-worker">
                <div>
                  <h2 id="add-worker">Dodaj workera przez SSH</h2>
                  <p className="page-lede">Połączę się z komputerem, zbuduję tam sandbox i sparuję go z Twoim kontem. Wystarczy, że ma Dockera.</p>
                </div>
                <WorkerForm
                  key={devices.length}
                  db={db}
                  onDone={(d) => {
                    onWorkersChanged();
                    onPaired(d);
                  }}
                />
              </section>
              <details className="manual">
                <summary>Sandbox uruchomiony ręcznie? Sparuj kodem</summary>
                <PairForm db={db} onPaired={onPaired} />
              </details>
            </>
          ) : (
            <PairForm db={db} onPaired={onPaired} />
          )}
        </div>
      </div>
    </main>
  );
}

interface CardProps {
  db: SupabaseClient;
  device: DeviceRow;
  online: boolean;
  now: number;
  worker?: WorkerInfo;
  onWorkersChanged: () => void;
}

function DeviceCard({ db, device, online, now, worker, onWorkersChanged }: CardProps) {
  const [editingSsh, setEditingSsh] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(device.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    await db.from('devices').update({ refresh_requested_at: new Date().toISOString() }).eq('id', device.id);
    setTimeout(() => setRefreshing(false), 2500);
  }
  async function rename(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) await db.from('devices').update({ name: name.trim() }).eq('id', device.id);
    setRenaming(false);
  }

  const details = [device.hostname, device.platform, device.agent_version && `agent ${device.agent_version}`].filter(Boolean).join(' · ');
  return (
    <section className="device" aria-label={device.name}>
      <div className="device-head">
        <span className={`dot ${online ? 'on' : 'off'}`} aria-hidden />
        <div className="meta">
          {renaming ? (
            <form onSubmit={rename} style={{ display: 'flex', gap: 8 }}>
              <input className="input" style={{ height: 30, maxWidth: 260 }} value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} aria-label="Nazwa urządzenia" />
              <button className="btn btn-sm btn-primary">Zapisz</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setRenaming(false)}>
                Anuluj
              </button>
            </form>
          ) : (
            <div className="name">{device.name}</div>
          )}
          <div className="sub">
            {online ? 'Online' : `Offline, ostatnio ${relativeSeen(device.last_seen, now)}`}
            {details ? ` · ${details}` : ''}
          </div>
        </div>
        <button className="icon-btn" onClick={refresh} disabled={!online || refreshing} title="Wykryj boty ponownie" aria-label="Wykryj boty ponownie">
          <RefreshCw size={15} style={refreshing ? { animation: 'spin 1s linear infinite' } : undefined} />
        </button>
        <button className="icon-btn" onClick={() => setRenaming(true)} title="Zmień nazwę" aria-label="Zmień nazwę">
          <Pencil size={15} />
        </button>
        {confirmDelete ? (
          <>
            <button className="btn btn-sm btn-danger" onClick={() => db.from('devices').delete().eq('id', device.id)}>
              Usuń z historią
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setConfirmDelete(false)}>
              Anuluj
            </button>
          </>
        ) : (
          <button className="icon-btn" onClick={() => setConfirmDelete(true)} title="Usuń urządzenie" aria-label="Usuń urządzenie">
            <Trash2 size={15} />
          </button>
        )}
      </div>
      {device.providers.length > 0 ? (
        <table className="providers">
          <thead>
            <tr>
              <th>Bot</th>
              <th>Stan</th>
              <th>Wersja</th>
            </tr>
          </thead>
          <tbody>
            {device.providers.map((p) => {
              const s = botState(p);
              return (
                <tr key={p.id}>
                  <td>
                    <div className="bot-cell">
                      <BotAvatar bot={p} size="sm" /> {p.name}
                    </div>
                    {p.setupHint && s.tone !== 'on' && (
                      <div className="setup-hint">
                        <HintText hint={p.setupHint} />
                      </div>
                    )}
                    {p.setupHint && s.tone === 'on' && <div className="setup-hint">{p.setupHint}</div>}
                  </td>
                  <td>
                    <span className="state">
                      <span className={`dot ${s.tone}`} aria-hidden /> {s.label}
                    </span>
                  </td>
                  <td className="tabular">{p.version ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="hint" style={{ padding: '0 16px 14px' }}>
          Agent jeszcze nie przysłał listy botów.
        </p>
      )}
      {bridge() && (
        <div className="device-ssh">
          <KeyRound size={14} aria-hidden />
          <span className="grow">{worker ? `SSH: ${worker.username}@${worker.host}${worker.port !== 22 ? `:${worker.port}` : ''}` : 'Brak dostępu SSH z tego komputera (pulpit i terminal niedostępne)'}</span>
          <button className="btn btn-sm" onClick={() => setEditingSsh((v) => !v)}>
            {editingSsh ? 'Zamknij' : worker ? 'Zainstaluj ponownie' : 'Połącz przez SSH'}
          </button>
          {worker && (
            <button
              className="btn btn-sm btn-ghost"
              onClick={async () => {
                await bridge()!.workers.remove(worker.id);
                onWorkersChanged();
              }}
            >
              Zapomnij SSH
            </button>
          )}
        </div>
      )}
      {editingSsh && (
        <div className="device-edit">
          <WorkerForm
            db={db}
            device={device}
            worker={worker}
            onDone={() => {
              setEditingSsh(false);
              onWorkersChanged();
            }}
            onCancel={() => setEditingSsh(false)}
          />
        </div>
      )}
    </section>
  );
}

/** "Zaloguj: docker exec -it a-bot claude auth login" → label + copyable command. */
function HintText({ hint }: { hint: string }) {
  const m = hint.match(/^(.+?):\s+(.+)$/);
  if (!m || !/[a-z]+ /.test(m[2])) return <>{hint}</>;
  return (
    <>
      {m[1]}: <code>{m[2]}</code>
    </>
  );
}

function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <pre className="cmd">
      {text}
      <button
        className="icon-btn"
        aria-label="Kopiuj"
        title="Kopiuj"
        onClick={() => {
          navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </button>
    </pre>
  );
}

function PairForm({ db, onPaired }: { db: SupabaseClient; onPaired: (d: DeviceRow) => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const backend = activeBackend();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const normalized = normalizePairingCode(code);
    if (normalized.length !== 6) return setError('Kod ma 6 znaków, np. K7P 2QX.');
    setBusy(true);
    setError(undefined);
    const { data, error } = await db.rpc('claim_pairing', { p_code: normalized }).single<DeviceRow>();
    setBusy(false);
    if (error) return setError(/wygasł|nieprawidłowy/i.test(error.message) ? 'Kod jest nieprawidłowy albo wygasł. Agent pokazuje nowy kod co 15 minut.' : friendlyError(error));
    setCode('');
    onPaired(data);
  }

  const setup = `git clone https://github.com/piotr-liszka/a-bot && cd a-bot
npm install && npm run box:pack && cd dist/box
cat > .env <<'ENV'
A_BOT_SUPABASE_URL=${backend?.url ?? ''}
A_BOT_SUPABASE_ANON_KEY=${backend?.anonKey ?? ''}
A_BOT_DEVICE_NAME=Mój serwer
A_BOT_WORKSPACE_DIR=$HOME/a-bot-workspace
ENV
docker compose -p a-bot up -d --build`;

  return (
    <section className="pair" aria-labelledby="pair-title">
      <h2 id="pair-title">Dodaj urządzenie</h2>
      <ol className="pair-steps">
        <li>
          <div>
            <strong>Uruchom sandbox na workerze</strong>
            <p>Potrzebujesz Dockera. Adres serwera i klucz są już wpisane.</p>
            <CopyBlock text={setup} />
          </div>
        </li>
        <li>
          <div>
            <strong>Odczytaj kod parowania</strong>
            <CopyBlock text="docker logs a-bot 2>&1 | grep 'Kod parowania'" />
          </div>
        </li>
        <li>
          <div>
            <strong>Wpisz kod</strong>
            <form className="code-form" onSubmit={submit}>
              <input
                className="input code-input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ABC 123"
                maxLength={8}
                aria-label="Kod parowania"
                aria-invalid={Boolean(error)}
                autoComplete="off"
                spellCheck={false}
              />
              <button className="btn btn-primary" disabled={busy || normalizePairingCode(code).length < 6}>
                {busy ? 'Paruję…' : 'Sparuj'}
              </button>
            </form>
            {error && (
              <p className="form-error" role="alert" style={{ marginTop: 8 }}>
                {error}
              </p>
            )}
          </div>
        </li>
        <li>
          <div>
            <strong>Zaloguj boty w kontenerze (raz)</strong>
            <p>Logowanie zostaje w wolumenie kontenera. Ollama na hoście jest wykrywana automatycznie.</p>
            <CopyBlock text={'docker exec -it a-bot claude auth login\ndocker exec -it a-bot codex login --device-auth'} />
          </div>
        </li>
      </ol>
    </section>
  );
}
