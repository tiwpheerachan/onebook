import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALES, type Locale } from './config';
import { getDictionary } from './index';

export function currentLocale(): Locale {
  const c = cookies().get(LOCALE_COOKIE)?.value as Locale | undefined;
  return c && LOCALES.includes(c) ? c : DEFAULT_LOCALE;
}

export function t() {
  return getDictionary(currentLocale());
}
