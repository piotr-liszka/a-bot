import type { ProviderKind } from '@a-bot/shared';
import type { CSSProperties } from 'react';
import { useBotIconStyle, type BotIconState } from '../lib/botIcon';
import { botHue } from '../lib/format';
import { BotIcon } from './BotIcon';

export interface AvatarInfo {
  name: string;
  kind?: ProviderKind;
  color?: string | null;
}

/** Spreads the idle loops of different bots so a list of icons doesn't blink in unison. */
function phase(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return `${-(h % 40) / 10}s`;
}

export function BotAvatar({ bot, size, state }: { bot: AvatarInfo; size?: 'sm' | 'lg'; state?: BotIconState }) {
  const style = useBotIconStyle();
  const css = { '--c': bot.color || botHue(bot.kind ?? 'custom'), '--bi-d': phase(bot.name) } as CSSProperties;
  return (
    <span className={`avatar avatar-icon${size ? ` ${size}` : ''}`} style={css} aria-hidden>
      <BotIcon style={style} state={state} />
    </span>
  );
}
