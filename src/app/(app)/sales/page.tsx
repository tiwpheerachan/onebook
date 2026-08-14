import Link from 'next/link';
import { ArrowUpRight, Plus, TrendingUp } from 'lucide-react';
import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card, CardHeader } from '@/components/ui/page-header';
import { MonthlyBars, DonutBreakdown, ProgressRow, type Series } from '@/components/charts/charts';
import { MonthPicker } from '@/components/forms/month-picker';
import { money, localeDate } from '@/lib/format';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

const TH_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

/** ภาพรวมรายรับ : ตัวเลขที่ต้องดูทุกวันรวมไว้หน้าเดียว */
export default async function RevenueOverviewPage({
  searchParams,
}: {
  searchParams: { y?: string; m?: string };
}) {
  const ctx = await requirePermission('report', 'view');
  const d = t();
  const locale = currentLocale();
  const now = new Date();
  const year = Number(searchParams.y) || now.getFullYear();
  const month = Number(searchParams.m) || now.getMonth() + 1;

  const supabase = createClient();
  const { data, error } = await supabase.rpc('rpt_revenue_overview', {
    p_company: ctx.company.id, p_year: year, p_month: month,
  });

  if (error) {
    return (
      <>
        <PageHeader title="ภาพรวมรายรับ" subtitle={ctx.company.name_th} />
        <p className="card card-pad text-sm text-rose-700">ดึงข้อมูลไม่สำเร็จ : {error.message}</p>
      </>
    );
  }

  const ov = data as any;
  const monthly: any[] = ov.monthly || [];
  const byMonth = (key: string) =>
    Array.from({ length: 12 }, (_, i) => Number(monthly.find((m) => m.month === i + 1)?.[key] || 0));

  const series: Series[] = [
    { key: 'paid',    label: 'รับชำระแล้ว', color: '#14827c', values: byMonth('paid') },
    { key: 'open',    label: 'รอรับชำระ',   color: '#72d8c9', values: byMonth('open') },
    { key: 'overdue', label: 'พ้นกำหนด',    color: '#94a3b8', values: byMonth('overdue') },
  ];

  const yt = ov.year_total || {};
  const qf = ov.quotation_funnel || {};
  const issued = Number(qf.issued_amount || 0);
  const followUp: any[] = ov.follow_up || [];
  const canCreate = can(ctx, 'documents', 'create');

  const stats = [
    { label: `ออกบิลรวมปี ${year + 543}`, value: yt.invoiced, tone: 'text-ink-900' },
    { label: 'รับชำระแล้ว', value: yt.paid, tone: 'text-emerald-600' },
    { label: `รอรับชำระ ${yt.open_count || 0} รายการ`, value: yt.open_amount, tone: 'text-ink-900' },
    { label: `พ้นกำหนด ${yt.overdue_count || 0} รายการ`, value: yt.overdue_amount, tone: 'text-rose-600' },
  ];

  return (
    <>
      <PageHeader
        title="ภาพรวมรายรับ"
        subtitle={`${ctx.company.name_th} · นับเฉพาะเอกสารที่ลงบัญชีแล้ว จึงไม่นับซ้ำแม้ออกทั้งใบแจ้งหนี้และใบกำกับภาษี`}
        action={
          <>
            <MonthPicker year={year} month={month} />
            {canCreate && (
              <Link href="/sales/invoices/new" className="btn-primary">
                <Plus className="h-4 w-4" strokeWidth={2} /> สร้างใบแจ้งหนี้
              </Link>
            )}
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* กราฟรายเดือน */}
        <Card className="card-pad">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink-900">ใบแจ้งหนี้ที่รับชำระ รอรับชำระ และพ้นกำหนด</h2>
            <span className="text-xxs text-ink-400">ปี {year + 543}</span>
          </div>

          <MonthlyBars series={series} year={year} />

          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-ink-100 pt-4 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label}>
                <p className="text-xxs text-ink-500">{s.label}</p>
                <p className={cn('mt-0.5 text-lg font-semibold tabular-nums', s.tone)}>{money(s.value || 0)}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* ช่องทางใบเสนอราคา */}
        <Card className="card-pad">
          <h2 className="text-sm font-semibold text-ink-900">ใบเสนอราคาเดือน{TH_MONTHS[month - 1]}</h2>
          <p className="mt-0.5 text-xxs text-ink-400">ติดตามว่าใบเสนอราคาที่ออกไปกลายเป็นยอดขายเท่าไร</p>

          <div className="mt-3 divide-y divide-ink-100">
            <ProgressRow label="ใบเสนอราคาที่ออก" amount={issued}
                         count={Number(qf.issued_count || 0)} ratio={1} color="bg-brand-600" />
            <ProgressRow label="รอลูกค้าตอบรับ" amount={Number(qf.waiting_amount || 0)}
                         count={Number(qf.waiting_count || 0)}
                         ratio={issued ? Number(qf.waiting_amount || 0) / issued : 0} color="bg-amber-400" />
            <ProgressRow label="แปลงเป็นบิลแล้ว" amount={Number(qf.converted_amount || 0)}
                         count={Number(qf.converted_count || 0)}
                         ratio={issued ? Number(qf.converted_amount || 0) / issued : 0} color="bg-emerald-500" />
          </div>

          {issued > 0 && (
            <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
              อัตราปิดการขาย{' '}
              <b>{((Number(qf.converted_amount || 0) / issued) * 100).toFixed(1)}%</b> ของมูลค่าที่เสนอไป
            </p>
          )}
        </Card>
      </div>

      {/* สามโดนัท : สินค้า / ลูกค้า / บัญชีรายได้ */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {[
          { title: 'ขายอะไรดีที่สุด', slices: ov.top_products || [] },
          { title: 'ขายใครได้มากที่สุด', slices: ov.top_customers || [] },
          { title: 'รายได้อะไรมากที่สุด', slices: ov.top_accounts || [] },
        ].map((c) => {
          const total = (c.slices as any[]).reduce((a, s) => a + Number(s.amount || 0), 0);
          const prev = (c.slices as any[]).reduce((a, s) => a + Number(s.prev || 0), 0);
          const mom = prev > 0 ? ((total - prev) / prev) * 100 : null;
          return (
            <Card key={c.title} className="card-pad">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-ink-900">{c.title}</h2>
                <span className="text-xxs text-ink-400">เดือน{TH_MONTHS[month - 1]}</span>
              </div>
              <p className="text-xl font-semibold tabular-nums text-ink-900">{money(total)}</p>
              {mom != null && (
                <p className={cn('text-xxs tabular-nums', mom >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                  {mom >= 0 ? '+' : ''}{mom.toFixed(2)}% เทียบเดือนก่อน
                </p>
              )}
              <div className="mt-3">
                <DonutBreakdown
                  slices={(c.slices as any[]).map((s) => ({
                    id: s.id, label: s.label, amount: Number(s.amount || 0), mom: s.mom,
                  }))}
                />
              </div>
            </Card>
          );
        })}
      </div>

      {/* ลูกหนี้ที่ต้องติดตาม */}
      <Card className="mt-4">
        <CardHeader
          title="ลูกหนี้ที่ต้องติดตาม"
          description="ใบแจ้งหนี้ที่เลยกำหนดชำระแล้วและยังเก็บเงินไม่ได้ เรียงตามวันครบกำหนด"
          right={
            <Link href="/reports/ar-aging" className="btn-ghost text-xs">
              ดูอายุลูกหนี้ทั้งหมด <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
            </Link>
          }
        />
        {followUp.length === 0 ? (
          <p className="flex items-center justify-center gap-2 px-5 py-8 text-sm text-ink-400">
            <TrendingUp className="h-4 w-4 text-emerald-500" strokeWidth={1.8} />
            ไม่มีลูกหนี้เลยกำหนด เก็บเงินได้ตามแผนทั้งหมด
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ink-50">
                <th className="th-cell">เลขที่</th>
                <th className="th-cell">ลูกค้า</th>
                <th className="th-cell">ครบกำหนด</th>
                <th className="th-cell text-right">เลยมา</th>
                <th className="th-cell text-right">ยอดค้าง</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {followUp.map((f) => (
                <tr key={f.id} className="hover:bg-ink-50">
                  <td className="td-cell">
                    <Link href={`/documents/trace/${f.id}`} className="font-mono text-xs text-brand-700 hover:underline">
                      {f.doc_number}
                    </Link>
                  </td>
                  <td className="td-cell max-w-[20rem] truncate">{f.contact || '–'}</td>
                  <td className="td-cell">{localeDate(f.due_date, locale)}</td>
                  <td className="td-cell num font-medium text-rose-600">{f.days_late} วัน</td>
                  <td className="td-cell num font-medium">{money(f.outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
