// Interface language. Strings are written in English in the code; other languages map English → translation.
// Placeholders: t('Hello {name}', { name }).
import { pl } from './i18n.pl';

export type Lang = 'en' | 'pl';
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'pl', label: 'Polski' },
];

const KEY = 'a-bot.lang';
const dictionaries: Record<Lang, Record<string, string> | undefined> = { en: undefined, pl };

function stored(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'pl' || v === 'en' ? v : 'en';
  } catch {
    return 'en';
  }
}

export const lang: Lang = stored();
export const locale = lang === 'pl' ? 'pl-PL' : 'en-US';

/** Switching language reloads the window, so every string is rendered again. */
export function setLang(next: Lang) {
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // storage unavailable: stays on the current language
  }
  location.reload();
}

export function t(text: string, vars?: Record<string, string | number>): string {
  const out = dictionaries[lang]?.[text] ?? text;
  return vars ? out.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : out;
}

/** Count with the right plural form: tn(3, 'step', 'steps') → "3 steps" / "3 kroki". */
export function tn(n: number, one: string, many: string): string {
  if (lang === 'pl') {
    const forms = (pl[`${one}|${many}`] ?? `${one}|${many}|${many}`).split('|');
    const mod10 = n % 10;
    const mod100 = n % 100;
    const form = n === 1 ? forms[0] : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? forms[1] : forms[2];
    return `${n} ${form}`;
  }
  return `${n} ${n === 1 ? one : many}`;
}
