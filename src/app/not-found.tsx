import Link from 'next/link';
import { t } from '@/i18n/server';

export default function NotFound() {
  const M = t().ui.misc;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ink-50">
      <p className="text-5xl font-semibold text-ink-300">404</p>
      <p className="text-sm text-ink-600">{M.notFound}</p>
      <Link href="/dashboard" className="btn-primary">{M.backToDashboard}</Link>
    </main>
  );
}
