import type { MessageStep } from '@a-bot/shared';
import { Brain, ChevronDown, FileText, Info, SquareTerminal, Wrench, X } from 'lucide-react';
import { useState } from 'react';
import { t, tn } from '../lib/i18n';

const icons = { command: SquareTerminal, file: FileText, tool: Wrench, thinking: Brain, info: Info };

function summary(steps: MessageStep[]): string {
  const count = (k: MessageStep['kind']) => steps.filter((s) => s.kind === k).length;
  const parts: string[] = [];
  const c = count('command');
  const f = count('file');
  const tools = count('tool');
  if (c) parts.push(tn(c, 'command', 'commands'));
  if (f) parts.push(tn(f, 'file operation', 'file operations'));
  if (tools) parts.push(tn(tools, 'tool', 'tools'));
  return parts.join(', ') || tn(steps.length, 'step', 'steps');
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
          {running ? t('Working: {step}', { step: running.title || t('step') }) : summary(steps)}
          {failed ? `, ${t('{n} failed', { n: failed })}` : ''}
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
          {t(step.title)}
        </button>
        {step.detail && <div className="step-detail">{step.detail}</div>}
        {expanded && hasOutput && <pre className="step-output">{step.output}</pre>}
      </div>
    </li>
  );
}
