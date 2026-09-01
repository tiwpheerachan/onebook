import Link from 'next/link';
import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { DateRangeFilter } from '@/components/forms/date-range-filter';
import { ExportCsvButton } from '@/components/ui/export-csv';
import { PrintButton } from '@/components/ui/print-button';
import { firstDayOfYear, lastDayOfMonth, localeDate, money } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function TrialBalancePage({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  const ctx = await requirePermission('report', 'view');
  const d = t();
  const L = d.ui.tb;
  const locale = currentLocale();
  const from = searchParams.from || firstDayOfYear();
  const to = searchParams.to || lastDayOfMonth();
  const supabase = createClient();
  const { data } = await supabase.rpc('rpt_trial_balance', { p_company: ctx.company.id, p_from: from, p_to: to });
  const rows = (data || []) as any[];
  const back = encodeURIComponent(`/reports/trial-balance?from=${from}&to=${to}`);
  const drill = (code: string) =>
    `/reports/drill?code=${encodeURIComponent(code)}&from=${from}&to=${to}&back=${back}`;
  const sum = (k: string) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);

  return (
    <>
      <PageHeader
        title={d.nav.trialBalance}
        subtitle={`${ctx.company.name_th} · ${localeDate(from, locale)} – ${localeDate(to, locale)}`}
        action={<>
          <DateRangeFilter from={from} to={to} labels={{ from: d.common.from, to: d.common.to, apply: d.common.filter }} />
          {can(ctx, 'report', 'export') && (
            <ExportCsvButton label={d.common.export} filename="trial-balance.csv"
              rows={[[L.code, L.accountName, L.openDr, L.openCr, L.periodDr, L.periodCr, L.closeDr, L.closeCr],
                ...rows.map((r) => [r.account_code, r.account_name, r.opening_debit, r.opening_credit,
                  r.period_debit, r.period_credit, r.closing_debit, r.closing_credit])]} />
          )}
          <PrintButton label={d.common.print} />
        </>}
      />
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>{L.code}</TH><TH>{L.accountName}</TH>
              <TH align="right">{L.openDr}</TH><TH align="right">{L.openCr}</TH>
              <TH align="right">{L.periodDr}</TH><TH align="right">{L.periodCr}</TH>
              <TH align="right">{L.closeDr}</TH><TH align="right">{L.closeCr}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={8} label={d.common.noData} />}
            {rows.map((r) => (
              <TR key={r.account_code}>
                <TD>
                  <Link
                    href={drill(r.account_code)}
                    title={d.ui.drill.clickHint}
                    className="font-mono text-xs text-brand-700 hover:underline"
                  >
                    {r.account_code}
                  </Link>
                </TD>
                <TD>{r.account_name}</TD>
                <TD align="right">{money(r.opening_debit)}</TD>
                <TD align="right">{money(r.opening_credit)}</TD>
                <TD align="right">{money(r.period_debit)}</TD>
                <TD align="right">{money(r.period_credit)}</TD>
                <TD align="right" className="font-medium">{money(r.closing_debit)}</TD>
                <TD align="right" className="font-medium">{money(r.closing_credit)}</TD>
              </TR>
            ))}
          </TBody>
          <tfoot className="bg-ink-50 font-medium">
            <tr>
              <td className="td-cell" colSpan={2}>{d.common.total}</td>
              <td className="td-cell num">{money(sum('opening_debit'))}</td>
              <td className="td-cell num">{money(sum('opening_credit'))}</td>
              <td className="td-cell num">{money(sum('period_debit'))}</td>
              <td className="td-cell num">{money(sum('period_credit'))}</td>
              <td className="td-cell num">{money(sum('closing_debit'))}</td>
              <td className="td-cell num">{money(sum('closing_credit'))}</td>
            </tr>
          </tfoot>
        </Table>
      </Card>
    </>
  );
}
