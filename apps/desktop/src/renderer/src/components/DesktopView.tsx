import type { DeviceRow } from '@a-bot/shared';
import RFB from '@novnc/novnc';
import { Globe, Maximize2, RotateCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { bridge, bridgeError, type WorkerInfo } from '../lib/desktopApi';

type Status = { kind: 'connecting' } | { kind: 'connected' } | { kind: 'error'; message: string };

/** The sandbox's Linux desktop, streamed over an SSH tunnel with noVNC. */
export function DesktopView({ device, worker }: { device: DeviceRow; worker: WorkerInfo }) {
  const api = bridge()!;
  const screen = useRef<HTMLDivElement>(null);
  const rfb = useRef<RFB | undefined>(undefined);
  const [status, setStatus] = useState<Status>({ kind: 'connecting' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus({ kind: 'connecting' });
    (async () => {
      try {
        const { url, password } = await api.workers.desktop(worker.id);
        if (cancelled || !screen.current) return;
        const r = new RFB(screen.current, url, { credentials: { password }, shared: true });
        r.scaleViewport = true;
        r.resizeSession = true;
        r.background = 'transparent';
        r.addEventListener('connect', () => setStatus({ kind: 'connected' }));
        r.addEventListener('disconnect', (e: Event) => {
          const clean = (e as CustomEvent<{ clean: boolean }>).detail?.clean;
          if (!cancelled) setStatus({ kind: 'error', message: clean ? 'Rozłączono z pulpitem.' : 'Nie mogę połączyć się z pulpitem sandboxa. Czy kontener działa?' });
        });
        r.addEventListener('securityfailure', () => setStatus({ kind: 'error', message: 'Pulpit odrzucił hasło. Zainstaluj sandbox ponownie.' }));
        rfb.current = r;
      } catch (err) {
        if (!cancelled) setStatus({ kind: 'error', message: bridgeError(err) });
      }
    })();
    return () => {
      cancelled = true;
      rfb.current?.disconnect();
      rfb.current = undefined;
    };
  }, [api, worker.id, attempt]);

  const openBrowser = useCallback(() => {
    api.workers.exec(worker.id, 'browser').catch(() => {});
    rfb.current?.focus();
  }, [api, worker.id]);

  return (
    <main className="chat">
      <header className="chat-head">
        <div className="titles">
          <span className="title">Pulpit</span>
          <span className="sub">
            <span className={`dot ${status.kind === 'connected' ? 'on' : 'off'}`} aria-hidden />
            <span>
              {device.name} · {status.kind === 'connected' ? 'połączono przez SSH' : status.kind === 'connecting' ? 'łączenie…' : 'brak połączenia'}
            </span>
          </span>
        </div>
        <button className="btn btn-sm" onClick={openBrowser} disabled={status.kind !== 'connected'}>
          <Globe size={14} aria-hidden /> Przeglądarka
        </button>
        <button className="icon-btn" onClick={() => setAttempt((a) => a + 1)} title="Połącz ponownie" aria-label="Połącz ponownie">
          <RotateCw size={15} />
        </button>
        <button className="icon-btn" onClick={() => screen.current?.requestFullscreen()} title="Pełny ekran" aria-label="Pełny ekran" disabled={status.kind !== 'connected'}>
          <Maximize2 size={15} />
        </button>
      </header>
      <div className="desktop-stage">
        <div ref={screen} className="desktop-screen" data-status={status.kind} />
        {status.kind !== 'connected' && (
          <div className="desktop-overlay" role="status">
            {status.kind === 'connecting' ? (
              <p className="msg-note">
                <span className="working" aria-hidden /> Otwieram tunel do {worker.host}…
              </p>
            ) : (
              <div className="intro-inner">
                <p className="form-error">{status.message}</p>
                <button className="btn" onClick={() => setAttempt((a) => a + 1)}>
                  Spróbuj ponownie
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <p className="desktop-hint hint">Prawy przycisk myszy na pulpicie otwiera menu: przeglądarka i terminal. Boty używają tej samej przeglądarki, więc widzisz, co robią.</p>
    </main>
  );
}
