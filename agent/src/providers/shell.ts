import type { ProviderInfo } from '@a-bot/shared';
import { randomUUID } from 'node:crypto';
import { exec, streamLines, tail } from '../proc.js';
import type { Provider } from './types.js';

/** Runs each message as a bash command in the shared container: a terminal you can chat with. */
export const shellProvider: Provider = {
  id: 'shell',
  kind: 'shell',
  async detect(): Promise<ProviderInfo> {
    const v = await exec('bash', ['--version']);
    return {
      id: 'shell',
      kind: 'shell',
      name: 'Terminal',
      description: 'Każda wiadomość to polecenie bash wykonane w kontenerze. Bez modelu, bez limitów.',
      installed: v.code === 0,
      authenticated: v.code === 0,
      version: v.stdout.match(/version ([\d.]+)/)?.[1],
      models: [],
    };
  },
  async run(ctx) {
    const id = randomUUID();
    let output = '';
    let lastFlush = 0;
    ctx.emit.step({ id, kind: 'command', title: ctx.prompt, status: 'running' });
    const onLine = (line: string) => {
      output += `${line}\n`;
      const now = Date.now();
      if (now - lastFlush > 250) {
        lastFlush = now;
        ctx.emit.step({ id, kind: 'command', title: ctx.prompt, output: tail(output), status: 'running' });
      }
    };
    const res = await streamLines('bash', ['-lc', `${ctx.prompt} 2>&1`], { cwd: ctx.cwd, signal: ctx.signal, onLine });
    const ok = res.code === 0;
    ctx.emit.step({ id, kind: 'command', title: ctx.prompt, output: tail(output), status: ok ? 'done' : 'error' });
    const body = tail(output.trimEnd(), 12_000);
    ctx.emit.text(`${body ? `\`\`\`\n${body}\n\`\`\`\n\n` : ''}${ok ? 'Kod wyjścia 0.' : `Kod wyjścia ${res.code ?? 'brak (przerwano)'}.`}`);
  },
};
