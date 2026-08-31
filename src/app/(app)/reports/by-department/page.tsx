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
  dimension_id: string | null;
  code: string | null;
  name: string;
  group_name: string | null;
  revenue: number;
  cost_of_sales: number;
  gross_profit: number;
  expense: number;
  net_profit: number;
}

export default async function PlByDepartmentPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  const ctx = await requirePermission('report', 'view');
  const d = t();
  const L = d.ui.dimension;
  const locale = currentLocale();
  const from = searchParams.from || firstDayOfMonth();
  const to = searchParams.to || lastDayOfMonth();

  const supabase = createClient();
  const { data } = await supabase.rpc('rpt_pl_by_dimension', {
    p_company: ctx.company.id, p_from: from, p_to: to,
  });
  const rows = (data || []) as Row[];

  const sum = (k: keyof Row) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);
  const totalRevenue = sum('revenue');

  return (
    <>
      <PageHeader
        title={L.plTitle}
        subtitle={`${ctx.company.name_th} · ${L.plSubtitle} · ${currencyLabel(ctx.company.base_currency, locale)}`}
        action={
          <>
            <form className="flex flex-wrap items-center gap-2">
              <input type="date" name="from" defaultValue={from} className="input h-9 w-40 py-1.5 text-sm" />
              <input type="date" name="to" defaultValue={to} className="input h-9 w-40 py-1.5 text-sm" />
              <button className="btn-secondary" type="submit">{d.common.filter}</button>
            </form>
            {can(ctx, 'report', 'export') && (
              <ExportCsvButton
                label={d.common.export}
                filename={`pl-by-department-${from}-${to}.csv`}
                rows={[
                  [L.code, L.name, L.revenue, L.costOfSales, L.grossProfit, L.expense, L.netProfit],
                  ...rows.map((r) => [
                    r.code || '', r.name || L.none,
                    r.revenue, r.cost_of_sales, r.gross_profit, r.expense, r.net_profit,
                  ]),
                ]}
              />
            )}
            <PrintButton label={d.common.print} />
          </>
        }
      />

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>{L.code}</TH>
              <TH>{L.name}</TH>
              <TH align="right">{L.revenue}</TH>
              <TH align="right">{L.costOfSales}</TH>
              <TH align="right">{L.grossProfit}</TH>
              <TH align="right">{L.expense}</TH>
              <TH align="right">{L.netProfit}</TH>
              <TH align="right">{L.margin}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={8} label={L.plEmpty} />}
            {rows.map((r) => {
              // อัตรากำไรคิดจากรายได้ของแผนกนั้นเอง แผนกที่ไม่มีรายได้ (เช่นฝ่ายสนับสนุน)
              // จึงเว้นว่างไว้ ดีกว่าโชว์ 0% หรือค่าอนันต์ที่ตีความผิดได้
              const margin = r.revenue > 0 ? (r.net_profit / r.revenue) * 100 : null;
              return (
                <TR key={r.dimension_id || 'none'}>
                  <TD className="font-mono text-xs">{r.code || '–'}</TD>
                  <TD className={cn('font-medium', r.dimension_id ? 'text-ink-900' : 'text-ink-400')}>
                    {r.name || L.none}
                  </TD>
                  <TD align="right">{money(r.revenue)}</TD>
                  <TD align="right" className="text-ink-600">{money(r.cost_of_sales)}</TD>
                  <TD align="right">{money(r.gross_profit)}</TD>
                  <TD align="right" className="text-ink-600">{money(r.expense)}</TD>
                  <TD align="right" className={cn('font-medium',
                    r.net_profit < 0 ? 'text-rose-600' : 'text-ink-900')}>
                    {money(r.net_profit)}
                  </TD>
                  <TD align="right" className="text-ink-500">
                    {margin == null ? '–' : `${margin.toFixed(1)}%`}
                  </TD>
                </TR>
              );
            })}
          </TBody>
          <tfoot className="bg-ink-50 font-medium">
            <tr>
              <td className="td-cell" colSpan={2}>{d.common.total}</td>
              <td className="td-cell num">{money(totalRevenue)}</td>
              <td className="td-cell num">{money(sum('cost_of_sales'))}</td>
              <td className="td-cell num">{money(sum('gross_profit'))}</td>
              <td className="td-cell num">{money(sum('expense'))}</td>
              <td className="td-cell num">{money(sum('net_profit'))}</td>
              <td className="td-cell num">
                {totalRevenue > 0 ? `${((sum('net_profit') / totalRevenue) * 100).toFixed(1)}%` : '–'}
              </td>
            </tr>
          </tfoot>
        </Table>
      </Card>

      <p className="mt-4 text-xs leading-relaxed text-ink-400">{L.plSubtitle}</p>
    </>
  );
}
