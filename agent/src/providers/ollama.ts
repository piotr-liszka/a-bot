import type { ProviderInfo } from '@a-bot/shared';
import { ProviderError, type Provider } from './types.js';

export function ollamaHost(): string {
  const raw = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
  return raw.startsWith('http') ? raw.replace(/\/$/, '') : `http://${raw}`;
}

export const ollamaProvider: Provider = {
  id: 'ollama',
  kind: 'ollama',
  async detect(): Promise<ProviderInfo> {
    const info: ProviderInfo = {
      id: 'ollama',
      kind: 'ollama',
      name: 'Ollama',
      description: 'Lokalne modele bez limitów subskrypcji. Odpowiada tekstem, bez dostępu do narzędzi.',
      installed: false,
      authenticated: false,
      models: [],
    };
    try {
      const v = await fetch(`${ollamaHost()}/api/version`, { signal: AbortSignal.timeout(2500) });
      info.version = ((await v.json()) as { version?: string }).version;
      info.installed = true;
      info.authenticated = true;
      const tags = await fetch(`${ollamaHost()}/api/tags`, { signal: AbortSignal.timeout(2500) });
      const body = (await tags.json()) as { models?: { name: string }[] };
      info.models = (body.models ?? []).map((m) => m.name);
      info.defaultModel = info.models[0];
      if (info.models.length === 0) info.setupHint = 'Pobierz model, np.: ollama pull llama3.2';
    } catch {
      info.setupHint = `Nie widzę serwera Ollama pod ${ollamaHost()}. Uruchom ollama serve albo ustaw OLLAMA_HOST.`;
    }
    return info;
  },
  async run(ctx) {
    const model = ctx.model;
    if (!model) throw new ProviderError('Wybierz model Ollama.');
    const messages = [...(ctx.instructions ? [{ role: 'system', content: ctx.instructions }] : []), ...ctx.history.map((t) => ({ role: t.role, content: t.text })), { role: 'user', content: ctx.prompt }];
    const res = await fetch(`${ollamaHost()}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true }),
      signal: ctx.signal,
    });
    if (!res.ok || !res.body) throw new ProviderError(`Ollama: ${res.status} ${await res.text().catch(() => '')}`);
    const decoder = new TextDecoder();
    let buf = '';
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      buf += decoder.decode(chunk, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const ev = JSON.parse(line) as { message?: { content?: string }; error?: string; done?: boolean; prompt_eval_count?: number; eval_count?: number };
        if (ev.error) throw new ProviderError(ev.error);
        if (ev.message?.content) ctx.emit.text(ev.message.content);
        if (ev.done) ctx.emit.usage({ inputTokens: ev.prompt_eval_count, outputTokens: ev.eval_count });
      }
    }
  },
};
