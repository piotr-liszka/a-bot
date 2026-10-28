import type { ConversationRow, DeviceRow, MessageRow, ProviderInfo } from '@a-bot/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Trash2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { friendlyError } from '../lib/backend';
import { useMessages } from '../lib/data';
import { botState } from '../lib/format';
import { BotAvatar } from './BotAvatar';
import { Composer } from './Composer';
import { Message } from './Message';

interface Props {
  db: SupabaseClient;
  device: DeviceRow;
  online: boolean;
  bot: ProviderInfo;
  conversation?: ConversationRow;
  onCreated: (id: string) => void;
  onDeleted: () => void;
}

const SUGGESTIONS: Record<string, string[]> = {
  shell: ['ls -la', 'df -h && free -h', 'cat /etc/os-release'],
  default: ['Co jest w /workspace?', 'Otwórz przeglądarkę i sprawdź pogodę w Krakowie', 'Zainstaluj ffmpeg i pokaż wersję'],
};

export function Chat({ db, device, online, bot, conversation, onCreated, onDeleted }: Props) {
  const messages = useMessages(db, conversation?.id);
  const [model, setModel] = useState<string>(conversation?.model ?? bot.defaultModel ?? '');
  const [sendError, setSendError] = useState<string>();
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const last = messages.rows[messages.rows.length - 1];
  const running = last?.role === 'assistant' && (last.status === 'pending' || last.status === 'streaming') ? last : undefined;
  const state = botState(bot);

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
        .insert({ device_id: device.id, provider_id: bot.id, model: model || null })
        .select('id')
        .single();
      if (error) {
        setSendError(friendlyError(error));
        return false;
      }
      conversationId = data.id as string;
    }
    const { error } = await db.rpc('send_message', { p_conversation_id: conversationId, p_text: text, p_model: model || null });
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

  async function changeModel(next: string) {
    setModel(next);
    if (conversation) await db.from('conversations').update({ model: next || null }).eq('id', conversation.id);
  }

  async function remove() {
    if (!conversation) return;
    await db.from('conversations').delete().eq('id', conversation.id);
    onDeleted();
  }

  const blocked =
    state.tone !== 'on'
      ? { text: `${bot.name}: ${state.label.toLowerCase()} na „${device.name}”.`, hint: bot.setupHint, hard: true }
      : !online
        ? { text: `„${device.name}” jest offline. Wiadomość poczeka i bot odpowie, gdy urządzenie wróci.`, hard: false }
        : undefined;

  return (
    <main className="chat">
      <header className="chat-head">
        <BotAvatar bot={bot} />
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
        {bot.models.length > 0 && (
          <select className="select" value={model} onChange={(e) => changeModel(e.target.value)} aria-label="Model">
            {!bot.defaultModel && <option value="">Domyślny model</option>}
            {bot.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}
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
              <Message key={m.id} message={m} bot={bot} online={online} />
            ))}
          </div>
        </div>
      ) : (
        <div className="intro">
          <div className="intro-inner">
            <BotAvatar bot={bot} size="lg" />
            <h1>{bot.name}</h1>
            <p>{bot.description}</p>
            {state.tone === 'on' && (
              <div className="suggestions">
                {(SUGGESTIONS[bot.kind] ?? SUGGESTIONS.default).map((s) => (
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
        isShell={bot.kind === 'shell'}
      />
    </main>
  );
}

function shortPath(path: string): string {
  if (path.length <= 32) return path;
  const parts = path.split('/').filter(Boolean);
  return `…/${parts.slice(-2).join('/')}`;
}
