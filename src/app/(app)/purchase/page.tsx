import Link from 'next/link';
import { ArrowUpRight, Plus, CheckCircle2 } from 'lucide-react';
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

/** สีของแต่ละช่วงเวลาที่ต้องจ่าย เรียงจากเร่งด่วนไปไม่เร่ง */
const BUCKET_TONE: Record<string, { bar: string; text: string }> = {
  'เลยกำหนดแล้ว': { bar: 'bg-rose-500', text: 'text-rose-600' },
  'ภายใน 7 วัน':  { bar: 'bg-amber-500', text: 'text-amber-600' },
  'ภายใน 30 วัน': { bar: 'bg-brand-500', text: 'text-brand-700' },
  'เกิน 30 วัน':  { bar: 'bg-ink-300', text: 'text-ink-500' },
};

/** ภาพรวมรายจ่ายและตารางการเบิกจ่าย */
export default async function ExpenseOverviewPage({
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
  const { data, error } = await supabase.rpc('rpt_expense_overview', {
    p_company: ctx.company.id, p_year: year, p_month: month,
  });

  if (error) {
    return (
      <>
        <PageHeader title="ภาพรวมรายจ่าย" subtitle={ctx.company.name_th} />
        <p className="card card-pad text-sm text-rose-700">ดึงข้อมูลไม่สำเร็จ : {error.message}</p>
      </>
    );
  }

  const ov = data as any;
  const monthly: any[] = ov.monthly || [];
  const byMonth = (key: string) =>
    Array.from({ length: 12 }, (_, i) => Number(monthly.find((m) => m.month === i + 1)?.[key] || 0));

  const series: Series[] = [
    { key: 'paid',    label: 'จ่ายแล้ว',  color: '#14827c', values: byMonth('paid') },
    { key: 'open',    label: 'ค้างจ่าย',  color: '#fbbf24', values: byMonth('open') },
    { key: 'overdue', label: 'เลยกำหนด',  color: '#f43f5e', values: byMonth('overdue') },
  ];

  const yt = ov.year_total || {};
  const po = ov.po_funnel || {};
  const issued = Number(po.issued_amount || 0);
  const schedule: any[] = ov.payment_schedule || [];
  const dueNext: any[] = ov.due_next || [];
  const tax = ov.tax_month || {};
  const scheduleTotal = schedule.reduce((a, s) => a + Number(s.amount || 0), 0);

  const stats = [
    { label: `ตั้งหนี้รวมปี ${year + 543}`, value: yt.billed, tone: 'text-ink-900' },
    { label: 'จ่ายแล้ว', value: yt.paid, tone: 'text-emerald-600' },
    { label: `ค้างจ่าย ${yt.open_count || 0} รายการ`, value: yt.open_amount, tone: 'text-amber-600' },
    { label: `เลยกำหนด ${yt.overdue_count || 0} รายการ`, value: yt.overdue_amount, tone: 'text-rose-600' },
  ];

  return (
    <>
      <PageHeader
        title="ภาพรวมรายจ่าย"
        subtitle={`${ctx.company.name_th} · นับเฉพาะเอกสารที่ลงบัญชีแล้ว ตัวเลขตรงกับงบการเงินเสมอ`}
        action={
          <>
            <MonthPicker year={year} month={month} />
            {can(ctx, 'documents', 'create') && (
              <Link href="/purchase/expenses/new" className="btn-primary">
                <Plus className="h-4 w-4" strokeWidth={2} /> บันทึกค่าใช้จ่าย
              </Link>
            )}
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="card-pad">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink-900">รายจ่ายที่จ่ายแล้ว ค้างจ่าย และเลยกำหนด</h2>
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

        {/* ตารางการเบิกจ่าย */}
        <Card className="card-pad">
          <h2 className="text-sm font-semibold text-ink-900">ต้องจ่ายเมื่อไร</h2>
          <p className="mt-0.5 text-xxs text-ink-400">ยอดค้างจ่ายทั้งหมดแบ่งตามความเร่งด่วน</p>

          <p className="mt-3 text-2xl font-semibold tabular-nums text-ink-900">{money(scheduleTotal)}</p>
          <p className="text-xxs text-ink-500">ยอดค้างจ่ายรวม</p>

          <div className="mt-3 divide-y divide-ink-100">
            {schedule.length === 0 && (
              <p className="flex items-center gap-2 py-4 text-sm text-ink-400">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" strokeWidth={1.8} />
                ไม่มียอดค้างจ่าย
              </p>
            )}
            {schedule.map((b) => {
              const tone = BUCKET_TONE[b.bucket] || BUCKET_TONE['เกิน 30 วัน'];
              return (
                <ProgressRow
                  key={b.bucket}
                  label={b.bucket}
                  amount={Number(b.amount || 0)}
                  count={Number(b.count || 0)}
                  ratio={scheduleTotal ? Number(b.amount || 0) / scheduleTotal : 0}
                  color={tone.bar}
                />
              );
            })}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* สายงานจัดซื้อ */}
        <Card className="card-pad">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink-900">ใบสั่งซื้อเดือน{TH_MONTHS[month - 1]}</h2>
          </div>
          <div className="divide-y divide-ink-100">
            <ProgressRow label="ใบสั่งซื้อที่ออก" amount={issued}
                         count={Number(po.issued_count || 0)} ratio={1} color="bg-brand-600" />
            <ProgressRow label="ยังไม่ได้รับของ" amount={Number(po.waiting_amount || 0)}
                         count={Number(po.waiting_count || 0)}
                         ratio={issued ? Number(po.waiting_amount || 0) / issued : 0} color="bg-amber-400" />
            <ProgressRow label="รับของ/ตั้งหนี้แล้ว" amount={Number(po.received_amount || 0)}
                         count={Number(po.received_count || 0)}
                         ratio={issued ? Number(po.received_amount || 0) / issued : 0} color="bg-emerald-500" />
          </div>

          <div className="mt-4 space-y-1.5 border-t border-ink-100 pt-3">
            <p className="section-title">ภาษีเดือนนี้</p>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-ink-600">ภาษีซื้อ</span>
              <b className="tabular-nums text-ink-900">{money(tax.vat_input || 0)}</b>
            </div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-ink-600">หัก ณ ที่จ่าย</span>
              <b className="tabular-nums text-ink-900">{money(tax.wht_withheld || 0)}</b>
            </div>
            <p className="text-xxs text-ink-400">จากเอกสารซื้อ {tax.doc_count || 0} ใบ</p>
          </div>
        </Card>

        {[
          { title: 'จ่ายให้ใครมากที่สุด', slices: ov.top_vendors || [] },
          { title: 'จ่ายค่าอะไรมากที่สุด', slices: ov.top_accounts || [] },
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
                <p className={cn('text-xxs tabular-nums', mom <= 0 ? 'text-emerald-600' : 'text-rose-600')}>
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

      <Card className="mt-4">
        <CardHeader
          title="รายการที่ต้องจ่ายถัดไป"
          description="เรียงตามวันครบกำหนด — รายการที่เลยกำหนดขึ้นก่อน"
          right={
            <Link href="/reports/ap-aging" className="btn-ghost text-xs">
              ดูอายุเจ้าหนี้ทั้งหมด <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
            </Link>
          }
        />
        {dueNext.length === 0 ? (
          <p className="flex items-center justify-center gap-2 px-5 py-8 text-sm text-ink-400">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" strokeWidth={1.8} />
            ไม่มีรายการค้างจ่าย
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ink-50">
                <th className="th-cell">เลขที่</th>
                <th className="th-cell">ผู้ขาย</th>
                <th className="th-cell">ครบกำหนด</th>
                <th className="th-cell text-right">อีกกี่วัน</th>
                <th className="th-cell text-right">ยอดค้างจ่าย</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {dueNext.map((f) => {
                const late = Number(f.days) < 0;
                return (
                  <tr key={f.id} className="hover:bg-ink-50">
                    <td className="td-cell">
                      <Link href={`/documents/trace/${f.id}`} className="font-mono text-xs text-brand-700 hover:underline">
                        {f.doc_number}
                      </Link>
                    </td>
                    <td className="td-cell max-w-[20rem] truncate">{f.contact || '–'}</td>
                    <td className="td-cell">{f.due_date ? localeDate(f.due_date, locale) : '–'}</td>
                    <td className={cn('td-cell num font-medium', late ? 'text-rose-600' : 'text-ink-700')}>
                      {late ? `เลยมา ${Math.abs(Number(f.days))} วัน` : `${f.days} วัน`}
                    </td>
                    <td className="td-cell num font-medium">{money(f.outstanding)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
