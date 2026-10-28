import type { BotRow, ConversationRow, DeviceRow, MessageRow, ProviderInfo } from '@a-bot/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Pencil, Trash2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { friendlyError } from '../lib/backend';
import { useMessages } from '../lib/data';
import { engineState } from '../lib/format';
import { BotAvatar } from './BotAvatar';
import { Composer } from './Composer';
import { Message } from './Message';

interface Props {
  db: SupabaseClient;
  device: DeviceRow;
  online: boolean;
  bot: BotRow;
  /** The engine the bot runs on, as the device reports it. */
  engine?: ProviderInfo;
  conversation?: ConversationRow;
  onCreated: (id: string) => void;
  onDeleted: () => void;
  onEditBot: () => void;
  onOpenAccounts: () => void;
}

const SUGGESTIONS = ['Co jest w /workspace?', 'Otwórz przeglądarkę i sprawdź pogodę w Krakowie', 'Zainstaluj ffmpeg i pokaż wersję'];

export function Chat({ db, device, online, bot, engine, conversation, onCreated, onDeleted, onEditBot, onOpenAccounts }: Props) {
  const messages = useMessages(db, conversation?.id);
  const [sendError, setSendError] = useState<string>();
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
    if (!conversation) onCreated(conversationId);
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

  async function remove() {
    if (!conversation) return;
    await db.from('conversations').delete().eq('id', conversation.id);
    onDeleted();
  }

  const blocked =
    state.tone !== 'on'
      ? {
          text: engine
            ? `${bot.name} działa na ${engine.name}, który ${state.tone === 'warn' ? 'wymaga logowania' : 'nie jest zainstalowany'} na „${device.name}”.`
            : `Silnik „${bot.engine}” nie jest dostępny na „${device.name}”.`,
          hint: engine && (engine.kind === 'claude' || engine.kind === 'codex') ? undefined : engine?.setupHint,
          action: engine?.kind === 'claude' || engine?.kind === 'codex' ? { label: 'Zaloguj w Ustawieniach', onClick: onOpenAccounts } : { label: 'Edytuj bota', onClick: onEditBot },
          hard: true,
        }
      : !online
        ? { text: `„${device.name}” jest offline. Wiadomość poczeka i bot odpowie, gdy urządzenie wróci.`, hard: false }
        : undefined;

  return (
    <main className="chat">
      <header className="chat-head">
        <BotAvatar bot={avatar} />
        <div className="titles">
          <span className="title">{conversation?.title ?? `Nowa rozmowa: ${bot.name}`}</span>
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
        <button className="icon-btn" onClick={onEditBot} title="Edytuj bota" aria-label="Edytuj bota">
          <Pencil size={15} />
        </button>
        {conversation && (
          <button className="icon-btn" onClick={remove} title="Usuń rozmowę" aria-label="Usuń rozmowę" disabled={Boolean(running)}>
            <Trash2 size={16} />
          </button>
        )}
      </header>

      {conversation ? (
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
                  <button key={s} className="suggestion" onClick={() => send(s)}>
                    {s}
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
