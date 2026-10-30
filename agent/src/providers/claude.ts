import type { McpServer, ProviderInfo } from '@a-bot/shared';
import { exec, streamLines, tail, which } from '../proc.js';
import { ProviderError, type Provider, type RunContext } from './types.js';

const MODELS = ['sonnet', 'opus', 'haiku'];

export function describeToolUse(name: string, input: Record<string, unknown>): { kind: 'command' | 'file' | 'tool'; title: string; detail?: string } {
  const str = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : undefined);
  if (name === 'Bash') return { kind: 'command', title: str('command') ?? 'bash', detail: str('description') };
  if (['Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(name)) {
    return { kind: 'file', title: `${name} ${str('file_path') ?? str('notebook_path') ?? ''}`.trim() };
  }
  if (name === 'WebFetch') return { kind: 'tool', title: `WebFetch ${str('url') ?? ''}`.trim() };
  if (name === 'WebSearch') return { kind: 'tool', title: `WebSearch ${str('query') ?? ''}`.trim() };
  if (name === 'Grep' || name === 'Glob') return { kind: 'tool', title: `${name} ${str('pattern') ?? ''}`.trim() };
  return { kind: 'tool', title: name, detail: JSON.stringify(input).slice(0, 400) };
}

/** MCP servers in Claude Code's --mcp-config format. */
export function claudeMcpConfig(servers: McpServer[]): { mcpServers: Record<string, unknown> } {
  return {
    mcpServers: Object.fromEntries(
      servers.map((s) => [s.name, 'url' in s ? { type: 'http', url: s.url, headers: s.headers } : { command: s.command, args: s.args ?? [], env: s.env ?? {} }]),
    ),
  };
}

function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (c && typeof c === 'object' && 'text' in c ? String((c as { text: unknown }).text) : ''))
      .join('\n');
  }
  return '';
}

/** Translates `claude -p --output-format stream-json` events into emitter calls. */
export function createClaudeParser(emit: RunContext['emit']) {
  let wroteText = false;
  let needsGap = false;
  const state = { error: undefined as string | undefined, sawResult: false };
  const handle = (line: string) => {
    let ev: any;
    try {
      ev = JSON.parse(line);
    } catch {
      return;
    }
    if (ev.session_id && (ev.type === 'system' || ev.type === 'result')) emit.session(ev.session_id);
    if (ev.type === 'stream_event') {
      const e = ev.event;
      if (e?.type === 'message_start' && wroteText) needsGap = true;
      if (e?.type === 'content_block_delta' && e.delta?.type === 'text_delta' && e.delta.text) {
        if (needsGap) {
          emit.text('\n\n');
          needsGap = false;
        }
        emit.text(e.delta.text);
        wroteText = true;
      }
      return;
    }
    if (ev.type === 'assistant') {
      for (const block of ev.message?.content ?? []) {
        if (block.type === 'tool_use') {
          const d = describeToolUse(block.name, block.input ?? {});
          emit.step({ id: block.id, kind: d.kind, title: d.title, detail: d.detail, status: 'running' });
        }
        if (block.type === 'thinking' && block.thinking) {
          emit.step({ id: `thinking-${ev.message?.id ?? Math.random()}`, kind: 'thinking', title: 'Thinking', output: tail(block.thinking, 2000), status: 'done' });
        }
      }
      return;
    }
    if (ev.type === 'user') {
      for (const block of ev.message?.content ?? []) {
        if (block.type === 'tool_result') {
          emit.step({
            id: block.tool_use_id,
            kind: 'tool',
            title: '',
            output: tail(toolResultText(block.content), 4000),
            status: block.is_error ? 'error' : 'done',
          });
        }
      }
      return;
    }
    if (ev.type === 'result') {
      state.sawResult = true;
      if (!wroteText && typeof ev.result === 'string' && ev.result) emit.text(ev.result);
      emit.usage({
        inputTokens: ev.usage?.input_tokens,
        outputTokens: ev.usage?.output_tokens,
        costUsd: ev.total_cost_usd,
      });
      if (ev.is_error) state.error = typeof ev.result === 'string' && ev.result ? ev.result : (ev.subtype ?? 'Claude error');
    }
  };
  return { handle, state };
}

export const claudeProvider: Provider = {
  id: 'claude',
  kind: 'claude',
  async detect(): Promise<ProviderInfo> {
    const info: ProviderInfo = {
      id: 'claude',
      kind: 'claude',
      name: 'Claude Code',
      description: 'Anthropic’s agent with the terminal, files and browser of the container.',
      installed: false,
      authenticated: false,
      models: MODELS,
      defaultModel: 'sonnet',
    };
    if (!(await which('claude'))) {
      info.setupHint = 'Install: npm i -g @anthropic-ai/claude-code';
      return info;
    }
    info.installed = true;
    const v = await exec('claude', ['--version']);
    info.version = v.stdout.trim().split(' ')[0] || undefined;
    const s = await exec('claude', ['auth', 'status', '--json']);
    try {
      info.authenticated = Boolean(JSON.parse(s.stdout).loggedIn);
    } catch {
      info.authenticated = s.code === 0;
    }
    if (!info.authenticated) info.setupHint = 'Sign in under Settings → Model accounts, or in the container: claude auth login';
    return info;
  },
  async run(ctx) {
    const args = ['-p', ctx.prompt, '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--dangerously-skip-permissions'];
    if (ctx.model) args.push('--model', ctx.model);
    if (ctx.instructions) args.push('--append-system-prompt', ctx.instructions);
    if (ctx.sessionId) args.push('--resume', ctx.sessionId);
    if (ctx.mcpServers?.length) args.push('--mcp-config', JSON.stringify(claudeMcpConfig(ctx.mcpServers)));
    const parser = createClaudeParser(ctx.emit);
    // IS_SANDBOX lets Claude Code skip permission prompts while running as root inside the container.
    const res = await streamLines('claude', args, { cwd: ctx.cwd, signal: ctx.signal, env: { ...process.env, IS_SANDBOX: '1' }, onLine: parser.handle });
    if (ctx.signal.aborted) return;
    if (parser.state.error) throw new ProviderError(parser.state.error);
    if (res.code !== 0 && !parser.state.sawResult) throw new ProviderError(tail(res.stderr.trim(), 1500) || `claude exited with code ${res.code}`);
  },
};
