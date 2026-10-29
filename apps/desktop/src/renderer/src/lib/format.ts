import type { BotRow, DeviceRow, ProviderInfo, ProviderKind } from '@a-bot/shared';
import { locale, t } from './i18n';

const hues: Record<ProviderKind, string> = {
  claude: 'oklch(0.62 0.135 42)',
  codex: 'oklch(0.42 0.02 264)',
  ollama: 'oklch(0.56 0.1 160)',
  custom: 'oklch(0.52 0.13 305)',
};

export function botHue(kind: ProviderKind): string {
  return hues[kind] ?? hues.custom;
}

export function botMonogram(p: Pick<ProviderInfo, 'name'>): string {
  return p.name.trim().charAt(0).toUpperCase() || '?';
}

/** The engine (detected CLI) a bot runs on, if the device still reports it. */
export function engineOf(bot: Pick<BotRow, 'engine'>, device: DeviceRow | undefined): ProviderInfo | undefined {
  return device?.providers.find((p) => p.id === bot.engine);
}

export function engineState(engine: ProviderInfo | undefined): { label: string; tone: 'on' | 'warn' | 'off' } {
  return engine ? botState(engine) : { label: t('Engine unavailable'), tone: 'off' };
}

export function botState(p: ProviderInfo): { label: string; tone: 'on' | 'warn' | 'off' } {
  if (!p.installed) return { label: t('Not installed'), tone: 'off' };
  if (!p.authenticated) return { label: t('Needs sign-in'), tone: 'warn' };
  return { label: t('Ready'), tone: 'on' };
}

const timeFmt = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });

export function shortTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (d.toDateString() === now.toDateString()) return timeFmt.format(d);
  return dayFmt.format(d);
}

export function relativeSeen(iso: string | null, now = Date.now()): string {
  if (!iso) return t('never');
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return t('just now');
  if (s < 3600) return t('{n} min ago', { n: Math.round(s / 60) });
  if (s < 86_400) return t('{n} h ago', { n: Math.round(s / 3600) });
  return dayFmt.format(new Date(iso));
}
