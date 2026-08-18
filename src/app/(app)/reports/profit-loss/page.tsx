import Link from 'next/link';
import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { DateRangeFilter } from '@/components/forms/date-range-filter';
import { ExportCsvButton } from '@/components/ui/export-csv';
import { PrintButton } from '@/components/ui/print-button';
import { firstDayOfYear, lastDayOfMonth, localeDate, money } from '@/lib/format';

export const dynamic = 'force-dynamic';

const SECTIONS: { key: string; label: string; sign: 1 | -1 }[] = [
  { key: '1_revenue', label: 'รายได้จากการดำเนินงาน', sign: 1 },
  { key: '2_other_income', label: 'รายได้อื่น', sign: 1 },
  { key: '3_cost_of_sales', label: 'ต้นทุนขายและบริการ', sign: -1 },
  { key: '4_expense', label: 'ค่าใช้จ่ายในการขายและบริหาร', sign: -1 },
  { key: '5_other_expense', label: 'ค่าใช้จ่ายอื่นและต้นทุนทางการเงิน', sign: -1 },
  { key: '6_tax', label: 'ภาษีเงินได้', sign: -1 },
];

export default async function ProfitLossPage({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  const ctx = await requirePermission('report', 'view');
  const d = t();
  const locale = currentLocale();
  const from = searchParams.from || firstDayOfYear();
  const to = searchParams.to || lastDayOfMonth();
  const supabase = createClient();
  const { data } = await supabase.rpc('rpt_profit_loss', { p_company: ctx.company.id, p_from: from, p_to: to });
  const rows = (data || []) as any[];

  const bySection = (k: string) => rows.filter((r) => r.section === k);
  const total = (k: string) => bySection(k).reduce((a, r) => a + Number(r.amount || 0), 0);
  const net = SECTIONS.reduce((a, s) => a + s.sign * total(s.key), 0);
  const grossProfit = total('1_revenue') - total('3_cost_of_sales');
  const back = encodeURIComponent(`/reports/profit-loss?from=${from}&to=${to}`);
  const drill = (code: string) =>
    `/reports/drill?code=${encodeURIComponent(code)}&from=${from}&to=${to}&back=${back}`;

  return (
    <>
      <PageHeader
        title={d.nav.profitLoss}
        subtitle={`${ctx.company.name_th} · ${localeDate(from, locale)} – ${localeDate(to, locale)}`}
        action={<>
          <DateRangeFilter from={from} to={to} labels={{ from: d.common.from, to: d.common.to, apply: d.common.filter }} />
          {can(ctx, 'report', 'export') && (
            <ExportCsvButton label={d.common.export} filename="profit-loss.csv"
              rows={[['หมวด','รหัส','ชื่อบัญชี','จำนวนเงิน'], ...rows.map((r) => [r.section, r.account_code, r.account_name, r.amount])]} />
          )}
          <PrintButton label={d.common.print} />
        </>}
      />
      <Card className="mx-auto max-w-3xl">
        <div className="px-6 py-5">
          <div className="mb-6 text-center">
            <p className="text-base font-semibold text-ink-900">{ctx.company.name_th}</p>
            <p className="text-sm text-ink-600">งบกำไรขาดทุน</p>
            <p className="text-xs text-ink-500">สำหรับงวด {localeDate(from, locale)} ถึง {localeDate(to, locale)}</p>
          </div>

          {SECTIONS.map((s) => {
            const items = bySection(s.key);
            if (items.length === 0) return null;
            return (
              <div key={s.key} className="mb-5">
                <p className="mb-1.5 text-sm font-semibold text-ink-900">{s.label}</p>
                {items.map((r) => (
                  <div key={r.account_code} className="flex justify-between border-b border-ink-100 py-1.5 pl-4 text-sm">
                    <span className="text-ink-600"><span className="mr-2 font-mono text-xs text-ink-400">{r.account_code}</span>{r.account_name}</span>
                    {/* กดตัวเลขเพื่อเจาะดูบรรทัดที่รวมกันเป็นยอดนี้ */}
                    <Link
                      href={drill(r.account_code)}
                      title={d.ui.drill.clickHint}
                      className="tabular-nums text-ink-800 decoration-brand-300 underline-offset-4 hover:text-brand-700 hover:underline no-print"
                    >
                      {money(r.amount)}
                    </Link>
                    <span className="hidden tabular-nums text-ink-800 print:inline">{money(r.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between py-1.5 text-sm font-medium">
                  <span>รวม{s.label}</span>
                  <span className="tabular-nums">{money(total(s.key))}</span>
                </div>
                {s.key === '3_cost_of_sales' && (
                  <div className="mt-2 flex justify-between rounded-lg bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-800">
                    <span>กำไรขั้นต้น</span>
                    <span className="tabular-nums">{money(grossProfit)}</span>
                  </div>
                )}
              </div>
            );
          })}

          <div className={'mt-6 flex justify-between rounded-lg px-4 py-3 text-base font-semibold ' +
            (net >= 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800')}>
            <span>กำไร(ขาดทุน)สุทธิ</span>
            <span className="tabular-nums">{money(net)}</span>
          </div>
        </div>
      </Card>
    </>
  );
}
