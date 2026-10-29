// Which animated icon stands for a bot. A per-device preference, kept in localStorage.
import { useSyncExternalStore } from 'react';

export type BotIconStyle = 'robot' | 'cloud' | 'blob';
export type BotIconState = 'idle' | 'think' | 'work';

export const BOT_ICON_STYLES: { id: BotIconStyle; label: string }[] = [
  { id: 'robot', label: 'Robot' },
  { id: 'cloud', label: 'Cloud' },
  { id: 'blob', label: 'Jelly' },
];

const KEY = 'a-bot.botIcon';
const DEFAULT: BotIconStyle = 'cloud';
const listeners = new Set<() => void>();

function read(): BotIconStyle {
  try {
    const v = localStorage.getItem(KEY);
    return BOT_ICON_STYLES.some((s) => s.id === v) ? (v as BotIconStyle) : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

let current = read();

export function setBotIconStyle(next: BotIconStyle) {
  current = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // storage unavailable: the choice lasts until the window reloads
  }
  listeners.forEach((l) => l());
}

export function useBotIconStyle(): BotIconStyle {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

/** Thinking until the reply shows its first words or tool call, working while it streams. */
export function iconState(m: { status: string; text: string | null; steps: unknown[] }): BotIconState {
  if (m.status === 'pending') return 'think';
  if (m.status === 'streaming') return m.text || m.steps.length > 0 ? 'work' : 'think';
  return 'idle';
}
