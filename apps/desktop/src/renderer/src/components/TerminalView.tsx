import type { DeviceRow } from '@a-bot/shared';
import { RotateCw } from 'lucide-react';
import { useState } from 'react';
import type { WorkerInfo } from '../lib/desktopApi';
import { Xterm, type XtermState } from './Xterm';

/**
 * A shell inside the sandbox container. It runs in tmux session "main", so closing this
 * view or the app detaches instead of ending it; the next open attaches to the same session.
 */
export function TerminalView({ device, worker }: { device: DeviceRow; worker: WorkerInfo }) {
  const [state, setState] = useState<XtermState>({ kind: 'connecting' });
  const [attempt, setAttempt] = useState(0);

  return (
    <main className="chat">
      <header className="chat-head">
        <div className="titles">
          <span className="title">Terminal</span>
          <span className="sub">
            <span className={`dot ${state.kind === 'open' ? 'on' : 'off'}`} aria-hidden />
            <span>root@a-bot na {device.name} · /workspace</span>
          </span>
        </div>
        <button className="btn btn-sm" onClick={() => setAttempt((a) => a + 1)} title="Połącz ponownie z tą samą sesją">
          <RotateCw size={14} aria-hidden /> Połącz ponownie
        </button>
      </header>
      {state.kind === 'closed' && state.error && (
        <div className="msg-error" role="alert" style={{ margin: '12px 20px 0' }}>
          <span />
          <p>{state.error}</p>
        </div>
      )}
      <div className="terminal-stage">
        <Xterm key={attempt} workerId={worker.id} kind="shell" onState={setState} />
      </div>
    </main>
  );
}
