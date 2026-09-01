import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { DateRangeFilter } from '@/components/forms/date-range-filter';
import { ExportCsvButton } from '@/components/ui/export-csv';
import { PrintButton } from '@/components/ui/print-button';
import { firstDayOfYear, lastDayOfMonth, localeDate, money, currencyLabel } from '@/lib/format';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

interface CfLine {
  activity: 'operating' | 'investing' | 'financing';
  account_id: string; code: string;
  name_th: string; name_en: string | null; name_zh: string | null;
  amount: number;
}
interface CashFlow {
  opening: number; closing: number; net_change: number;
  operating_total: number; investing_total: number; financing_total: number;
  lines: CfLine[];
}

export default async function CashFlowPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  const ctx = await requirePermission('report', 'view');
  const d = t();
  const L = d.ui.cashFlow;
  const locale = currentLocale();
  const from = searchParams.from || firstDayOfYear();
  const to = searchParams.to || lastDayOfMonth();

  const supabase = createClient();
  const { data } = await supabase.rpc('rpt_cash_flow', {
    p_company: ctx.company.id, p_from: from, p_to: to,
  });
  const cf = (data || {
    opening: 0, closing: 0, net_change: 0,
    operating_total: 0, investing_total: 0, financing_total: 0, lines: [],
  }) as CashFlow;

  // ชื่อบัญชีตามภาษาที่เลือก ถ้ายังไม่ได้แปลให้ใช้ชื่อไทย
  const accName = (r: CfLine) =>
    locale === 'en' ? r.name_en || r.name_th
    : locale === 'zh' ? r.name_zh || r.name_th
    : r.name_th;

  const SECTIONS = [
    { key: 'operating' as const, label: L.operating, total: Number(cf.operating_total) },
    { key: 'investing' as const, label: L.investing, total: Number(cf.investing_total) },
    { key: 'financing' as const, label: L.financing, total: Number(cf.financing_total) },
  ];
  const linesOf = (k: string) => cf.lines.filter((r) => r.activity === k);

  const back = encodeURIComponent(`/reports/cash-flow?from=${from}&to=${to}`);
  const drill = (code: string) =>
    `/reports/drill?code=${encodeURIComponent(code)}&from=${from}&to=${to}&back=${back}`;

  return (
    <>
      <PageHeader
        title={L.title}
        subtitle={`${ctx.company.name_th} · ${localeDate(from, locale)} – ${localeDate(to, locale)} · ${currencyLabel(ctx.company.base_currency, locale)}`}
        action={
          <>
            <DateRangeFilter from={from} to={to} labels={{ from: d.common.from, to: d.common.to, apply: d.common.filter }} />
            {can(ctx, 'report', 'export') && (
              <ExportCsvButton
                label={d.common.export}
                filename={`cash-flow-${from}-${to}.csv`}
                rows={[
                  [L.account, L.amount],
                  [L.opening, cf.opening],
                  ...SECTIONS.flatMap((s) => [
                    [s.label, ''],
                    ...linesOf(s.key).map((r) => [`${r.code} ${accName(r)}`, r.amount]),
                    [`${s.label} — ${d.common.total}`, s.total],
                  ]),
                  [L.netChange, cf.net_change],
                  [L.closing, cf.closing],
                ]}
              />
            )}
            <PrintButton label={d.common.print} />
          </>
        }
      />

      <Card className="mb-5">
        <div className="grid grid-cols-1 divide-y divide-ink-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            { label: L.opening, value: cf.opening, tone: 'text-ink-900' },
            { label: L.netChange, value: cf.net_change,
              tone: Number(cf.net_change) < 0 ? 'text-rose-600' : 'text-emerald-600' },
            { label: L.closing, value: cf.closing, tone: 'text-brand-700' },
          ].map((s) => (
            <div key={s.label} className="px-5 py-4 text-center">
              <p className={cn('text-xl font-semibold tabular-nums', s.tone)}>{money(s.value)}</p>
              <p className="mt-0.5 text-xxs text-ink-500">{s.label}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <table className="w-full">
          <thead>
            <tr className="border-b border-ink-200">
              <th className="th-cell">{L.account}</th>
              <th className="th-cell text-right">{L.amount}</th>
            </tr>
          </thead>
          <tbody>
            {cf.lines.length === 0 && (
              <tr><td className="td-cell text-sm text-ink-400" colSpan={2}>{L.empty}</td></tr>
            )}
            {cf.lines.length > 0 && SECTIONS.map((s) => (
              <tbody key={s.key} className="contents">
                <tr className="bg-ink-50">
                  <td className="td-cell text-sm font-semibold text-ink-800" colSpan={2}>{s.label}</td>
                </tr>
                {linesOf(s.key).map((r) => (
                  <tr key={r.account_id} className="border-b border-ink-100">
                    <td className="td-cell pl-6">
                      <a href={drill(r.code)} className="text-sm text-ink-700 hover:text-brand-700 hover:underline">
                        <span className="font-mono text-xxs text-ink-400">{r.code}</span> {accName(r)}
                      </a>
                    </td>
                    <td className={cn('td-cell num text-right',
                      Number(r.amount) < 0 ? 'text-rose-600' : 'text-ink-800')}>
                      {money(r.amount)}
                    </td>
                  </tr>
                ))}
                <tr className="border-b border-ink-200">
                  <td className="td-cell pl-6 text-sm font-medium text-ink-600">{s.label}</td>
                  <td className={cn('td-cell num text-right font-semibold',
                    s.total < 0 ? 'text-rose-600' : 'text-ink-900')}>
                    {money(s.total)}
                  </td>
                </tr>
              </tbody>
            ))}
          </tbody>
          <tfoot className="bg-ink-50 font-semibold">
            <tr>
              <td className="td-cell">{L.netChange}</td>
              <td className={cn('td-cell num text-right',
                Number(cf.net_change) < 0 ? 'text-rose-600' : 'text-emerald-700')}>
                {money(cf.net_change)}
              </td>
            </tr>
          </tfoot>
        </table>
      </Card>

      <p className="mt-3 text-xxs leading-relaxed text-ink-400">{L.tieHint}</p>
    </>
  );
}
