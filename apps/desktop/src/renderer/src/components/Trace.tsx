import type { MessageStep } from '@a-bot/shared';
import { Brain, ChevronDown, FileText, Info, SquareTerminal, Wrench, X } from 'lucide-react';
import { useState } from 'react';
import { plural } from '../lib/format';

const icons = { command: SquareTerminal, file: FileText, tool: Wrench, thinking: Brain, info: Info };

function summary(steps: MessageStep[]): string {
  const count = (k: MessageStep['kind']) => steps.filter((s) => s.kind === k).length;
  const parts: string[] = [];
  const c = count('command');
  const f = count('file');
  const t = count('tool');
  if (c) parts.push(`${c} ${plural(c, 'polecenie', 'polecenia', 'poleceń')}`);
  if (f) parts.push(`${f} ${plural(f, 'operacja na pliku', 'operacje na plikach', 'operacji na plikach')}`);
  if (t) parts.push(`${t} ${plural(t, 'narzędzie', 'narzędzia', 'narzędzi')}`);
  return parts.join(', ') || `${steps.length} ${plural(steps.length, 'krok', 'kroki', 'kroków')}`;
}

/** A bot's work as a vertical trace. Open while it runs, folds to a one-line summary when done. */
export function Trace({ steps, live }: { steps: MessageStep[]; live: boolean }) {
  const [userOpen, setUserOpen] = useState<boolean>();
  const open = userOpen ?? live;
  const running = steps.find((s) => s.status === 'running');
  const failed = steps.filter((s) => s.status === 'error').length;

  return (
    <div className="trace" data-open={open}>
      <button className="trace-head" onClick={() => setUserOpen(!open)} aria-expanded={open}>
        {running ? <span className="working" aria-hidden /> : null}
        <span>
          {running ? `Pracuje: ${running.title || 'krok'}` : summary(steps)}
          {failed ? `, ${failed} z błędem` : ''}
        </span>
        <ChevronDown className="chev" size={15} aria-hidden />
      </button>
      {open && (
        <ol className="trace-steps">
          {steps.map((s) => (
            <Step key={s.id} step={s} />
          ))}
        </ol>
      )}
    </div>
  );
}

function Step({ step }: { step: MessageStep }) {
  const [showOutput, setShowOutput] = useState(false);
  const Icon = step.status === 'error' ? X : icons[step.kind] ?? Wrench;
  const plain = step.kind === 'thinking' || step.kind === 'info';
  const hasOutput = Boolean(step.output?.trim());
  const expanded = showOutput || (plain && hasOutput);
  return (
    <li className="step" data-status={step.status}>
      <span className="step-node" aria-hidden>
        <Icon size={10} strokeWidth={2.5} />
      </span>
      <div style={{ minWidth: 0 }}>
        <button
          className={`step-title${plain ? ' plain' : ''}`}
          onClick={() => hasOutput && setShowOutput(!showOutput)}
          title={step.title}
          aria-expanded={hasOutput ? expanded : undefined}
          style={{ cursor: hasOutput && !plain ? 'pointer' : 'default' }}
        >
          {step.title}
        </button>
        {step.detail && <div className="step-detail">{step.detail}</div>}
        {expanded && hasOutput && <pre className="step-output">{step.output}</pre>}
      </div>
    </li>
  );
}
