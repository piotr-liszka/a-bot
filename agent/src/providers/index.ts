import type { ProviderInfo } from '@a-bot/shared';
import { claudeProvider } from './claude.js';
import { codexProvider } from './codex.js';
import { customProvider, type CustomProviderConfig } from './custom.js';
import { ollamaProvider } from './ollama.js';
import type { Provider } from './types.js';

export type { Provider, RunContext, RunEmitter, ChatTurn } from './types.js';
export { ProviderError } from './types.js';
export type { CustomProviderConfig } from './custom.js';

export function buildProviders(custom: CustomProviderConfig[] = []): Map<string, Provider> {
  const list = [claudeProvider, codexProvider, ollamaProvider, ...custom.map(customProvider)];
  return new Map(list.map((p) => [p.id, p]));
}

export async function detectAll(providers: Map<string, Provider>): Promise<ProviderInfo[]> {
  return Promise.all(
    [...providers.values()].map((p) =>
      p.detect().catch(
        (err): ProviderInfo => ({
          id: p.id,
          kind: p.kind,
          name: p.id,
          description: '',
          installed: false,
          authenticated: false,
          models: [],
          setupHint: `Wykrywanie nie powiodło się: ${String(err)}`,
        }),
      ),
    ),
  );
}
