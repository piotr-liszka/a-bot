import { isDeviceOnline, normalizePairingCode, type DeviceRow } from '@a-bot/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Check, Copy, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { activeBackend, friendlyError } from '../lib/backend';
import { botState, relativeSeen } from '../lib/format';
import { BotAvatar } from './BotAvatar';

interface Props {
  db: SupabaseClient;
  devices: DeviceRow[];
  loading: boolean;
  now: number;
  onPaired: (device: DeviceRow) => void;
}

export function DevicesPage({ db, devices, loading, now, onPaired }: Props) {
  const first = !loading && devices.length === 0;
  return (
    <main className="chat">
      <div className="page">
        <div className="page-inner">
          <div>
            <div className="page-head">
              <h1>{first ? 'Dodaj swoje pierwsze urządzenie' : 'Urządzenia'}</h1>
            </div>
            <p className="page-lede">
              Urządzenie to dowolny komputer lub serwer z Dockerem. Działa na nim jeden wspólny kontener z Linuksem, w którym pracują wszystkie boty.
              Twój katalog jest w nim widoczny jako <code>/workspace</code>.
            </p>
          </div>
          {loading && <div className="skeleton" style={{ height: 120 }} />}
          {devices.map((d) => (
            <DeviceCard key={d.id} db={db} device={d} online={isDeviceOnline(d, now)} now={now} />
          ))}
          <PairForm db={db} onPaired={onPaired} />
        </div>
      </div>
    </main>
  );
}

function DeviceCard({ db, device, online, now }: { db: SupabaseClient; device: DeviceRow; online: boolean; now: number }) {
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
cat > .env <<'ENV'
A_BOT_SUPABASE_URL=${backend?.url ?? ''}
A_BOT_SUPABASE_ANON_KEY=${backend?.anonKey ?? ''}
A_BOT_DEVICE_NAME=Mój serwer
A_BOT_WORKSPACE_DIR=./workspace
ENV
docker compose up -d --build`;

  return (
    <section className="pair" aria-labelledby="pair-title">
      <h2 id="pair-title">Dodaj urządzenie</h2>
      <ol className="pair-steps">
        <li>
          <div>
            <strong>Uruchom kontener a-bot na urządzeniu</strong>
            <p>Potrzebujesz Dockera. Adres serwera i klucz są już wpisane.</p>
            <CopyBlock text={setup} />
          </div>
        </li>
        <li>
          <div>
            <strong>Odczytaj kod parowania</strong>
            <CopyBlock text="docker compose logs a-bot | grep -A1 'Kod parowania'" />
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
