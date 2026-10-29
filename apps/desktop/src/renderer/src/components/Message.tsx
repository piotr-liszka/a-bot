import type { MessageRow } from '@a-bot/shared';
import { AlertCircle, Ban } from 'lucide-react';
import { memo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { shortTime } from '../lib/format';
import { BotAvatar, type AvatarInfo } from './BotAvatar';
import { Trace } from './Trace';
import { t, tn } from '../lib/i18n';

function MessageView({ message: m, bot, online }: { message: MessageRow; bot: AvatarInfo; online: boolean }) {
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
            <span className="working" aria-hidden /> {online ? t('The bot is starting…') : t('Waiting for the device to come online…')}
          </p>
        ) : m.status === 'streaming' && m.steps.length === 0 ? (
          <p className="msg-note">
            <span className="working" aria-hidden /> {t('Thinking…')}
          </p>
        ) : null}
        {m.status === 'error' && (
          <div className="msg-error" role="alert">
            <AlertCircle size={16} aria-hidden />
            <p>{m.error ? t(m.error) : t('The bot did not finish its answer.')}</p>
          </div>
        )}
        {m.status === 'cancelled' && (
          <p className="msg-note">
            <Ban size={14} aria-hidden /> {t('Stopped')}
          </p>
        )}
        {m.status === 'done' && (seconds || m.usage) && (
          <div className="msg-foot tabular">
            {seconds && <span>{seconds} s</span>}
            {m.usage?.outputTokens ? <span>{tn(m.usage.outputTokens, 'token', 'tokens')}</span> : null}
            {m.usage?.costUsd ? <span>${m.usage.costUsd.toFixed(3)} {t('(per CLI)')}</span> : null}
          </div>
        )}
      </div>
    </article>
  );
}

export const Message = memo(MessageView);
