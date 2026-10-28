import type { MessageRow, ProviderInfo } from '@a-bot/shared';
import { AlertCircle, Ban } from 'lucide-react';
import { memo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { shortTime } from '../lib/format';
import { BotAvatar } from './BotAvatar';
import { Trace } from './Trace';

function MessageView({ message: m, bot, online }: { message: MessageRow; bot: ProviderInfo; online: boolean }) {
  if (m.role === 'user') return <div className="msg-user">{m.text}</div>;

  const live = m.status === 'pending' || m.status === 'streaming';
  const seconds = m.finished_at ? Math.max(1, Math.round((Date.parse(m.finished_at) - Date.parse(m.created_at)) / 1000)) : undefined;
  return (
    <article className="msg-bot">
      <BotAvatar bot={bot} />
      <div className="body">
        <div className="who">
          <strong>{bot.name}</strong>
          <span className="tabular">
            {m.model ? `${m.model} · ` : ''}
            {shortTime(m.created_at)}
          </span>
        </div>
        {m.steps.length > 0 && <Trace steps={m.steps} live={live} />}
        {m.text ? (
          <div className={`prose${m.status === 'streaming' ? ' caret' : ''}`}>
            <Markdown remarkPlugins={[remarkGfm]}>{m.text}</Markdown>
          </div>
        ) : m.status === 'pending' ? (
          <p className="msg-note">
            <span className="working" aria-hidden /> {online ? 'Bot zaczyna pracę…' : 'Czeka, aż urządzenie będzie online…'}
          </p>
        ) : m.status === 'streaming' && m.steps.length === 0 ? (
          <p className="msg-note">
            <span className="working" aria-hidden /> Myśli…
          </p>
        ) : null}
        {m.status === 'error' && (
          <div className="msg-error" role="alert">
            <AlertCircle size={16} aria-hidden />
            <p>{m.error ?? 'Bot nie dokończył odpowiedzi.'}</p>
          </div>
        )}
        {m.status === 'cancelled' && (
          <p className="msg-note">
            <Ban size={14} aria-hidden /> Zatrzymano
          </p>
        )}
        {m.status === 'done' && (seconds || m.usage) && (
          <div className="msg-foot tabular">
            {seconds && <span>{seconds} s</span>}
            {m.usage?.outputTokens ? <span>{m.usage.outputTokens.toLocaleString('pl-PL')} tokenów</span> : null}
            {m.usage?.costUsd ? <span>${m.usage.costUsd.toFixed(3)} (wg CLI)</span> : null}
          </div>
        )}
      </div>
    </article>
  );
}

export const Message = memo(MessageView);
