import type { Metadata, Viewport } from 'next';
import './globals.css';
import { currentLocale } from '@/i18n/server';
import { getDictionary } from '@/i18n';
import { I18nProvider } from '@/i18n/provider';

export const metadata: Metadata = {
  title: 'ONEBOOK · ระบบบัญชีกลุ่มบริษัท',
  description: 'ระบบบัญชีภายในองค์กรสำหรับกลุ่มบริษัท - ปลอดภัย ตรวจสอบได้ รองรับ 3 ภาษา',
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = currentLocale();
  const dict = getDictionary(locale);
  return (
    <html lang={locale === 'zh' ? 'zh-CN' : locale} className="light">
      <body className="min-h-screen bg-ink-50">
        <I18nProvider dict={dict} locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
