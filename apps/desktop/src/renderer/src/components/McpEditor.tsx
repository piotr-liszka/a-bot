import type { McpServer } from '@a-bot/shared';
import { Plus, Trash2 } from 'lucide-react';
import { t } from '../lib/i18n';

/** Ready-made servers; the person fills in their token. */
const TEMPLATES: { label: string; server: McpServer }[] = [
  { label: 'GitHub', server: { name: 'github', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' } } },
  { label: 'Notion', server: { name: 'notion', command: 'npx', args: ['-y', '@notionhq/notion-mcp-server'], env: { NOTION_TOKEN: '' } } },
  { label: 'Memory graph', server: { name: 'memory', command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] } },
  { label: 'Remote URL', server: { name: 'remote', url: 'https://' } },
];

/** "npx -y pkg 'a b'" → ["npx", "-y", "pkg", "a b"] */
function splitCommand(line: string): string[] {
  return [...line.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
}
const joinCommand = (parts: string[]) => parts.map((p) => (/\s/.test(p) ? `"${p}"` : p)).join(' ');
const envText = (env?: Record<string, string>) => Object.entries(env ?? {}).map(([k, v]) => `${k}=${v}`).join('\n');
function parseEnv(text: string): Record<string, string> {
  return Object.fromEntries(
    text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );
}

export function McpEditor({ value, onChange }: { value: McpServer[]; onChange: (next: McpServer[]) => void }) {
  const update = (i: number, server: McpServer) => onChange(value.map((s, j) => (j === i ? server : s)));
  return (
    <div className="field">
      <span>{t('MCP servers')}</span>
      <p className="hint" style={{ margin: 0 }}>
        {t('Extra tools for this bot (Claude Code and Codex). The browser and the tools for talking to other bots are always there.')}
      </p>
      {value.map((s, i) => (
        <div key={i} className="mcp-row">
          <input className="input mcp-name" value={s.name} onChange={(e) => update(i, { ...s, name: e.target.value.replace(/[^A-Za-z0-9_-]/g, '') })} aria-label={t('Name')} placeholder="name" />
          {'url' in s ? (
            <input className="input" value={s.url} onChange={(e) => update(i, { ...s, url: e.target.value })} aria-label="URL" placeholder="https://…/mcp" spellCheck={false} />
          ) : (
            <input
              className="input mono"
              defaultValue={joinCommand([s.command, ...(s.args ?? [])])}
              onBlur={(e) => {
                const [command = '', ...args] = splitCommand(e.target.value);
                update(i, { ...s, command, args });
              }}
              aria-label={t('Command')}
              placeholder="npx -y @scope/server"
              spellCheck={false}
            />
          )}
          <button type="button" className="icon-btn" onClick={() => onChange(value.filter((_, j) => j !== i))} title={t('Remove')} aria-label={t('Remove')}>
            <Trash2 size={15} />
          </button>
          {!('url' in s) && (
            <textarea
              className="input textarea mono mcp-env"
              rows={2}
              defaultValue={envText(s.env)}
              onBlur={(e) => update(i, { ...s, env: parseEnv(e.target.value) })}
              aria-label={t('Environment variables')}
              placeholder="TOKEN=…"
              spellCheck={false}
            />
          )}
        </div>
      ))}
      <div className="mcp-add">
        {TEMPLATES.map((tpl) => (
          <button key={tpl.label} type="button" className="btn btn-sm" onClick={() => onChange([...value, structuredClone(tpl.server)])}>
            <Plus size={13} aria-hidden /> {t(tpl.label)}
          </button>
        ))}
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange([...value, { name: `server${value.length + 1}`, command: '', args: [] }])}>
          <Plus size={13} aria-hidden /> {t('Command')}
        </button>
      </div>
    </div>
  );
}
