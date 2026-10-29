import { AlertTriangle, ArrowUp, Square } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { t } from '../lib/i18n';

interface Props {
  botName: string;
  disabled: boolean;
  running: boolean;
  blocked?: { text: string; hint?: string; action?: { label: string; onClick: () => void }; hard: boolean };
  error?: string;
  onSend: (text: string) => Promise<boolean>;
  onStop: () => void;
}

export function Composer({ botName, disabled, running, blocked, error, onSend, onStop }: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text]);

  useEffect(() => {
    if (!disabled) ref.current?.focus();
  }, [disabled]);

  async function submit() {
    const value = text.trim();
    if (!value || sending || running || disabled) return;
    setSending(true);
    const ok = await onSend(value);
    setSending(false);
    if (ok) setText('');
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="composer-wrap">
      {blocked && (
        <div className="composer-blocked" role="status">
          <AlertTriangle size={16} style={{ flex: 'none', marginTop: 2 }} aria-hidden />
          <span>
            {blocked.text}
            {blocked.hint && <> {renderHint(blocked.hint)}</>}
            {blocked.action && (
              <>
                {' '}
                <button className="link-btn" onClick={blocked.action.onClick}>
                  {blocked.action.label}
                </button>
              </>
            )}
          </span>
        </div>
      )}
      <div className="composer">
        <label className="sr-only" htmlFor="composer-input">
          {t('Message to {bot}', { bot: botName })}
        </label>
        <textarea
          id="composer-input"
          ref={ref}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('Write to {bot}…', { bot: botName })}
          disabled={disabled}
        />
        <div className="composer-bar">
          <span className="hint">{error ? <span className="form-error">{error}</span> : running ? t('The bot is working. You can stop it.') : t('Enter sends, Shift+Enter adds a new line')}</span>
          {running ? (
            <button className="send stop" onClick={onStop} aria-label={t('Stop')} title={t('Stop')}>
              <Square size={13} fill="currentColor" />
            </button>
          ) : (
            <button className="send" onClick={submit} disabled={!text.trim() || sending || disabled} aria-label={t('Send')} title={t('Send')}>
              <ArrowUp size={17} strokeWidth={2.4} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** "Zaloguj: docker exec …" → "Zaloguj:" + copyable command; anything else as plain text. */
function renderHint(hint: string) {
  const m = hint.match(/^(.+?):\s+(.+)$/);
  if (!m) return hint;
  return (
    <>
      {m[1]}: <code>{m[2]}</code>
    </>
  );
}
