import Link from 'next/link';
import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { DateRangeFilter } from '@/components/forms/date-range-filter';
import { ExportCsvButton } from '@/components/ui/export-csv';
import { PrintButton } from '@/components/ui/print-button';
import { lastDayOfMonth, localeDate, money, firstDayOfYear } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function BalanceSheetPage({ searchParams }: { searchParams: { to?: string; from?: string } }) {
  const ctx = await requirePermission('report', 'view');
  const d = t();
  const locale = currentLocale();
  const asOf = searchParams.to || lastDayOfMonth();
  const supabase = createClient();
  const { data } = await supabase.rpc('rpt_balance_sheet', { p_company: ctx.company.id, p_as_of: asOf });
  const rows = (data || []) as any[];

  const sec = (k: string) => rows.filter((r) => r.section === k);
  const tot = (k: string) => sec(k).reduce((a, r) => a + Number(r.amount || 0), 0);

  // งบแสดงฐานะการเงินเป็นยอด ณ วันหนึ่ง เจาะดูย้อนไปตั้งแต่ต้นปีของวันนั้น
  const yearStart = `${asOf.slice(0, 4)}-01-01`;
  const back = encodeURIComponent(`/reports/balance-sheet?as_of=${asOf}`);
  const drill = (code: string) =>
    `/reports/drill?code=${encodeURIComponent(code)}&from=${yearStart}&to=${asOf}&back=${back}`;

  const Block = ({ title, items, total }: { title: string; items: any[]; total: number }) => (
    <div className="mb-6">
      <p className="mb-1.5 text-sm font-semibold text-ink-900">{title}</p>
      {items.map((r, i) => (
        <div key={r.account_code + i} className="flex justify-between border-b border-ink-100 py-1.5 pl-4 text-sm">
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
      <div className="flex justify-between py-1.5 text-sm font-semibold">
        <span>รวม{title}</span><span className="tabular-nums">{money(total)}</span>
      </div>
    </div>
  );

  const liabEquity = tot('2_liability') + tot('3_equity');

  return (
    <>
      <PageHeader
        title={d.nav.balanceSheet}
        subtitle={`${ctx.company.name_th} · ณ ${localeDate(asOf, locale)}`}
        action={<>
          <DateRangeFilter from={searchParams.from || firstDayOfYear()} to={asOf} singleDate
            labels={{ from: d.common.from, to: 'ณ วันที่', apply: d.common.filter }} />
          {can(ctx, 'report', 'export') && (
            <ExportCsvButton label={d.common.export} filename="balance-sheet.csv"
              rows={[['หมวด','รหัส','ชื่อบัญชี','จำนวนเงิน'], ...rows.map((r) => [r.section, r.account_code, r.account_name, r.amount])]} />
          )}
          <PrintButton label={d.common.print} />
        </>}
      />
      <Card className="mx-auto max-w-3xl">
        <div className="px-6 py-5">
          <div className="mb-6 text-center">
            <p className="text-base font-semibold text-ink-900">{ctx.company.name_th}</p>
            <p className="text-sm text-ink-600">งบแสดงฐานะการเงิน</p>
            <p className="text-xs text-ink-500">ณ วันที่ {localeDate(asOf, locale)}</p>
          </div>
          <Block title="สินทรัพย์" items={sec('1_asset')} total={tot('1_asset')} />
          <Block title="หนี้สิน" items={sec('2_liability')} total={tot('2_liability')} />
          <Block title="ส่วนของผู้ถือหุ้น" items={sec('3_equity')} total={tot('3_equity')} />
          <div className="flex justify-between rounded-lg bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-800">
            <span>รวมหนี้สินและส่วนของผู้ถือหุ้น</span>
            <span className="tabular-nums">{money(liabEquity)}</span>
          </div>
          {Math.abs(tot('1_asset') - liabEquity) > 0.01 && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
              ผลต่าง {money(tot('1_asset') - liabEquity)} บาท — ตรวจสอบรายการที่ยังไม่ผ่านรายการหรือบัญชีที่ยังไม่ปิดงวด
            </p>
          )}
        </div>
      </Card>
    </>
  );
}
