import type { BotRow, ConversationRow, DeviceRow } from '@a-bot/shared';
import { isDeviceOnline } from '@a-bot/shared';
import { ChevronsUpDown, Loader2, MessageSquare, Monitor, Plus, Settings } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { engineOf, engineState, relativeSeen } from '../lib/format';
import type { WorkerUpdate } from '../lib/workers';
import { BotAvatar } from './BotAvatar';
import { Brand } from './GateSide';
import { t } from '../lib/i18n';

export type View = 'chat' | 'desktop' | 'bot' | 'settings';

interface Props {
  email: string;
  devices: DeviceRow[];
  device?: DeviceRow;
  online: boolean;
  /** Background sandbox update on the selected device. */
  update?: WorkerUpdate;
  now: number;
  bots: BotRow[];
  /** Each bot's chat, for its last message and current activity. */
  latest: Map<string, ConversationRow>;
  botId?: string;
  /** Bot ids with a conversation in progress. */
  busyBots: Set<string>;
  view: View;
  canUseWorker: boolean;
  onSelectView: (view: 'chat' | 'desktop') => void;
  onSelectDevice: (id: string) => void;
  onSelectBot: (id: string) => void;
  onNewBot: () => void;
  onAddDevice: () => void;
  onOpenSettings: () => void;
}

export function Rail(p: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menuOpen]);

  return (
    <nav className="rail" aria-label={t('Bots and devices')}>
      <div className="rail-top">
        <Brand />
        {p.device && (
          <div className="device-switch" ref={menuRef}>
            <button className="device-btn" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)} title={p.device.name}>
              {p.update?.state === 'updating' ? <Loader2 size={10} className="spin" aria-hidden /> : <span className={`dot ${p.online ? 'on' : 'off'}`} aria-hidden />}
              <span className="meta">
                <span className="name">{p.device.name}</span>
                <span className="sub" title={p.update?.state === 'error' ? p.update.message : undefined}>
                  {p.update?.state === 'updating'
                    ? t('Updating the sandbox…')
                    : p.update?.state === 'error'
                      ? t('Update failed')
                      : p.online
                        ? t('Online')
                        : t('Offline, seen {when}', { when: relativeSeen(p.device.last_seen, p.now) })}
                </span>
              </span>
              <ChevronsUpDown size={14} aria-hidden />
            </button>
            {menuOpen && (
              <div className="menu" role="menu">
                {p.devices.map((d) => (
                  <button
                    key={d.id}
                    role="menuitemradio"
                    aria-checked={d.id === p.device?.id}
                    onClick={() => {
                      p.onSelectDevice(d.id);
                      setMenuOpen(false);
                    }}
                  >
                    <span className={`dot ${isDeviceOnline(d, p.now) ? 'on' : 'off'}`} aria-hidden />
                    {d.name}
                  </button>
                ))}
                <hr />
                <button
                  role="menuitem"
                  onClick={() => {
                    p.onAddDevice();
                    setMenuOpen(false);
                  }}
                >
                  <Plus size={15} aria-hidden /> {t('Add device')}
                </button>
              </div>
            )}
          </div>
        )}
        {p.device && p.canUseWorker && (
          <div className="view-tabs" role="group" aria-label={t('Device view')}>
            {(
              [
                ['chat', t('Chat'), MessageSquare],
                ['desktop', t('Desktop'), Monitor],
              ] as const
            ).map(([v, label, Icon]) => (
              <button key={v} aria-pressed={p.view === v} onClick={() => p.onSelectView(v)} title={label}>
                <Icon size={14} aria-hidden />
                <span className="meta">{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {p.device && (
        <>
          <div className="rail-section">
            <span>{t('Bots')}</span>
            <button className="rail-add" onClick={p.onNewBot} title={t('New bot')} aria-label={t('New bot')}>
              <Plus size={14} />
            </button>
          </div>
          <ul className="bot-list">
            {p.bots.map((b) => {
              const engine = engineOf(b, p.device);
              const state = engineState(engine);
              const working = p.busyBots.has(b.id);
              const chat = p.latest.get(b.id);
              return (
                <li key={b.id}>
                  <button
                    className={`bot-item${state.tone === 'on' ? '' : ' unavailable'}`}
                    aria-current={p.view === 'chat' && p.botId === b.id}
                    onClick={() => p.onSelectBot(b.id)}
                    title={`${b.name}: ${working ? t('working') : state.label}`}
                  >
                    <BotAvatar bot={{ name: b.name, kind: engine?.kind, color: b.color }} />
                    <span className="meta">
                      <span className="name">{b.name}</span>
                      <span className="sub">{botStatus(b, chat, working, state, engine?.name)}</span>
                    </span>
                    {working ? <span className="working" aria-label={t('working')} /> : state.tone === 'warn' ? <span className="dot warn" aria-hidden /> : null}
                  </button>
                </li>
              );
            })}
            {p.bots.length === 0 && (
              <li>
                <button className="bot-item bot-new" onClick={p.onNewBot}>
                  <span className="avatar ghost" aria-hidden>
                    <Plus size={15} />
                  </span>
                  <span className="meta">
                    <span className="name">{t('Create a bot')}</span>
                  </span>
                </button>
              </li>
            )}
          </ul>
        </>
      )}

      <div className="rail-bottom">
        <button className="rail-link" aria-current={p.view === 'settings'} onClick={p.onOpenSettings} title={p.email}>
          <Settings size={16} aria-hidden />
          <span className="grow">{t('Settings')}</span>
        </button>
      </div>
    </nav>
  );
}

/** Under the bot's name: what it is doing now, else its last message, else what it runs on. */
function botStatus(bot: BotRow, chat: ConversationRow | undefined, working: boolean, state: { label: string; tone: string }, engineName?: string): string {
  if (working) return chat?.activity ?? t('Working…');
  if (state.tone !== 'on') return state.label;
  return chat?.last_message_preview ?? ([engineName, bot.model].filter(Boolean).join(' · ') || t('Ready'));
}
