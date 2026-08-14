import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionContext, can } from '@/lib/session';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader } from '@/components/ui/page-header';
import { findCategory, findArticle } from '@/lib/help/content';
import { tx } from '@/lib/help/types';
import { ChevronLeft, ArrowUpRight, Info } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function HelpArticlePage({
  params,
}: {
  params: { category: string; article: string };
}) {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');

  const cat = findCategory(params.category);
  const art = findArticle(params.category, params.article);
  if (!cat || !art) notFound();

  const d = t();
  const L = d.ui.help;
  const locale = currentLocale();

  // บทความที่พูดถึงเมนูซึ่งไม่มีสิทธิ์ ไม่ควรเปิดอ่านตรง ๆ ได้
  if (art.resource && !can(ctx, art.resource, 'view')) notFound();

  return (
    <>
      <Link
        href={`/help/${cat.slug}`}
        className="mb-3 inline-flex items-center gap-1 text-xs text-ink-500 hover:text-brand-600"
      >
        <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} /> {tx(cat.title, locale)}
      </Link>

      <PageHeader title={tx(art.title, locale)} subtitle={tx(art.summary, locale)} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="card p-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-400">{L.steps}</h2>

          <ol className="mt-4 space-y-4">
            {art.steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xxs font-semibold text-brand-700">
                  {i + 1}
                </span>
                <p className="pt-0.5 text-sm leading-relaxed text-ink-800">{tx(s, locale)}</p>
              </li>
            ))}
          </ol>

          {art.tips && art.tips.length > 0 && (
            <div className="mt-6 rounded-xl bg-amber-50/70 p-4 ring-1 ring-inset ring-amber-200">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                <Info className="h-3.5 w-3.5" strokeWidth={2} /> {L.tips}
              </p>
              <ul className="mt-2 space-y-1.5">
                {art.tips.map((tip, i) => (
                  <li key={i} className="text-xs leading-relaxed text-amber-900">• {tx(tip, locale)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {art.href && (
            <Link href={art.href} className="btn-primary w-full justify-center">
              {L.openPage} <ArrowUpRight className="h-4 w-4" strokeWidth={1.8} />
            </Link>
          )}

          {/* บทความอื่นในหมวดเดียวกัน */}
          <div className="card p-4">
            <p className="text-xxs font-semibold uppercase tracking-wide text-ink-400">
              {tx(cat.title, locale)}
            </p>
            <ul className="mt-2 space-y-1">
              {cat.articles
                .filter((a) => !a.resource || can(ctx, a.resource, 'view'))
                .map((a) => (
                  <li key={a.slug}>
                    <Link
                      href={`/help/${cat.slug}/${a.slug}`}
                      className={
                        a.slug === art.slug
                          ? 'block rounded-md bg-brand-50 px-2 py-1.5 text-[13px] font-medium text-brand-700'
                          : 'block rounded-md px-2 py-1.5 text-[13px] text-ink-600 hover:bg-ink-50'
                      }
                    >
                      {tx(a.title, locale)}
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
