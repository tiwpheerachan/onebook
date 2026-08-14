export const LOCALES = ['th', 'en', 'zh'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = (process.env.NEXT_PUBLIC_DEFAULT_LOCALE as Locale) || 'th';
export const LOCALE_COOKIE = 'ob_locale';

export const LOCALE_LABEL: Record<Locale, string> = {
  th: 'ไทย',
  en: 'English',
  zh: '中文',
};
