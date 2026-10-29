import type { DeviceRow } from '@a-bot/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { activeBackend, friendlyError } from '../lib/backend';
import { bridge, bridgeError, type AuthMethod, type InstallEvent, type InstallStep, type WorkerInfo, type WorkerInput } from '../lib/desktopApi';
import { t } from '../lib/i18n';

const STEPS: { id: InstallStep; label: string }[] = [
  { id: 'connect', label: 'Connecting over SSH' },
  { id: 'docker', label: 'Checking Docker' },
  { id: 'upload', label: 'Uploading the sandbox' },
  { id: 'build', label: 'Building the image (a few minutes the first time)' },
  { id: 'start', label: 'Starting the container' },
  { id: 'pair', label: 'Pairing with your account' },
];

interface Props {
  db: SupabaseClient;
  /** Prefill and attach to an existing device instead of creating a new one. */
  device?: DeviceRow;
  worker?: WorkerInfo;
  onDone: (device: DeviceRow, worker: WorkerInfo) => void;
  onCancel?: () => void;
}

type StepState = Record<InstallStep, { status: 'idle' | 'running' | 'done' | 'error'; log?: string }>;

const idleSteps = (): StepState => Object.fromEntries(STEPS.map((s) => [s.id, { status: 'idle' }])) as StepState;

