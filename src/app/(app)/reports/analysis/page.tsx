import Link from 'next/link';
import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader } from '@/components/ui/page-header';
import { DateRangeFilter } from '@/components/forms/date-range-filter';
import { ExportCsvButton } from '@/components/ui/export-csv';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { firstDayOfMonth, lastDayOfMonth, localeDate, money } from '@/lib/format';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; side?: string; dim?: string };
}) {
  const ctx = await requirePermission('report', 'view');
  const d = t();
  const L = d.ui.analysis;
  const locale = currentLocale();

  const from = searchParams.from || firstDayOfMonth();
  const to = searchParams.to || lastDayOfMonth();
  const side = searchParams.side === 'purchase' ? 'purchase' : 'sales';
  const dim = ['group', 'contact'].includes(searchParams.dim || '') ? searchParams.dim! : 'product';

  const supabase = createClient();
  const { data } = await supabase.rpc('rpt_sales_analysis', {
    p_company: ctx.company.id, p_from: from, p_to: to,
    p_side: side, p_dim: dim, p_limit: 200,
  });

  const res = (data || {}) as any;
  const rows = (res.rows || []) as any[];
  const total = (res.total || {}) as Record<string, number>;

  const link = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ from, to, side, dim, ...patch });
    return `/reports/analysis?${p.toString()}`;
  };

  const DIMS = [
    { key: 'product', label: L.byProduct },
    { key: 'group', label: L.byGroup },
    { key: 'contact', label: L.byContact },
  ];

  return (
    <>
      <PageHeader
        title={L.title}
        subtitle={`${ctx.company.name_th} · ${localeDate(from, locale)} – ${localeDate(to, locale)}`}
        action={
          <>
            <DateRangeFilter from={from} to={to}
              labels={{ from: d.common.from, to: d.common.to, apply: d.common.filter }} />
            {can(ctx, 'report', 'export') && (
              <ExportCsvButton
                label={d.common.export}
                filename={`analysis-${side}-${dim}.csv`}
                rows={[
                  [L.code, L.name, L.qty, L.amount, L.cost, L.margin, L.marginPct],
                  ...rows.map((r) => [r.code, r.name, r.qty, r.amount, r.cost, r.margin, r.margin_pct]),
                ]}
              />
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[{ key: 'sales', label: L.sales }, { key: 'purchase', label: L.purchase }].map((s) => (
          <Link key={s.key} href={link({ side: s.key })}
            className={cn('chip transition', side === s.key
              ? 'bg-brand-600 text-white ring-brand-600'
              : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50')}>
            {s.label}
          </Link>
        ))}
        <span className="mx-1 h-5 w-px bg-ink-200" />
        {DIMS.map((x) => (
          <Link key={x.key} href={link({ dim: x.key })}
            className={cn('chip transition', dim === x.key
              ? 'bg-ink-800 text-white ring-ink-800'
              : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50')}>
            {x.label}
          </Link>
        ))}
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {[
          { label: L.totalAmount, value: money(total.amount), tone: 'text-ink-900' },
          { label: L.totalMargin, value: money(total.margin),
            tone: Number(total.margin || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700' },
          { label: L.keys, value: String(total.keys ?? 0), tone: 'text-ink-900' },
        ].map((c) => (
          <div key={c.label} className="card p-4">
            <p className="text-xxs uppercase tracking-wide text-ink-400">{c.label}</p>
            <p className={cn('mt-1 text-lg font-semibold tabular-nums', c.tone)}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <Table>
          <THead>
            <TR>
              <TH className="text-right">{L.rank}</TH>
              <TH>{L.code}</TH>
              <TH>{L.name}</TH>
              <TH className="text-right">{L.qty}</TH>
              <TH className="text-right">{L.amount}</TH>
              <TH className="text-right">{L.cost}</TH>
              <TH className="text-right">{L.margin}</TH>
              <TH className="text-right">{L.marginPct}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={8} label={L.empty} />}
            {rows.map((r, i) => (
              <TR key={`${r.code}-${i}`}>
                <TD className="text-right tabular-nums text-ink-400">{i + 1}</TD>
                <TD><span className="font-mono text-xs text-ink-600">{r.code}</span></TD>
                <TD className="text-ink-800">{r.name}</TD>
                <TD className="text-right tabular-nums text-ink-600">{Number(r.qty || 0).toLocaleString()}</TD>
                <TD className="text-right tabular-nums font-medium text-ink-900">{money(r.amount)}</TD>
                <TD className="text-right tabular-nums text-ink-500">{money(r.cost)}</TD>
                <TD className={cn('text-right tabular-nums font-medium',
                  Number(r.margin) >= 0 ? 'text-emerald-700' : 'text-rose-700')}>{money(r.margin)}</TD>
                <TD className="text-right tabular-nums text-ink-600">
                  {r.margin_pct == null ? '—' : `${r.margin_pct}%`}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-ink-400">{L.costNote}</p>
    </>
  );
}
