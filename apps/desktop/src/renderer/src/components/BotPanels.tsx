import { nextRun, type BotRow, type RoutineRow, type RoutineSchedule } from '@a-bot/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { friendlyError } from '../lib/backend';
import { useRoutines } from '../lib/data';
import { locale, t } from '../lib/i18n';
import { relativeSeen } from '../lib/format';

export type BotTab = 'settings' | 'memory' | 'routines';

export function BotTabs({ tab, onSelect }: { tab: BotTab; onSelect: (tab: BotTab) => void }) {
  return (
    <div className="tabs" role="tablist">
      {(
        [
          ['settings', 'Settings'],
          ['memory', 'Memory'],
          ['routines', 'Routines'],
        ] as const
      ).map(([id, label]) => (
        <button key={id} role="tab" aria-selected={tab === id} onClick={() => onSelect(id)}>
          {t(label)}
        </button>
      ))}
    </div>
  );
}

function Page({ title, tabs, children }: { title: string; tabs: ReactNode; children: ReactNode }) {
  return (
    <main className="chat">
      <div className="page">
        <div className="page-inner" style={{ maxWidth: 720 }}>
          <div className="page-head">
            <h1>{title}</h1>
          </div>
          {tabs}
          {children}
        </div>
      </div>
    </main>
  );
}

/** The bot's MEMORY.md: it writes there itself; the person can read and correct it. */
export function MemoryPanel({ db, bot, tabs, now }: { db: SupabaseClient; bot: BotRow; tabs: ReactNode; now: number }) {
  const [text, setText] = useState(bot.memory);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();
  // Follow what the bot writes, unless the person is in the middle of editing.
  useEffect(() => {
    if (!dirty) setText(bot.memory);
  }, [bot.memory, dirty]);

  async function save() {
    setError(undefined);
    const { error } = await db.from('bots').update({ memory: text, memory_updated_at: new Date().toISOString() }).eq('id', bot.id);
    if (error) return setError(friendlyError(error));
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Page title={bot.name} tabs={tabs}>
      <p className="page-lede">
        {t('What {bot} remembers between chats. The bot keeps it up to date in its MEMORY.md; clearing the chat does not touch it. You can edit it here.', { bot: bot.name })}
      </p>
      <textarea
        className="input textarea mono memory-text"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
        }}
        placeholder={t('Empty for now. The bot fills it in as it learns.')}
        spellCheck={false}
        aria-label={t('Memory')}
      />
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button className="btn btn-primary" onClick={save} disabled={!dirty}>
          {saved ? t('Saved') : t('Save')}
        </button>
        {dirty && (
          <button
            className="btn btn-ghost"
            onClick={() => {
              setText(bot.memory);
              setDirty(false);
            }}
          >
            {t('Discard changes')}
          </button>
        )}
        <span className="hint push-right">{bot.memory_updated_at ? t('Updated {when}', { when: relativeSeen(bot.memory_updated_at, now) }) : ''}</span>
      </div>
    </Page>
  );
}

const DAYS = [1, 2, 3, 4, 5, 6, 0];
const dayName = (d: number) => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(Date.UTC(2026, 10, 1 + d, 12)));
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const when = (iso: string) => new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

function describe(s: RoutineSchedule): string {
  if (s.kind === 'interval') return s.minutes % 60 === 0 ? t('Every {n} h', { n: s.minutes / 60 }) : t('Every {n} min', { n: s.minutes });
  const days = s.days?.length && s.days.length < 7 ? s.days.map(dayName).join(', ') : t('every day');
  return t('{days} at {time}', { days, time: s.time });
}

/** Scheduled prompts. The agent on the device runs them, so they work with this app closed. */
export function RoutinesPanel({ db, bot, tabs, now }: { db: SupabaseClient; bot: BotRow; tabs: ReactNode; now: number }) {
  const routines = useRoutines(db, bot.id);
  const [editing, setEditing] = useState<RoutineRow | 'new'>();
  return (
    <Page title={bot.name} tabs={tabs}>
      <p className="page-lede">{t('Tasks {bot} does on its own on a schedule, e.g. “every morning, sum up my inbox”. They run on the worker, even with this app closed; the results land in the chat.', { bot: bot.name })}</p>
      {routines.rows.map((r) =>
        editing !== 'new' && editing?.id === r.id ? (
          <RoutineForm key={r.id} db={db} bot={bot} routine={r} onDone={() => setEditing(undefined)} />
        ) : (
          <div key={r.id} className={`routine${r.enabled ? '' : ' off'}`}>
            <div className="meta">
              <div className="name">{r.name}</div>
              <div className="sub">
                {describe(r.schedule)}
                {r.enabled && r.next_run_at ? ` · ${t('next: {when}', { when: when(r.next_run_at) })}` : ''}
                {r.last_run_at ? ` · ${t('last: {when}', { when: relativeSeen(r.last_run_at, now) })}` : ''}
              </div>
              <div className="prompt">{r.prompt}</div>
            </div>
            <label className="switch" title={r.enabled ? t('On') : t('Off')}>
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={(e) => db.from('routines').update({ enabled: e.target.checked, next_run_at: e.target.checked ? nextRun(r.schedule, r.timezone).toISOString() : null }).eq('id', r.id)}
                aria-label={t('Enabled')}
              />
              <span aria-hidden />
            </label>
            <button className="btn btn-sm" onClick={() => setEditing(r)}>
              {t('Edit')}
            </button>
          </div>
        ),
      )}
      {!routines.loading && routines.rows.length === 0 && editing !== 'new' && <p className="hint">{t('No routines yet.')}</p>}
      {editing === 'new' ? (
        <RoutineForm db={db} bot={bot} onDone={() => setEditing(undefined)} />
      ) : (
        <div>
          <button className="btn" onClick={() => setEditing('new')}>
            <Plus size={14} aria-hidden /> {t('New routine')}
          </button>
        </div>
      )}
    </Page>
  );
}