export function WorkerForm({ db, device, worker, onDone, onCancel }: Props) {
  const api = bridge()!;
  const [form, setForm] = useState<WorkerInput>({
    name: worker?.name ?? device?.name ?? '',
    host: worker?.host ?? device?.hostname ?? '',
    port: worker?.port ?? 22,
    username: worker?.username ?? '',
    auth: worker?.auth ?? 'agent',
    keyPath: worker?.keyPath ?? '~/.ssh/id_ed25519',
    secret: '',
    workspaceDir: worker?.workspaceDir ?? '~/a-bot-workspace',
  });
  const [phase, setPhase] = useState<'edit' | 'testing' | 'installing' | 'done'>('edit');
  const [testResult, setTestResult] = useState<string>();
  const [error, setError] = useState<string>();
  const [steps, setSteps] = useState<StepState>(idleSteps);
  const [log, setLog] = useState<string[]>([]);
  const workerId = useRef<string | undefined>(worker?.id);

  useEffect(
    () =>
      api.workers.onProgress((e: InstallEvent) => {
        if (e.workerId !== workerId.current) return;
        setSteps((prev) => {
          const next = { ...prev, [e.step]: { status: e.status, log: e.log ?? prev[e.step].log } };
          // Steps before the current one are done by definition.
          for (const s of STEPS) {
            if (s.id === e.step) break;
            if (next[s.id].status !== 'done') next[s.id] = { ...next[s.id], status: 'done' };
          }
          return next;
        });
        if (e.log) setLog((l) => [...l.slice(-7), e.log!]);
      }),
    [api],
  );

  const set = <K extends keyof WorkerInput>(k: K, v: WorkerInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const payload = (): WorkerInput => ({ ...form, name: form.name.trim() || form.host.trim(), host: form.host.trim(), username: form.username.trim() });

  async function test() {
    setPhase('testing');
    setError(undefined);
    setTestResult(undefined);
    try {
      const r = await api.workers.test(payload());
      setTestResult(t('Connected. Docker {version}.', { version: r.docker }));
    } catch (err) {
      setError(bridgeError(err));
    }
    setPhase('edit');
  }

  async function install(e: FormEvent) {
    e.preventDefault();
    const backend = activeBackend();
    if (!backend) return;
    setError(undefined);
    setLog([]);
    setSteps(idleSteps());
    setPhase('installing');
    try {
      const saved = await api.workers.save({ ...payload(), id: workerId.current, secret: form.secret || (worker?.hasSecret ? undefined : '') });
      workerId.current = saved.id;
      const result = await api.workers.install(saved.id, { backendUrl: backend.url, anonKey: backend.anonKey });
      let paired: DeviceRow | null = null;
      if (result.pairingCode) {
        const { data, error } = await db.rpc('claim_pairing', { p_code: result.pairingCode }).single<DeviceRow>();
        if (error) throw new Error(friendlyError(error));
        paired = data;
      } else if (result.deviceId) {
        const { data } = await db.from('devices').select('*').eq('id', result.deviceId).maybeSingle<DeviceRow>();
        if (!data) throw new Error(t('This worker is already paired with another a-bot account. Remove it there or clear the a-bot_a-bot-home volume on the worker.'));
        paired = data;
      }
      if (!paired) throw new Error(t('The agent did not report a pairing code.'));
      await api.workers.link(saved.id, paired.id);
      setSteps((s) => ({ ...s, pair: { status: 'done', log: t('Paired as “{name}”', { name: paired!.name }) } }));
      setPhase('done');
      onDone(paired, { ...saved, deviceId: paired.id });
    } catch (err) {
      setError(bridgeError(err));
      setSteps((s) => {
        const running = STEPS.find((x) => s[x.id].status === 'running');
        return running ? { ...s, [running.id]: { ...s[running.id], status: 'error' } } : s;
      });
      setPhase('edit');
    }
  }

  const busy = phase === 'testing' || phase === 'installing';
  const showProgress = phase === 'installing' || phase === 'done' || STEPS.some((s) => steps[s.id].status !== 'idle');

  return (
    <form className="worker-form" onSubmit={install}>
      <fieldset disabled={busy} className="worker-grid">
        <label className="field span-2">
          <span>{t('Worker name')}</span>
          <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder={t('e.g. BeniaminPC')} maxLength={80} />
        </label>
        <label className="field">
          <span>{t('Host')}</span>
          <input className="input" value={form.host} onChange={(e) => set('host', e.target.value)} placeholder={t('192.168.1.20 or beniamin-pc.local')} required />
        </label>
        <label className="field">
          <span>{t('Port')}</span>
          <input className="input tabular" type="number" min={1} max={65535} value={form.port} onChange={(e) => set('port', Number(e.target.value) || 22)} />
        </label>
        <label className="field">
          <span>{t('User')}</span>
          <input className="input" value={form.username} onChange={(e) => set('username', e.target.value)} placeholder="piotr" required autoComplete="off" />
        </label>
        <label className="field">
          <span>{t('Sign-in method')}</span>
          <select className="input" value={form.auth} onChange={(e) => set('auth', e.target.value as AuthMethod)}>
            <option value="agent">{t('SSH agent (ssh-agent)')}</option>
            <option value="key">{t('Key file')}</option>
            <option value="password">{t('Password')}</option>
          </select>
        </label>
        {form.auth === 'key' && (
          <>
            <label className="field">
              <span>{t('Private key')}</span>
              <input className="input" value={form.keyPath} onChange={(e) => set('keyPath', e.target.value)} />
            </label>
            <label className="field">
              <span>{t('Key passphrase')}</span>
              <input className="input" type="password" value={form.secret} onChange={(e) => set('secret', e.target.value)} placeholder={worker?.hasSecret ? t('saved') : t('if any')} />
            </label>
          </>
        )}
        {form.auth === 'password' && (
          <label className="field span-2">
            <span>{t('Password')}</span>
            <input className="input" type="password" value={form.secret} onChange={(e) => set('secret', e.target.value)} placeholder={worker?.hasSecret ? t('saved') : ''} required={!worker?.hasSecret} />
          </label>
        )}
        <label className="field span-2">
          <span>{t('Folder on the worker, visible in the sandbox as /workspace')}</span>
          <input className="input" value={form.workspaceDir} onChange={(e) => set('workspaceDir', e.target.value)} />
        </label>
      </fieldset>
      <p className="hint">{t('SSH credentials stay on this computer, encrypted. The worker only needs Docker.')}</p>

      {showProgress && (
        <div className="install">
          <ol className="install-steps">
            {STEPS.map((s) => {
              const st = steps[s.id];
              return (
                <li key={s.id} data-status={st.status}>
                  <span className="install-icon" aria-hidden>
                    {st.status === 'done' ? <Check size={13} strokeWidth={2.6} /> : st.status === 'running' ? <Loader2 size={13} className="spin" /> : st.status === 'error' ? <AlertCircle size={13} /> : null}
                  </span>
                  <span>{t(s.label)}</span>
                  {st.status !== 'idle' && st.log && s.id !== 'build' && <span className="install-log">{st.log}</span>}
                </li>
              );
            })}
          </ol>
          {phase === 'installing' && log.length > 0 && <pre className="install-tail">{log.join('\n')}</pre>}
        </div>
      )}

      {error && (
        <p className="form-error" role="alert" style={{ whiteSpace: 'pre-wrap' }}>
          {error}
        </p>
      )}
      {testResult && !error && <p className="hint ok-text">{testResult}</p>}

      <div className="form-actions">
        <button className="btn btn-primary" disabled={busy || !form.host || !form.username}>
          {phase === 'installing' ? t('Installing…') : worker ? t('Reinstall') : t('Connect and install')}
        </button>
        <button type="button" className="btn" onClick={test} disabled={busy || !form.host || !form.username}>
          {phase === 'testing' ? t('Checking…') : t('Test connection')}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={phase === 'installing'}>
            {t('Cancel')}
          </button>
        )}
      </div>
    </form>
  );
}
