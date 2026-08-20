import Link from 'next/link';
import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader } from '@/components/ui/page-header';
import { SearchBox } from '@/components/forms/search-box';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { CycleEditor, CycleBadge } from '@/components/forms/cycle-editor';
import { localeDate, money } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Star, FilePlus2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function CyclesPage({
  searchParams,
}: {
  searchParams: { f?: string; q?: string };
}) {
  const ctx = await requirePermission('contacts', 'view');
  const d = t();
  const L = d.ui.cycles;
  const locale = currentLocale();
  const canEdit = can(ctx, 'contacts', 'edit');
  const filter = searchParams.f || 'all';

  const supabase = createClient();
  const { data } = await supabase.rpc('rpt_customer_cycles', {
    p_company: ctx.company.id,
    p_filter: filter,
    p_q: searchParams.q || null,
    p_limit: 200,
  });

  const res = (data || {}) as any;
  const rows = (res.rows || []) as any[];
  const sum = (res.summary || {}) as Record<string, number>;

  const TABS = [
    { key: 'all', label: L.all, n: null as number | null, tone: '' },
    { key: 'overdue', label: L.overdue, n: sum.overdue, tone: 'text-rose-700' },
    { key: 'due_soon', label: L.dueSoon, n: sum.due_soon, tone: 'text-amber-700' },
    { key: 'regular', label: L.regular, n: sum.regular, tone: '' },
    { key: 'untracked', label: L.untracked, n: sum.untracked, tone: '' },
  ];

  const link = (f: string) => {
    const p = new URLSearchParams();
    if (f !== 'all') p.set('f', f);
    if (searchParams.q) p.set('q', searchParams.q);
    const s = p.toString();
    return s ? `/contacts/cycles?${s}` : '/contacts/cycles';
  };

  return (
    <>
      <PageHeader title={L.title} subtitle={`${ctx.company.name_th} · ${L.subtitle}`} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((tb) => (
          <Link
            key={tb.key}
            href={link(tb.key)}
            className={cn(
              'chip transition',
              filter === tb.key
                ? 'bg-brand-600 text-white ring-brand-600'
                : 'bg-white ring-ink-200 hover:bg-ink-50 ' + (tb.tone || 'text-ink-600')
            )}
          >
            {tb.label}{tb.n != null && ` · ${tb.n}`}
          </Link>
        ))}
        <div className="ml-auto min-w-[15rem]">
          <SearchBox placeholder={d.common.search} defaultValue={searchParams.q} />
        </div>
      </div>

      <div className="card overflow-hidden">
        <Table>
          <THead>
            <TR>
              <TH>{L.customer}</TH>
              <TH className="text-right">{L.orders}</TH>
              <TH>{L.lastOrder}</TH>
              <TH>{L.cycle}</TH>
              <TH>{L.dueDate}</TH>
              <TH className="text-right">{L.spend}</TH>
              <TH className="text-right">{d.common.actions}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={7} label={L.empty} />}

            {rows.map((r) => (
              <TR key={r.id}>
                <TD>
                  <span className="flex items-center gap-1.5">
                    {r.is_regular && <Star className="h-3.5 w-3.5 shrink-0 text-amber-500" strokeWidth={2} />}
                    <Link
                      href={`/contacts?q=${encodeURIComponent(r.code)}`}
                      className="truncate font-medium text-ink-800 hover:text-brand-700 hover:underline"
                    >
                      {r.name}
                    </Link>
                  </span>
                  <span className="block font-mono text-xxs text-ink-400">{r.code}</span>
                </TD>
                <TD className="text-right tabular-nums text-ink-600">{r.order_count}</TD>
                <TD className="whitespace-nowrap text-ink-600">
                  {r.last_order ? localeDate(r.last_order, locale) : '—'}
                </TD>
                <TD>
                  {r.effective_days ? (
                    <span className="flex items-center gap-1.5">
                      <span className="tabular-nums text-ink-800">{r.effective_days} {L.days}</span>
                      <span className="chip bg-ink-100 text-ink-500 ring-ink-200">
                        {r.cycle_source === 'manual' ? L.manual : L.auto}
                      </span>
                    </span>
                  ) : (
                    <span className="text-xxs text-ink-400">{L.needHistory}</span>
                  )}
                </TD>
                <TD>
                  <span className="flex flex-col gap-1">
                    {r.due_date && (
                      <span className="whitespace-nowrap text-xs text-ink-500">
                        {localeDate(r.due_date, locale)}
                      </span>
                    )}
                    <CycleBadge status={r.cycle_status} days={r.days_late} d={d} />
                  </span>
                </TD>
                <TD className="text-right tabular-nums text-ink-600">{money(r.total_spend)}</TD>
                <TD className="text-right">
                  <span className="flex items-center justify-end gap-1">
                    {(r.cycle_status === 'overdue' || r.cycle_status === 'due_soon') && (
                      <Link
                        href={`/sales/invoices?new=1&contact=${r.id}`}
                        title={L.createDoc}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-500 hover:bg-brand-50 hover:text-brand-700"
                      >
                        <FilePlus2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                      </Link>
                    )}
                    <CycleEditor
                      row={{
                        id: r.id, name: r.name, cycle_days: r.cycle_days,
                        cycle_source: r.cycle_source, cycle_note: r.cycle_note,
                        suggested_days: r.suggested_days, is_regular: r.is_regular,
                        order_count: r.order_count,
                      }}
                      d={d}
                      canEdit={canEdit}
                    />
                  </span>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </>
  );
}
