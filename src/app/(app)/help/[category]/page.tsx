import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionContext, can } from '@/lib/session';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader } from '@/components/ui/page-header';
import { findCategory } from '@/lib/help/content';
import { tx } from '@/lib/help/types';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function HelpCategoryPage({ params }: { params: { category: string } }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');

  const cat = findCategory(params.category);
  if (!cat) notFound();

  const d = t();
  const L = d.ui.help;
  const locale = currentLocale();
  const articles = cat.articles.filter((a) => !a.resource || can(ctx, a.resource, 'view'));

  return (
    <>
      <Link href="/help" className="mb-3 inline-flex items-center gap-1 text-xs text-ink-500 hover:text-brand-600">
        <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} /> {L.back}
      </Link>

      <PageHeader title={tx(cat.title, locale)} subtitle={tx(cat.summary, locale)} />

      <div className="card divide-y divide-ink-100">
        {articles.map((a) => (
          <Link
            key={a.slug}
            href={`/help/${cat.slug}/${a.slug}`}
            className="flex items-center gap-3 px-5 py-4 transition hover:bg-ink-50"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink-900">{tx(a.title, locale)}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{tx(a.summary, locale)}</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-ink-300" strokeWidth={2} />
          </Link>
        ))}
        {articles.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-ink-400">{L.notFound}</p>
        )}
      </div>
    </>
  );
}
