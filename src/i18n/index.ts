import th, { type Dictionary } from './dictionaries/th';
import en from './dictionaries/en';
import zh from './dictionaries/zh';
import { DEFAULT_LOCALE, type Locale } from './config';

const DICTS: Record<Locale, Dictionary> = { th, en, zh };

export function getDictionary(locale?: string | null): Dictionary {
  const key = (locale || DEFAULT_LOCALE) as Locale;
  return DICTS[key] ?? DICTS[DEFAULT_LOCALE];
}
export type { Dictionary };
