import type { BotRow, DeviceRow, ProviderInfo, ProviderKind } from '@a-bot/shared';

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
  return engine ? botState(engine) : { label: 'Silnik niedostępny', tone: 'off' };
}

export function botState(p: ProviderInfo): { label: string; tone: 'on' | 'warn' | 'off' } {
  if (!p.installed) return { label: 'Nie zainstalowany', tone: 'off' };
  if (!p.authenticated) return { label: 'Wymaga logowania', tone: 'warn' };
  return { label: 'Gotowy', tone: 'on' };
}

const timeFmt = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' });

export function shortTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (d.toDateString() === now.toDateString()) return timeFmt.format(d);
  return dayFmt.format(d);
}

export function groupLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (days <= 0) return 'Dzisiaj';
  if (days === 1) return 'Wczoraj';
  if (days < 7) return 'Ostatnie 7 dni';
  if (days < 30) return 'Ostatnie 30 dni';
  return 'Starsze';
}

export function relativeSeen(iso: string | null, now = Date.now()): string {
  if (!iso) return 'nigdy';
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return 'przed chwilą';
  if (s < 3600) return `${Math.round(s / 60)} min temu`;
  if (s < 86_400) return `${Math.round(s / 3600)} godz. temu`;
  return dayFmt.format(new Date(iso));
}

export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const mod10 = n % 10;
  const mod100 = n % 100;
  return mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many;
}
