import type { BotRow, DeviceRow } from '@a-bot/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useState, type FormEvent } from 'react';
import { friendlyError } from '../lib/backend';
import { botHue, botState } from '../lib/format';
import { BotAvatar } from './BotAvatar';

const COLORS = ['oklch(0.62 0.135 42)', 'oklch(0.56 0.1 160)', 'oklch(0.5 0.12 250)', 'oklch(0.52 0.13 305)', 'oklch(0.58 0.14 15)', 'oklch(0.42 0.02 264)'];

interface Props {
  db: SupabaseClient;
  device: DeviceRow;
  bot?: BotRow;
  /** The person has no bots yet on this device. */
  first?: boolean;
  onSaved: (bot: BotRow) => void;
  onDeleted?: () => void;
  onCancel?: () => void;
  onOpenAccounts: () => void;
}

export function BotEditor({ db, device, bot, first, onSaved, onDeleted, onCancel, onOpenAccounts }: Props) {
  const engines = device.providers;
  const firstReady = engines.find((p) => botState(p).tone === 'on') ?? engines[0];
  const [name, setName] = useState(bot?.name ?? '');
  const [engineId, setEngineId] = useState(bot?.engine ?? firstReady?.id ?? '');
  const [model, setModel] = useState(bot?.model ?? '');
  const [instructions, setInstructions] = useState(bot?.instructions ?? '');
  const [color, setColor] = useState<string | null>(bot?.color ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const engine = engines.find((p) => p.id === engineId);
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
    onDeleted?.();
  }

  return (
    <main className="chat">
      <div className="page">
        <div className="page-inner" style={{ maxWidth: 640 }}>
          <div className="page-head">
            <BotAvatar bot={{ name: name || '?', kind: engine?.kind, color }} size="lg" />
            <h1>{bot ? `Edytuj bota „${bot.name}”` : first ? 'Stwórz pierwszego bota' : 'Nowy bot'}</h1>
          </div>
          {!bot && (
            <p className="page-lede">
              Bot to Twój asystent z nazwą i instrukcjami. Działa na jednym z silników wykrytych na „{device.name}” (Claude Code, Codex, Ollama…) i ma dostęp do
              sandboxa: terminala, przeglądarki i <code>/workspace</code>.
            </p>
          )}
          {engines.length === 0 ? (
            <p className="page-lede">Agent na „{device.name}” jeszcze nie przysłał listy silników (claude, codex, ollama…). Upewnij się, że sandbox działa.</p>
          ) : (
            <form className="bot-form" onSubmit={save}>
              <label className="field">
                <span>Nazwa</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="np. Researcher, Devops, Asystent" maxLength={60} required autoFocus={!bot} />
              </label>
              <div className="worker-grid">
                <label className="field">
                  <span>Silnik</span>
                  <select className="input" value={engineId} onChange={(e) => setEngineId(e.target.value)}>
                    {engines.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {botState(p).tone === 'on' ? '' : ` (${botState(p).label.toLowerCase()})`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Model (opcjonalnie)</span>
                  <input
                    className="input"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    list="bot-models"
                    placeholder={engine?.defaultModel ? `domyślny: ${engine.defaultModel}` : 'domyślny'}
                    spellCheck={false}
                  />
                  <datalist id="bot-models">
                    {engine?.models.map((m) => <option key={m} value={m} />)}
                  </datalist>
                </label>
              </div>
              {state && state.tone !== 'on' && (
                <p className="hint">
                  {engine!.name}: {state.label.toLowerCase()} na „{device.name}”.{' '}
                  {engine!.kind === 'claude' || engine!.kind === 'codex' ? (
                    <button type="button" className="link-btn" onClick={onOpenAccounts}>
                      Zaloguj w Ustawieniach
                    </button>
                  ) : (
                    engine!.setupHint
                  )}
                </p>
              )}
              <label className="field">
                <span>Instrukcje (opcjonalnie)</span>
                <textarea
                  className="input textarea"
                  rows={6}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  maxLength={8000}
                  placeholder="Kim jest ten bot i jak ma pracować, np. „Odpowiadaj po polsku, zwięźle. Przed zmianami w /workspace zrób commit.”"
                />
              </label>
              <div className="field">
                <span>Kolor</span>
                <div className="swatches" role="radiogroup" aria-label="Kolor">
                  <button type="button" role="radio" aria-checked={color === null} className="swatch" style={{ background: botHue(engine?.kind ?? 'custom') }} onClick={() => setColor(null)} title="Kolor silnika" />
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
                  {bot ? 'Zapisz' : 'Stwórz bota'}
                </button>
                {onCancel && (
                  <button type="button" className="btn btn-ghost" onClick={onCancel}>
                    Anuluj
                  </button>
                )}
                {bot &&
                  (confirmDelete ? (
                    <span className="push-right">
                      <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>
                        Usuń bota i jego rozmowy
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
                        Nie
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="btn btn-ghost push-right" onClick={() => setConfirmDelete(true)}>
                      Usuń bota
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
