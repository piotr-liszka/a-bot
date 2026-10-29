import type { CSSProperties } from 'react';
import { BOT_ICON_STYLES, setBotIconStyle, useBotIconStyle } from '../lib/botIcon';
import { t } from '../lib/i18n';
import { BotIcon } from './BotIcon';

const SAMPLE = { '--c': 'oklch(0.64 0.2 258)' } as CSSProperties;

export function BotIconPicker() {
  const current = useBotIconStyle();
  return (
    <div className="icon-choices" role="radiogroup" aria-label={t('Bot icon')}>
      {BOT_ICON_STYLES.map((s) => (
        <button key={s.id} type="button" role="radio" aria-checked={current === s.id} className="icon-choice" onClick={() => setBotIconStyle(s.id)}>
          <span className="avatar avatar-icon" style={SAMPLE}>
            <BotIcon style={s.id} state={current === s.id ? 'work' : 'idle'} />
          </span>
          {t(s.label)}
        </button>
      ))}
    </div>
  );
}
