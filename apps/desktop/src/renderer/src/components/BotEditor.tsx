import type { BotRow, DeviceRow, McpServer } from '@a-bot/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useState, type FormEvent, type ReactNode } from 'react';
import { friendlyError } from '../lib/backend';
import { botHue, botState } from '../lib/format';
import { BotAvatar } from './BotAvatar';
import { McpEditor } from './McpEditor';
import { t } from '../lib/i18n';

const CUSTOM = '__custom__';
const COLORS = [
  'oklch(0.72 0.19 45)',
  'oklch(0.84 0.17 92)',
  'oklch(0.8 0.2 135)',
  'oklch(0.76 0.14 195)',
  'oklch(0.64 0.2 258)',
  'oklch(0.62 0.24 300)',
  'oklch(0.7 0.22 355)',
  'oklch(0.45 0.03 264)',
];

interface Props {
  db: SupabaseClient;
  device: DeviceRow;
  bot?: BotRow;
  /** The person has no bots yet on this device. */
  first?: boolean;
  onSaved: (bot: BotRow) => void;
  onDeleted?: (id: string) => void;
  onCancel?: () => void;
  onOpenAccounts: () => void;
  /** Memory / Routines tabs, shown for an existing bot. */
  tabs?: ReactNode;
}

export function BotEditor({ db, device, bot, first, onSaved, onDeleted, onCancel, onOpenAccounts, tabs }: Props) {
  const engines = device.providers;
  const firstReady = engines.find((p) => botState(p).tone === 'on') ?? engines[0];
  const [name, setName] = useState(bot?.name ?? '');
  const [engineId, setEngineId] = useState(bot?.engine ?? firstReady?.id ?? '');
  const [model, setModel] = useState(bot?.model ?? '');
  const [customModel, setCustomModel] = useState(false);
  const [instructions, setInstructions] = useState(bot?.instructions ?? '');
  const [color, setColor] = useState<string | null>(bot?.color ?? null);
  const [mcp, setMcp] = useState<McpServer[]>(bot?.mcp ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const engine = engines.find((p) => p.id === engineId);
  // A saved model the engine no longer lists (or never did) is edited as free text.
  const showCustom = customModel || Boolean(model && engine && !engine.models.includes(model));
  const state = engine ? botState(engine) : undefined;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !engineId) return;
    setBusy(true);
    setError(undefined);
    const values = {
      device_id: device.id,
      name: name.trim(),
      engine: engineId,
      model: model.trim() || null,
      instructions: instructions.trim() || null,
      color,
      mcp: mcp.filter((m) => m.name.trim() && ('url' in m ? m.url.trim() : m.command.trim())),
      updated_at: new Date().toISOString(),
    };
    const query = bot ? db.from('bots').update(values).eq('id', bot.id) : db.from('bots').insert(values);
    const { data, error } = await query.select('*').single<BotRow>();
    setBusy(false);
    if (error) return setError(friendlyError(error));
    onSaved(data);
  }

  async function remove() {
    if (!bot) return;
    setBusy(true);
    const { error } = await db.from('bots').delete().eq('id', bot.id);
    setBusy(false);
    if (error) return setError(friendlyError(error));
    onDeleted?.(bot.id);
  }

  return (
    <main className="chat">
      <div className="page">
        <div className="page-inner" style={{ maxWidth: 640 }}>
          <div className="page-head">
            <BotAvatar bot={{ name: name || '?', kind: engine?.kind, color }} size="lg" />
            <h1>{bot ? t('Edit “{bot}”', { bot: bot.name }) : first ? t('Create your first bot') : t('New bot')}</h1>
          </div>
          {tabs}
          {!bot && (
            <p className="page-lede">
              {t('A bot is your assistant with a name and instructions. It runs on one of the engines found on “{device}” (Claude Code, Codex, Ollama…) and can use the sandbox: terminal, browser and /workspace.', { device: device.name })}
            </p>
          )}
          {engines.length === 0 ? (
            <p className="page-lede">{t('The agent on “{device}” has not reported its engines yet (claude, codex, ollama…). Make sure the sandbox is running.', { device: device.name })}</p>
          ) : (
            <form className="bot-form" onSubmit={save}>
              <label className="field">
                <span>{t('Name')}</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('e.g. Researcher, Devops, Assistant')} maxLength={60} required autoFocus={!bot} />
              </label>
              <div className="worker-grid">
                <label className="field">
                  <span>{t('Engine')}</span>
                  <select className="input" value={engineId} onChange={(e) => {
                      setEngineId(e.target.value);
                      setModel('');
                      setCustomModel(false);
                    }}>
                    {engines.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {botState(p).tone === 'on' ? '' : ` (${botState(p).label.toLowerCase()})`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>{t('Model')}</span>
                  <select
                    className="input"
                    value={showCustom ? CUSTOM : model}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCustomModel(v === CUSTOM);
                      setModel(v === CUSTOM ? '' : v);
                    }}
                  >
                    <option value="">{engine?.defaultModel ? t('Default ({model})', { model: engine.defaultModel }) : t('Default')}</option>
                    {engine?.models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                    <option value={CUSTOM}>{t('Other…')}</option>
                  </select>
                </label>
                {showCustom && (
                  <label className="field span-2">
                    <span>{t('Model name')}</span>
                    <input className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder={t('e.g. claude-opus-4-1 or qwen3.5:9b')} spellCheck={false} autoFocus />
                  </label>
                )}
              </div>
              {state && state.tone !== 'on' && (
                <p className="hint">
                  {t('{engine}: {state} on “{device}”.', { engine: engine!.name, state: state.label.toLowerCase(), device: device.name })}{' '}
                  {engine!.kind === 'claude' || engine!.kind === 'codex' ? (
                    <button type="button" className="link-btn" onClick={onOpenAccounts}>
                      {t('Sign in under Settings')}
                    </button>
                  ) : (
                    engine!.setupHint && t(engine!.setupHint)
                  )}
                </p>
              )}
              <label className="field">
                <span>{t('Instructions (optional)')}</span>
                <textarea
                  className="input textarea"
                  rows={6}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  maxLength={8000}
                  placeholder={t('Who this bot is and how it should work, e.g. “Answer briefly. Commit before changing files in /workspace.”')}
                />
              </label>
              <McpEditor value={mcp} onChange={setMcp} />
              <div className="field">
                <span>{t('Color')}</span>
                <div className="swatches" role="radiogroup" aria-label={t('Color')}>
                  <button type="button" role="radio" aria-checked={color === null} className="swatch" style={{ background: botHue(engine?.kind ?? 'custom') }} onClick={() => setColor(null)} title={t('Engine color')} />
                  {COLORS.map((c) => (
                    <button key={c} type="button" role="radio" aria-checked={color === c} className="swatch" style={{ background: c }} onClick={() => setColor(c)} />
                  ))}
                </div>
              </div>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <div className="form-actions">
                <button className="btn btn-primary" disabled={busy || !name.trim() || !engineId}>
                  {bot ? t('Save') : t('Create bot')}
                </button>
                {onCancel && (
                  <button type="button" className="btn btn-ghost" onClick={onCancel}>
                    {t('Cancel')}
                  </button>
                )}
                {bot &&
                  (confirmDelete ? (
                    <span className="push-right">
                      <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>
                        {t('Delete the bot and its chat')}
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
                        {t('No')}
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="btn btn-ghost push-right" onClick={() => setConfirmDelete(true)}>
                      {t('Delete bot')}
                    </button>
                  ))}
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
