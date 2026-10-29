import type { ProviderInfo } from '@a-bot/shared';
import { exec, streamLines, tail, which } from '../proc.js';
import { ProviderError, type Provider } from './types.js';

/**
 * Any CLI that takes a prompt and prints an answer, declared in the agent config:
 *   { "id": "aider", "name": "Aider", "command": ["aider", "--yes", "--message", "{prompt}"] }
 * `{prompt}` and `{model}` are substituted; stdout becomes the reply.
 */
export interface CustomProviderConfig {
  id: string;
  name: string;
  description?: string;
  command: string[];
  versionArgs?: string[];
  models?: string[];
}

export function customProvider(cfg: CustomProviderConfig): Provider {
  const bin = cfg.command[0];
  return {
    id: cfg.id,
    kind: 'custom',
    async detect(): Promise<ProviderInfo> {
      const installed = Boolean(bin && (await which(bin)));
      let version: string | undefined;
      if (installed && cfg.versionArgs) version = (await exec(bin, cfg.versionArgs)).stdout.trim().split('\n')[0];
      return {
        id: cfg.id,
        kind: 'custom',
        name: cfg.name,
        description: cfg.description ?? `Custom CLI: ${cfg.command.join(' ')}`,
        installed,
        authenticated: installed,
        version,
        models: cfg.models ?? [],
        defaultModel: cfg.models?.[0],
        setupHint: installed ? undefined : `Command ${bin} not found in the container.`,
      };
    },
    async run(ctx) {
      const args = cfg.command.slice(1).map((a) => a.replaceAll('{prompt}', ctx.prompt).replaceAll('{model}', ctx.model ?? '').replaceAll('{instructions}', ctx.instructions ?? ''));
      let first = true;
      const res = await streamLines(bin, args, {
        cwd: ctx.cwd,
        signal: ctx.signal,
        onLine: (line) => {
          ctx.emit.text((first ? '' : '\n') + line);
          first = false;
        },
      });
      if (!ctx.signal.aborted && res.code !== 0) throw new ProviderError(tail(res.stderr.trim(), 1500) || `${bin} exited with code ${res.code}`);
    },
  };
}
