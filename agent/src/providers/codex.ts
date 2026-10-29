import type { ProviderInfo } from '@a-bot/shared';
import { exec, streamLines, tail, which } from '../proc.js';
import { ProviderError, type Provider, type RunContext } from './types.js';

/** Translates `codex exec --json` events into emitter calls. */
export function createCodexParser(emit: RunContext['emit']) {
  let wroteText = false;
  const state = { error: undefined as string | undefined };
  const handle = (line: string) => {
    let ev: any;
    try {
      ev = JSON.parse(line);
    } catch {
      return;
    }
    switch (ev.type) {
      case 'thread.started':
        if (ev.thread_id) emit.session(ev.thread_id);
        return;
      case 'item.started':
      case 'item.updated':
      case 'item.completed': {
        const item = ev.item ?? {};
        const done = ev.type === 'item.completed';
        const status = item.status === 'failed' || (typeof item.exit_code === 'number' && item.exit_code !== 0) ? 'error' : done ? 'done' : 'running';
        switch (item.type) {
          case 'agent_message':
            if (done && item.text) {
              emit.text((wroteText ? '\n\n' : '') + item.text);
              wroteText = true;
            }
            return;
          case 'reasoning':
            if (item.text) emit.step({ id: item.id, kind: 'thinking', title: 'Thinking', output: tail(item.text, 2000), status: 'done' });
            return;
          case 'command_execution':
            emit.step({ id: item.id, kind: 'command', title: item.command ?? 'command', output: item.aggregated_output ? tail(item.aggregated_output) : undefined, status });
            return;
          case 'file_change': {
            const files = (item.changes ?? []).map((c: any) => `${c.kind ?? 'zmiana'} ${c.path}`).join('\n');
            emit.step({ id: item.id, kind: 'file', title: 'File changes', output: files, status });
            return;
          }
          case 'mcp_tool_call':
            emit.step({ id: item.id, kind: 'tool', title: `${item.server ?? 'mcp'} · ${item.tool ?? ''}`, status });
            return;
          case 'web_search':
            emit.step({ id: item.id, kind: 'tool', title: `Search: ${item.query ?? ''}`, status });
            return;
          case 'todo_list':
            emit.step({
              id: item.id,
              kind: 'info',
              title: 'Plan',
              output: (item.items ?? []).map((t: any) => `${t.completed ? '✓' : '○'} ${t.text}`).join('\n'),
              status: 'done',
            });
            return;
          case 'error':
            state.error = item.message;
            return;
          default:
            return;
        }
      }
      case 'turn.completed':
        emit.usage({ inputTokens: ev.usage?.input_tokens, outputTokens: ev.usage?.output_tokens });
        return;
      case 'turn.failed':
        state.error = ev.error?.message ?? 'Codex did not finish its answer';
        return;
      case 'error':
        state.error = ev.message ?? 'Codex error';
        return;
    }
  };
  return { handle, state };
}

export const codexProvider: Provider = {
  id: 'codex',
  kind: 'codex',
  async detect(): Promise<ProviderInfo> {
    const info: ProviderInfo = {
      id: 'codex',
      kind: 'codex',
      name: 'Codex',
      description: 'OpenAI’s agent on your ChatGPT subscription, with full access to the container.',
      installed: false,
      authenticated: false,
      models: [],
    };
    if (!(await which('codex'))) {
      info.setupHint = 'Install: npm i -g @openai/codex';
      return info;
    }
    info.installed = true;
    const v = await exec('codex', ['--version']);
    info.version = v.stdout.trim().replace(/^codex-cli\s*/, '') || undefined;
    const s = await exec('codex', ['login', 'status']);
    info.authenticated = s.code === 0;
    if (!info.authenticated) info.setupHint = 'Sign in under Settings → Model accounts, or in the container: codex login --device-auth';
    return info;
  },
  async run(ctx) {
    const common = ['--json', '--skip-git-repo-check', '--dangerously-bypass-approvals-and-sandbox'];
    if (ctx.model) common.push('--model', ctx.model);
    // Codex has no per-run system prompt flag; the bot's instructions open the session instead.
    const prompt = !ctx.sessionId && ctx.instructions ? `${ctx.instructions}\n\n---\n\n${ctx.prompt}` : ctx.prompt;
    const args = ctx.sessionId ? ['exec', 'resume', ...common, ctx.sessionId, prompt] : ['exec', ...common, prompt];
    const parser = createCodexParser(ctx.emit);
    const res = await streamLines('codex', args, { cwd: ctx.cwd, signal: ctx.signal, onLine: parser.handle });
    if (ctx.signal.aborted) return;
    if (parser.state.error) throw new ProviderError(parser.state.error);
    if (res.code !== 0) throw new ProviderError(tail(res.stderr.trim(), 1500) || `codex exited with code ${res.code}`);
  },
};
