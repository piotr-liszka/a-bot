import type { DeviceRow } from '@a-bot/shared';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { RotateCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { bridge, bridgeError, type WorkerInfo } from '../lib/desktopApi';

const SHORTCUTS = [
  { label: 'Zaloguj Claude', command: 'claude auth login' },
  { label: 'Zaloguj Codex', command: 'codex login --device-auth' },
  { label: 'Stan botów', command: 'a-bot-agent detect' },
];

function themeFromCss(): Record<string, string> {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return { background: v('--term-bg'), foreground: v('--term-fg'), cursor: v('--signal'), selectionBackground: v('--term-selection') };
}

/** A shell inside the sandbox container (docker exec over SSH). */
export function TerminalView({ device, worker }: { device: DeviceRow; worker: WorkerInfo }) {
  const api = bridge()!;
  const host = useRef<HTMLDivElement>(null);
  const termId = useRef<string | undefined>(undefined);
  const [state, setState] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!host.current) return;
    const term = new Terminal({ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 13, lineHeight: 1.25, cursorBlink: true, theme: themeFromCss(), allowProposedApi: false });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current);
    fit.fit();
    setState('connecting');
    setError(undefined);
    let disposed = false;

    const offData = api.terminal.onData((e) => e.termId === termId.current && term.write(e.data));
    const offExit = api.terminal.onExit((e) => {
      if (e.termId !== termId.current) return;
      setState('closed');
      term.write('\r\n\x1b[2m[sesja zakończona]\x1b[0m\r\n');
    });
    const input = term.onData((d) => termId.current && api.terminal.write(termId.current, d));
    const resize = new ResizeObserver(() => {
      fit.fit();
      if (termId.current) api.terminal.resize(termId.current, term.cols, term.rows);
    });
    resize.observe(host.current);

    api.terminal
      .open(worker.id, term.cols, term.rows)
      .then((id) => {
        if (disposed) return api.terminal.close(id);
        termId.current = id;
        setState('open');
        term.focus();
      })
      .catch((err) => {
        setError(bridgeError(err));
        setState('closed');
      });

    return () => {
      disposed = true;
      offData();
      offExit();
      input.dispose();
      resize.disconnect();
      if (termId.current) api.terminal.close(termId.current);
      termId.current = undefined;
      term.dispose();
    };
  }, [api, worker.id, attempt]);

  const type = (command: string) => {
    if (termId.current) api.terminal.write(termId.current, `${command}\r`);
  };

  return (
    <main className="chat">
      <header className="chat-head">
        <div className="titles">
          <span className="title">Terminal</span>
          <span className="sub">
            <span className={`dot ${state === 'open' ? 'on' : 'off'}`} aria-hidden />
            <span>root@a-bot na {device.name} · /workspace</span>
          </span>
        </div>
        {SHORTCUTS.map((s) => (
          <button key={s.command} className="btn btn-sm" onClick={() => type(s.command)} disabled={state !== 'open'} title={s.command}>
            {s.label}
          </button>
        ))}
        <button className="icon-btn" onClick={() => setAttempt((a) => a + 1)} title="Nowa sesja" aria-label="Nowa sesja">
          <RotateCw size={15} />
        </button>
      </header>
      {error && (
        <div className="msg-error" role="alert" style={{ margin: '12px 20px 0' }}>
          <span />
          <p>{error}</p>
        </div>
      )}
      <div className="terminal-stage">
        <div ref={host} className="terminal-host" />
      </div>
    </main>
  );
}
