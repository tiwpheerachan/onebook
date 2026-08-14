import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card, CardHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { firstDayOfYear, lastDayOfMonth, localeDate, money } from '@/lib/format';
import { DateRangeFilter } from '@/components/forms/date-range-filter';

export const dynamic = 'force-dynamic';

export default async function GroupPage({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  await requirePermission('report', 'view');
  const d = t();
  const locale = currentLocale();
  const supabase = createClient();

  const from = searchParams.from || firstDayOfYear();
  const to = searchParams.to || lastDayOfMonth();

  const { data } = await supabase.rpc('rpt_group_overview', { p_from: from, p_to: to });
  const rows = (data || []) as any[];

  const sum = (k: string) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);

  return (
    <>
      <PageHeader
        title={d.nav.group}
        subtitle={`${localeDate(from, locale)} – ${localeDate(to, locale)} · ${rows.length} บริษัท`}
        action={<DateRangeFilter from={from} to={to} labels={{ from: d.common.from, to: d.common.to, apply: d.common.filter }} />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={d.dash.revenue} value={sum('revenue')} suffix={d.common.baht} tone="brand" />
        <StatCard label={d.dash.expense} value={sum('expense')} suffix={d.common.baht} />
        <StatCard label={d.dash.profit} value={sum('profit')} suffix={d.common.baht} tone={sum('profit') >= 0 ? 'positive' : 'negative'} />
        <StatCard label={d.dash.cash} value={sum('cash_balance')} suffix={d.common.baht} />
      </div>

      <Card className="mt-6">
        <CardHeader title={d.nav.companies} description="งบรวมกลุ่มบริษัท (ยังไม่ตัดรายการระหว่างกัน)" />
        <Table>
          <THead>
            <TR>
              <TH>รหัส</TH>
              <TH>บริษัท</TH>
              <TH align="right">{d.dash.revenue}</TH>
              <TH align="right">{d.dash.expense}</TH>
              <TH align="right">{d.dash.profit}</TH>
              <TH align="right">{d.dash.ar}</TH>
              <TH align="right">{d.dash.ap}</TH>
              <TH align="right">{d.dash.cash}</TH>
              <TH>{d.dash.lockedThrough}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={9} label={d.common.noData} />}
            {rows.map((r) => (
              <TR key={r.company_id}>
                <TD><span className="font-mono text-xs text-ink-500">{r.company_code}</span></TD>
                <TD>
                  <span className={r.is_parent ? 'font-semibold text-ink-900' : 'pl-4 text-ink-700'}>
                    {r.company_name}
                  </span>
                  {r.is_parent && <Badge tone="brand">บริษัทแม่</Badge>}
                </TD>
                <TD align="right">{money(r.revenue)}</TD>
                <TD align="right">{money(r.expense)}</TD>
                <TD align="right" className={Number(r.profit) < 0 ? 'text-rose-600' : 'text-emerald-700'}>{money(r.profit)}</TD>
                <TD align="right">{money(r.ar_outstanding)}</TD>
                <TD align="right">{money(r.ap_outstanding)}</TD>
                <TD align="right">{money(r.cash_balance)}</TD>
                <TD>{r.locked_through ? <Badge tone="warn">{localeDate(r.locked_through, locale)}</Badge> : <span className="text-ink-300">–</span>}</TD>
              </TR>
            ))}
          </TBody>
          <tfoot className="bg-ink-50 font-medium">
            <tr>
              <td className="td-cell" colSpan={2}>{d.common.total}</td>
              <td className="td-cell num">{money(sum('revenue'))}</td>
              <td className="td-cell num">{money(sum('expense'))}</td>
              <td className="td-cell num">{money(sum('profit'))}</td>
              <td className="td-cell num">{money(sum('ar_outstanding'))}</td>
              <td className="td-cell num">{money(sum('ap_outstanding'))}</td>
              <td className="td-cell num">{money(sum('cash_balance'))}</td>
              <td className="td-cell" />
            </tr>
          </tfoot>
        </Table>
      </Card>
    </>
  );
}
