import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useEffect, useRef } from 'react';
import { bridge, bridgeError, type TerminalKind } from '../lib/desktopApi';
import { t } from '../lib/i18n';

export type XtermState = { kind: 'connecting' } | { kind: 'open' } | { kind: 'closed'; error?: string };

function themeFromCss(): Record<string, string> {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return { background: v('--term-bg'), foreground: v('--term-fg'), cursor: v('--signal'), selectionBackground: v('--term-selection') };
}

interface Props {
  workerId: string;
  kind: TerminalKind;
  onState?: (state: XtermState) => void;
  className?: string;
}

/** xterm.js wired to a `docker exec -it` pty in the sandbox. Remount (change `key`) for a fresh session. */
export function Xterm({ workerId, kind, onState, className }: Props) {
  const api = bridge()!;
  const host = useRef<HTMLDivElement>(null);
  const report = useRef(onState);
  report.current = onState;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const term = new Terminal({ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 13, lineHeight: 1.25, cursorBlink: true, theme: themeFromCss() });
    const fit = new FitAddon();
    term.loadAddon(fit);
    // Login flows print URLs; the main process opens them in the system browser.
    term.loadAddon(new WebLinksAddon((_e, uri) => window.open(uri)));
    term.open(el);
    // A hidden host has no size; fitting it would shrink the pty to nothing.
    const refit = () => {
      if (el.clientWidth > 0 && el.clientHeight > 0) fit.fit();
    };
    refit();
    report.current?.({ kind: 'connecting' });
    let termId: string | undefined;
    let disposed = false;

    const offData = api.terminal.onData((e) => e.termId === termId && term.write(e.data));
    const offExit = api.terminal.onExit((e) => {
      if (e.termId !== termId) return;
      termId = undefined;
      term.write(`\r\n\x1b[2m[${t('session ended')}]\x1b[0m\r\n`);
      report.current?.({ kind: 'closed' });
    });
    const input = term.onData((d) => termId && api.terminal.write(termId, d));
    const resize = new ResizeObserver(() => {
      refit();
      if (termId) api.terminal.resize(termId, term.cols, term.rows);
    });
    resize.observe(el);

    api.terminal
      .open(workerId, kind, term.cols, term.rows)
      .then((id) => {
        if (disposed) return api.terminal.close(id);
        termId = id;
        report.current?.({ kind: 'open' });
        if (el.clientWidth > 0) term.focus();
      })
      .catch((err) => report.current?.({ kind: 'closed', error: bridgeError(err) }));

    return () => {
      disposed = true;
      offData();
      offExit();
      input.dispose();
      resize.disconnect();
      if (termId) api.terminal.close(termId);
      term.dispose();
    };
  }, [api, workerId, kind]);

  return <div ref={host} className={className ?? 'terminal-host'} />;
}
