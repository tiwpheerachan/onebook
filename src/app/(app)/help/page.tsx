import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionContext, can } from '@/lib/session';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader } from '@/components/ui/page-header';
import { HELP, GAPS } from '@/lib/help/content';
import { tx } from '@/lib/help/types';
import {
  Rocket, Settings, TrendingUp, ShoppingCart, Wallet, Package,
  Receipt, ClipboardCheck, ChevronRight, Lightbulb, BookOpen,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

const ICONS: Record<string, any> = {
  Rocket, Settings, TrendingUp, ShoppingCart, Wallet, Package, Receipt, ClipboardCheck,
};

export default async function HelpPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');

  const d = t();
  const L = d.ui.help;
  const locale = currentLocale();

  // ซ่อนบทความที่พูดถึงเมนูซึ่งผู้ใช้คนนี้ไม่มีสิทธิ์เข้า
  const cats = HELP
    .map((c) => ({ ...c, articles: c.articles.filter((a) => !a.resource || can(ctx, a.resource, 'view')) }))
    .filter((c) => c.articles.length > 0);

  return (
    <>
      <PageHeader title={L.title} subtitle={L.subtitle} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cats.map((c) => {
          const Icon = ICONS[c.icon] || BookOpen;
          return (
            <Link
              key={c.slug}
              href={`/help/${c.slug}`}
              className="card group flex flex-col p-5 transition hover:border-brand-300 hover:shadow-pop"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50">
                  <Icon className="h-4 w-4 text-brand-600" strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-900">{tx(c.title, locale)}</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-500">{tx(c.summary, locale)}</p>
                </div>
              </div>
              <p className="mt-4 flex items-center gap-1 text-xxs text-ink-400 group-hover:text-brand-600">
                {c.articles.length} {L.articles}
                <ChevronRight className="h-3 w-3" strokeWidth={2} />
              </p>
            </Link>
          );
        })}
      </div>

      {/* ---------- สิ่งที่ยังไม่มี ---------- */}
      <div className="card mt-6 p-5">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-500" strokeWidth={1.8} />
          <h2 className="text-sm font-semibold text-ink-900">{L.gapsTitle}</h2>
        </div>
        <p className="mt-0.5 text-xs text-ink-500">{L.gapsHint}</p>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {GAPS.map((g) => (
            <div key={g.title.en} className="rounded-xl border border-ink-200 p-4">
              <p className="text-sm font-medium text-ink-900">{tx(g.title, locale)}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-500">{tx(g.detail, locale)}</p>
              <p className="mt-3 text-xxs font-semibold uppercase tracking-wide text-ink-400">{L.workaround}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-700">{tx(g.workaround, locale)}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-ink-400">{L.searchHint}</p>
    </>
  );
}
