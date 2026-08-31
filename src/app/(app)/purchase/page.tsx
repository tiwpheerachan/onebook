import Link from 'next/link';
import { ArrowUpRight, Plus, CheckCircle2 } from 'lucide-react';
import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card, CardHeader } from '@/components/ui/page-header';
import { MonthlyBars, DonutBreakdown, ProgressRow, type Series } from '@/components/charts/charts';
import { MonthPicker } from '@/components/forms/month-picker';
import { money, localeDate, monthName, localeYear } from '@/lib/format';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

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
  const L = d.ui.expenseOverview;
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
        <PageHeader title={L.title} subtitle={ctx.company.name_th} />
        <p className="card card-pad text-sm text-rose-700">{L.loadFailed} : {error.message}</p>
      </>
    );
  }

  const ov = data as any;
  const yLabel = String(localeYear(year, locale));
  const mLabel = monthName(month, locale);
  // ชื่อช่วงเวลามาจากฐานข้อมูลเป็นภาษาไทย จับคู่กับข้อความตามภาษาที่เลือก
  const BUCKET_LABEL: Record<string, string> = {
    'เลยกำหนดแล้ว': L.bucketOverdue, 'ภายใน 7 วัน': L.bucket7,
    'ภายใน 30 วัน': L.bucket30, 'เกิน 30 วัน': L.bucketOver30,
  };
  const monthly: any[] = ov.monthly || [];
  const byMonth = (key: string) =>
    Array.from({ length: 12 }, (_, i) => Number(monthly.find((m) => m.month === i + 1)?.[key] || 0));

  const series: Series[] = [
    { key: 'paid',    label: L.paid,    color: '#14827c', values: byMonth('paid') },
    { key: 'open',    label: L.open,    color: '#fbbf24', values: byMonth('open') },
    { key: 'overdue', label: L.overdue, color: '#f43f5e', values: byMonth('overdue') },
  ];

  const yt = ov.year_total || {};
  const po = ov.po_funnel || {};
  const issued = Number(po.issued_amount || 0);
  const schedule: any[] = ov.payment_schedule || [];
  const dueNext: any[] = ov.due_next || [];
  const tax = ov.tax_month || {};
  const scheduleTotal = schedule.reduce((a, s) => a + Number(s.amount || 0), 0);

  const stats = [
    { label: L.billedYear.replace('{y}', yLabel), value: yt.billed, tone: 'text-ink-900' },
    { label: L.paid, value: yt.paid, tone: 'text-emerald-600' },
    { label: L.openCount.replace('{n}', String(yt.open_count || 0)), value: yt.open_amount, tone: 'text-amber-600' },
    { label: L.overdueCount.replace('{n}', String(yt.overdue_count || 0)), value: yt.overdue_amount, tone: 'text-rose-600' },
  ];

  return (
    <>
      <PageHeader
        title={L.title}
        subtitle={`${ctx.company.name_th} · ${L.subtitle}`}
        action={
          <>
            <MonthPicker year={year} month={month} />
            {can(ctx, 'documents', 'create') && (
              <Link href="/purchase/expenses/new" className="btn-primary">
                <Plus className="h-4 w-4" strokeWidth={2} /> {L.newExpense}
              </Link>
            )}
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="card-pad">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink-900">{L.chartTitle}</h2>
            <span className="text-xxs text-ink-400">{L.yearLabel.replace('{y}', yLabel)}</span>
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
          <h2 className="text-sm font-semibold text-ink-900">{L.dueTitle}</h2>
          <p className="mt-0.5 text-xxs text-ink-400">{L.dueHint}</p>

          <p className="mt-3 text-2xl font-semibold tabular-nums text-ink-900">{money(scheduleTotal)}</p>
          <p className="text-xxs text-ink-500">{L.dueTotal}</p>

          <div className="mt-3 divide-y divide-ink-100">
            {schedule.length === 0 && (
              <p className="flex items-center gap-2 py-4 text-sm text-ink-400">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" strokeWidth={1.8} />
                {L.dueEmpty}
              </p>
            )}
            {schedule.map((b) => {
              const tone = BUCKET_TONE[b.bucket] || BUCKET_TONE['เกิน 30 วัน'];
              return (
                <ProgressRow
                  key={b.bucket}
                  label={BUCKET_LABEL[b.bucket] || b.bucket}
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
            <h2 className="text-sm font-semibold text-ink-900">{L.poTitle.replace('{m}', mLabel)}</h2>
          </div>
          <div className="divide-y divide-ink-100">
            <ProgressRow label={L.poIssued} amount={issued}
                         count={Number(po.issued_count || 0)} ratio={1} color="bg-brand-600" />
            <ProgressRow label={L.poWaiting} amount={Number(po.waiting_amount || 0)}
                         count={Number(po.waiting_count || 0)}
                         ratio={issued ? Number(po.waiting_amount || 0) / issued : 0} color="bg-amber-400" />
            <ProgressRow label={L.poReceived} amount={Number(po.received_amount || 0)}
                         count={Number(po.received_count || 0)}
                         ratio={issued ? Number(po.received_amount || 0) / issued : 0} color="bg-emerald-500" />
          </div>

          <div className="mt-4 space-y-1.5 border-t border-ink-100 pt-3">
            <p className="section-title">{L.taxTitle}</p>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-ink-600">{L.inputVat}</span>
              <b className="tabular-nums text-ink-900">{money(tax.vat_input || 0)}</b>
            </div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-ink-600">{L.wht}</span>
              <b className="tabular-nums text-ink-900">{money(tax.wht_withheld || 0)}</b>
            </div>
            <p className="text-xxs text-ink-400">{L.fromDocs.replace('{n}', String(tax.doc_count || 0))}</p>
          </div>
        </Card>

        {[
          { title: L.topVendors,  slices: ov.top_vendors || [] },
          { title: L.topAccounts, slices: ov.top_accounts || [] },
        ].map((c) => {
          const total = (c.slices as any[]).reduce((a, s) => a + Number(s.amount || 0), 0);
          const prev = (c.slices as any[]).reduce((a, s) => a + Number(s.prev || 0), 0);
          const mom = prev > 0 ? ((total - prev) / prev) * 100 : null;
          return (
            <Card key={c.title} className="card-pad">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-ink-900">{c.title}</h2>
                <span className="text-xxs text-ink-400">{L.monthLabel.replace('{m}', mLabel)}</span>
              </div>
              <p className="text-xl font-semibold tabular-nums text-ink-900">{money(total)}</p>
              {mom != null && (
                <p className={cn('text-xxs tabular-nums', mom <= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                  {mom >= 0 ? '+' : ''}{mom.toFixed(2)}% {L.momSuffix}
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
          title={L.nextTitle}
          description={L.nextHint}
          right={
            <Link href="/reports/ap-aging" className="btn-ghost text-xs">
              {L.nextAll} <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
            </Link>
          }
        />
        {dueNext.length === 0 ? (
          <p className="flex items-center justify-center gap-2 px-5 py-8 text-sm text-ink-400">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" strokeWidth={1.8} />
            {L.nextEmpty}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-full text-sm">
            <thead>
              <tr className="bg-ink-50">
                <th className="th-cell">{L.colNumber}</th>
                <th className="th-cell">{L.colVendor}</th>
                <th className="th-cell">{L.colDue}</th>
                <th className="th-cell text-right">{L.colLate}</th>
                <th className="th-cell text-right">{L.colOutstanding}</th>
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
                    <td className="td-cell"><span className="block truncate max-w-[20rem]">{f.contact || '–'}</span></td>
                    <td className="td-cell">{f.due_date ? localeDate(f.due_date, locale) : '–'}</td>
                    <td className={cn('td-cell num font-medium', late ? 'text-rose-600' : 'text-ink-700')}>
                      {late
                        ? `${L.overdue} ${Math.abs(Number(f.days))} ${L.days}`
                        : `${f.days} ${L.days}`}
                    </td>
                    <td className="td-cell num font-medium">{money(f.outstanding)}</td>
                  </tr>
                );
              })}
            </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
