import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader } from '@/components/ui/page-header';
import { CountSheet } from '@/components/forms/stock-count-sheet';
import { localeDate, money } from '@/lib/format';
import { ChevronLeft, BookOpen } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function StockCountPage({ params }: { params: { id: string } }) {
  const ctx = await requirePermission('products.inventory', 'view');
  const d = t();
  const L = d.ui.count;
  const locale = currentLocale();
  const supabase = createClient();

  const { data, error } = await supabase.rpc('rpt_stock_count', { p_count: params.id });
  if (error || !data) notFound();

  const res = data as any;
  const c = res.count;
  if (!c) notFound();

  const lines = (res.lines || []) as any[];
  const sum = (res.summary || {}) as Record<string, number>;
  const editable = c.status === 'counting' && can(ctx, 'products.inventory', 'edit');

  return (
    <>
      <Link href="/inventory/counts" className="mb-3 inline-flex items-center gap-1 text-xs text-ink-500 hover:text-brand-600">
        <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} /> {L.back}
      </Link>

      <PageHeader
        title={`${L.title} · ${c.count_number}`}
        subtitle={`${c.warehouse_code} · ${c.warehouse_name} · ${localeDate(c.count_date, locale)}`}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: L.lines, value: `${sum.counted ?? 0} / ${sum.total ?? 0}` },
          { label: L.shortage, value: String(sum.shortage ?? 0) },
          { label: L.overage, value: String(sum.overage ?? 0) },
          { label: L.diffValue, value: money(sum.diff_value ?? 0) },
        ].map((x) => (
          <div key={x.label} className="card p-4">
            <p className="text-xxs uppercase tracking-wide text-ink-400">{x.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-ink-900">{x.value}</p>
          </div>
        ))}
      </div>

      <CountSheet countId={params.id} lines={lines} editable={editable} d={d} />

      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-1 text-xxs text-ink-400">
        {c.created_by_name && <span>{L.countedBy}: {c.created_by_name}</span>}
        {c.confirmed_by_name && <span>{L.confirmedBy}: {c.confirmed_by_name}</span>}
        {c.journal_entry_id && (
          <Link href={`/accounting/journal/${c.journal_entry_id}`} className="inline-flex items-center gap-1 text-brand-600 hover:underline">
            <BookOpen className="h-3 w-3" strokeWidth={2} /> {L.journal}
          </Link>
        )}
      </div>
    </>
  );
}
