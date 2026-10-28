import type { ProviderKind } from '@a-bot/shared';
import type { CSSProperties } from 'react';
import { botHue, botMonogram } from '../lib/format';

export interface AvatarInfo {
  name: string;
  kind?: ProviderKind;
  color?: string | null;
}

export function BotAvatar({ bot, size }: { bot: AvatarInfo; size?: 'sm' | 'lg' }) {
  const style = { '--bot-hue': bot.color || botHue(bot.kind ?? 'custom') } as CSSProperties;
  return (
    <span className={`avatar${size ? ` ${size}` : ''}`} style={style} aria-hidden>
      {botMonogram(bot)}
    </span>
  );
}
