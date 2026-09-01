import Link from 'next/link';
import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { ExportCsvButton } from '@/components/ui/export-csv';
import { PrintButton } from '@/components/ui/print-button';
import { money, currencyLabel, firstDayOfMonth, lastDayOfMonth } from '@/lib/format';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

interface Row {
  id: string | null; code: string | null; name: string | null;
  doc_count: number; base_total: number; gross_total: number;
  commission_rate: number | null; commission: number | null;
}

export default async function SalesByRepPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; dim?: string };
}) {
  const ctx = await requirePermission('report', 'view');
  const d = t();
  const L = d.ui.salesRep;
  const locale = currentLocale();
  const from = searchParams.from || firstDayOfMonth();
  const to = searchParams.to || lastDayOfMonth();
  const dim = searchParams.dim === 'zone' ? 'zone' : 'rep';

  const supabase = createClient();
  const { data } = await supabase.rpc('rpt_sales_by_rep', {
    p_company: ctx.company.id, p_from: from, p_to: to, p_dim: dim,
  });
  const rows = (data || []) as Row[];
  const sum = (k: keyof Row) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);

  const tab = (key: 'rep' | 'zone', label: string) => {
    const p = new URLSearchParams({ from, to });
    if (key !== 'rep') p.set('dim', key);
    return (
      <Link
        key={key}
        href={`/reports/by-sales-rep?${p.toString()}`}
        className={cn('chip transition',
          dim === key ? 'bg-brand-600 text-white ring-brand-600'
                      : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50')}
      >
        {label}
      </Link>
    );
  };

  return (
    <>
      <PageHeader
        title={L.reportTitle}
        subtitle={`${ctx.company.name_th} · ${L.reportSubtitle} · ${currencyLabel(ctx.company.base_currency, locale)}`}
        action={
          <>
            <form className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="dim" value={dim} />
              <input type="date" name="from" defaultValue={from} className="input h-9 w-40 py-1.5 text-sm" />
              <input type="date" name="to" defaultValue={to} className="input h-9 w-40 py-1.5 text-sm" />
              <button className="btn-secondary" type="submit">{d.common.filter}</button>
            </form>
            {can(ctx, 'report', 'export') && (
              <ExportCsvButton
                label={d.common.export}
                filename={`sales-by-${dim}-${from}-${to}.csv`}
                rows={[
                  [L.code, L.name, L.docCount, L.baseTotal, L.grossTotal, L.commission],
                  ...rows.map((r) => [
                    r.code || '', r.name || L.unassigned,
                    r.doc_count, r.base_total, r.gross_total, r.commission ?? '',
                  ]),
                ]}
              />
            )}
            <PrintButton label={d.common.print} />
          </>
        }
      />

      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        {tab('rep', L.byRep)}
        {tab('zone', L.byZone)}
      </div>

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>{L.code}</TH>
              <TH>{L.name}</TH>
              <TH align="right">{L.docCount}</TH>
              <TH align="right">{L.baseTotal}</TH>
              <TH align="right">{L.grossTotal}</TH>
              {dim === 'rep' && <TH align="right">{L.commissionRate}</TH>}
              {dim === 'rep' && <TH align="right">{L.commission}</TH>}
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={dim === 'rep' ? 7 : 5} label={L.reportEmpty} />}
            {rows.map((r) => (
              <TR key={r.id || 'none'}>
                <TD className="font-mono text-xs">{r.code || '–'}</TD>
                <TD className={cn('font-medium', r.id ? 'text-ink-900' : 'text-ink-400')}>
                  {r.name || L.unassigned}
                </TD>
                <TD align="right" className="text-ink-500">{r.doc_count}</TD>
                <TD align="right">{money(r.base_total)}</TD>
                <TD align="right" className="text-ink-600">{money(r.gross_total)}</TD>
                {dim === 'rep' && (
                  <TD align="right" className="text-ink-500">
                    {r.commission_rate == null ? '–' : `${Number(r.commission_rate).toFixed(2)}%`}
                  </TD>
                )}
                {dim === 'rep' && (
                  <TD align="right" className="font-medium text-ink-900">
                    {r.commission == null ? '–' : money(r.commission)}
                  </TD>
                )}
              </TR>
            ))}
          </TBody>
          <tfoot className="bg-ink-50 font-medium">
            <tr>
              <td className="td-cell" colSpan={2}>{d.common.total}</td>
              <td className="td-cell num">{sum('doc_count')}</td>
              <td className="td-cell num">{money(sum('base_total'))}</td>
              <td className="td-cell num">{money(sum('gross_total'))}</td>
              {dim === 'rep' && <td className="td-cell" />}
              {dim === 'rep' && <td className="td-cell num">{money(sum('commission'))}</td>}
            </tr>
          </tfoot>
        </Table>
      </Card>
    </>
  );
}