function RoutineForm({ db, bot, routine, onDone }: { db: SupabaseClient; bot: BotRow; routine?: RoutineRow; onDone: () => void }) {
  const [name, setName] = useState(routine?.name ?? '');
  const [prompt, setPrompt] = useState(routine?.prompt ?? '');
  const [kind, setKind] = useState<RoutineSchedule['kind']>(routine?.schedule.kind ?? 'daily');
  const [time, setTime] = useState(routine?.schedule.kind === 'daily' ? routine.schedule.time : '08:00');
  const [days, setDays] = useState<number[]>(routine?.schedule.kind === 'daily' ? (routine.schedule.days ?? []) : []);
  const [minutes, setMinutes] = useState(routine?.schedule.kind === 'interval' ? routine.schedule.minutes : 60);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim() || !prompt.trim()) return;
    const schedule: RoutineSchedule = kind === 'interval' ? { kind, minutes: Math.max(5, minutes) } : { kind, time, ...(days.length && days.length < 7 ? { days } : {}) };
    const tz = routine?.timezone ?? timeZone;
    const values = { name: name.trim(), prompt: prompt.trim(), schedule, timezone: tz, enabled: true, next_run_at: nextRun(schedule, tz).toISOString(), updated_at: new Date().toISOString() };
    setBusy(true);
    const { error } = routine
      ? await db.from('routines').update(values).eq('id', routine.id)
      : await db.from('routines').insert({ ...values, bot_id: bot.id, device_id: bot.device_id });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    onDone();
  }

  async function remove() {
    if (!routine) return;
    const { error } = await db.from('routines').delete().eq('id', routine.id);
    if (error) return setError(friendlyError(error));
    onDone();
  }

  return (
    <div className="routine-form">
      <label className="field">
        <span>{t('Name')}</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('e.g. Morning inbox')} maxLength={80} autoFocus />
      </label>
      <label className="field">
        <span>{t('What should the bot do?')}</span>
        <textarea className="input textarea" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t('e.g. Check my Gmail in the browser and sum up what needs an answer.')} maxLength={8000} />
      </label>
      <div className="worker-grid">
        <label className="field">
          <span>{t('When')}</span>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as RoutineSchedule['kind'])}>
            <option value="daily">{t('At a time of day')}</option>
            <option value="interval">{t('Every few minutes or hours')}</option>
          </select>
        </label>
        {kind === 'daily' ? (
          <label className="field">
            <span>{t('Time ({zone})', { zone: routine?.timezone ?? timeZone })}</span>
            <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        ) : (
          <label className="field">
            <span>{t('Every (minutes)')}</span>
            <input className="input tabular" type="number" min={5} step={5} value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 60)} />
          </label>
        )}
      </div>
      {kind === 'daily' && (
        <div className="day-toggles" role="group" aria-label={t('Days')}>
          {DAYS.map((d) => (
            <button key={d} type="button" aria-pressed={days.length === 0 || days.includes(d)} onClick={() => setDays((cur) => toggleDay(cur, d))}>
              {dayName(d)}
            </button>
          ))}
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button className="btn btn-primary" onClick={save} disabled={busy || !name.trim() || !prompt.trim()}>
          {routine ? t('Save') : t('Create routine')}
        </button>
        <button className="btn btn-ghost" onClick={onDone}>
          {t('Cancel')}
        </button>
        {routine && (
          <button className="btn btn-ghost push-right" onClick={remove}>
            <Trash2 size={14} aria-hidden /> {t('Delete')}
          </button>
        )}
      </div>
    </div>
  );
}

/** Empty means every day; toggling from there starts from all days minus the one clicked. */
function toggleDay(current: number[], day: number): number[] {
  const all = current.length ? current : DAYS;
  const next = all.includes(day) ? all.filter((d) => d !== day) : [...all, day];
  return next.length === 7 ? [] : next.length === 0 ? current : next;
}
