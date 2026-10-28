import type { ProviderInfo } from '@a-bot/shared';
import { Terminal } from 'lucide-react';
import type { CSSProperties } from 'react';
import { botHue, botMonogram } from '../lib/format';

export function BotAvatar({ bot, size }: { bot: Pick<ProviderInfo, 'kind' | 'name'>; size?: 'sm' | 'lg' }) {
  const style = { '--bot-hue': botHue(bot.kind) } as CSSProperties;
  return (
    <span className={`avatar${size ? ` ${size}` : ''}`} style={style} aria-hidden>
      {bot.kind === 'shell' ? <Terminal size={size === 'sm' ? 12 : 15} strokeWidth={2.2} /> : botMonogram(bot)}
    </span>
  );
}
