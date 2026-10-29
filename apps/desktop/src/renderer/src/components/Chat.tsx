import type { BotRow, ConversationRow, DeviceRow, MessageRow, ProviderInfo } from '@a-bot/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Eraser, Pencil } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { friendlyError } from '../lib/backend';
import { useMessages } from '../lib/data';
import { engineState } from '../lib/format';
import { BotAvatar } from './BotAvatar';
import { Composer } from './Composer';
import { Message } from './Message';
import { t } from '../lib/i18n';

interface Props {
  db: SupabaseClient;
  device: DeviceRow;
  online: boolean;
  bot: BotRow;
  /** The engine the bot runs on, as the device reports it. */
  engine?: ProviderInfo;
  /** The bot's one chat; undefined until the first message or after clearing. */
  conversation?: ConversationRow;
  loading: boolean;
  onCleared: (conversationId: string) => void;
  onEditBot: () => void;
  onOpenAccounts: () => void;
}

const SUGGESTIONS = ['What is in /workspace?', 'Open the browser and check the weather in Kraków', 'Install ffmpeg and show its version'];

export function Chat({ db, device, online, bot, engine, conversation, loading, onCleared, onEditBot, onOpenAccounts }: Props) {
  const messages = useMessages(db, conversation?.id);
  const [sendError, setSendError] = useState<string>();
  const [confirmClear, setConfirmClear] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const last = messages.rows[messages.rows.length - 1];
  const running = last?.role === 'assistant' && (last.status === 'pending' || last.status === 'streaming') ? last : undefined;
  const state = engineState(engine);
  const avatar = { name: bot.name, kind: engine?.kind, color: bot.color };
  const modelLabel = bot.model ?? engine?.defaultModel;

  // Follow new output while the reader is at the bottom; leave them alone if they scrolled up.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages.rows]);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => {
      stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  async function send(text: string): Promise<boolean> {
    setSendError(undefined);
    stickToBottom.current = true;
    let conversationId = conversation?.id;
    if (!conversationId) {
      const { data, error } = await db
        .from('conversations')
        .insert({ device_id: device.id, bot_id: bot.id, provider_id: bot.engine })
        .select('id')
        .single();
      if (error) {
        setSendError(friendlyError(error));
        return false;
      }
      conversationId = data.id as string;
    }
    const { error } = await db.rpc('send_message', { p_conversation_id: conversationId, p_text: text });
    if (error) {
      setSendError(friendlyError(error));
      return false;
    }
    return true;
  }

  async function stop() {
    if (!running) return;
    if (running.status === 'pending') {
      await db.from('messages').update({ status: 'cancelled', finished_at: new Date().toISOString() }).eq('id', running.id).eq('status', 'pending');
      await db.from('conversations').update({ busy: false }).eq('id', running.conversation_id);
    } else {
      await db.from('messages').update({ cancel_requested: true }).eq('id', running.id);
    }
  }

  /** Starts over: drops this chat (the bot's memory stays) and the next message opens a new one. */
  async function clear() {
    if (!conversation) return;
    setConfirmClear(false);
    const { error } = await db.from('conversations').delete().eq('id', conversation.id);
    if (error) setSendError(friendlyError(error));
    else onCleared(conversation.id);
  }

  const blocked =
    state.tone !== 'on'
      ? {
          text: engine
            ? t(state.tone === 'warn' ? '{bot} runs on {engine}, which needs signing in on “{device}”.' : '{bot} runs on {engine}, which is not installed on “{device}”.', {
                bot: bot.name,
                engine: engine.name,
                device: device.name,
              })
            : t('Engine “{engine}” is not available on “{device}”.', { engine: bot.engine, device: device.name }),
          hint: engine && (engine.kind === 'claude' || engine.kind === 'codex') ? undefined : engine?.setupHint && t(engine.setupHint),
          action: engine?.kind === 'claude' || engine?.kind === 'codex' ? { label: t('Sign in under Settings'), onClick: onOpenAccounts } : { label: t('Edit bot'), onClick: onEditBot },
          hard: true,
        }
      : !online
        ? { text: t('“{device}” is offline. Your message will wait and the bot will answer when the device is back.', { device: device.name }), hard: false }
        : undefined;

  return (
    <main className="chat">
      <header className="chat-head">
        <BotAvatar bot={avatar} />
        <div className="titles">
          <span className="title">{bot.name}</span>
          <span className="sub">
            <span className={`dot ${online ? 'on' : 'off'}`} aria-hidden />
            <span style={{ whiteSpace: 'nowrap' }}>{device.name}</span>
            {device.workspace && (
              <>
                <span aria-hidden>·</span>
                <span className="path" title={device.workspace}>
                  {shortPath(device.workspace)}
                </span>
              </>
            )}
          </span>
        </div>
        <button className="icon-btn" onClick={onEditBot} title={t('Edit bot')} aria-label={t('Edit bot')}>
          <Pencil size={15} />
        </button>
        {conversation &&
          (confirmClear ? (
            <>
              <button className="btn btn-sm btn-danger" onClick={clear} disabled={Boolean(running)}>
                {t('Clear chat')}
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => setConfirmClear(false)}>
                {t('Cancel')}
              </button>
            </>
          ) : (
            <button className="icon-btn" onClick={() => setConfirmClear(true)} title={t('Clear chat: memory stays')} aria-label={t('Clear chat')} disabled={Boolean(running)}>
              <Eraser size={16} />
            </button>
          ))}
      </header>

      {conversation || loading ? (
        <div className="scroller" ref={scroller}>
          <div className="thread" aria-live="polite">
            {messages.rows.map((m: MessageRow) => (
              <Message key={m.id} message={m} bot={avatar} online={online} />
            ))}
          </div>
        </div>
      ) : (
        <div className="intro">
          <div className="intro-inner">
            <BotAvatar bot={avatar} size="lg" />
            <h1>{bot.name}</h1>
            <p>
              {[engine?.name ?? bot.engine, modelLabel].filter(Boolean).join(' · ')}
              {bot.instructions && <span className="intro-instructions">{bot.instructions}</span>}
            </p>
            {state.tone === 'on' && (
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="suggestion" onClick={() => send(t(s))}>
                    {t(s)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <Composer
        botName={bot.name}
        disabled={Boolean(blocked?.hard)}
        running={Boolean(running)}
        blocked={blocked}
        error={sendError}
        onSend={send}
        onStop={stop}
      />
    </main>
  );
}

function shortPath(path: string): string {
  if (path.length <= 32) return path;
  const parts = path.split('/').filter(Boolean);
  return `…/${parts.slice(-2).join('/')}`;
}
