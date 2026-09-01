import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { DateRangeFilter } from '@/components/forms/date-range-filter';
import { firstDayOfYear, lastDayOfMonth, localeDate, money, currencyLabel } from '@/lib/format';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

interface Kpi {
  revenue: number; cogs: number; opex: number;
  gross_profit: number; net_profit: number;
  gross_margin: number | null; net_margin: number | null;
  dso: number | null; dpo: number | null; dio: number | null;
  inventory_turnover: number | null;
  cash_conversion_cycle: number | null;
  ar_total: number; ar_overdue: number; ar_overdue_pct: number | null;
}

export default async function KpiPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  const ctx = await requirePermission('report', 'view');
  const d = t();
  const L = d.ui.kpi;
  const locale = currentLocale();
  const from = searchParams.from || firstDayOfYear();
  const to = searchParams.to || lastDayOfMonth();

  const supabase = createClient();
  const { data } = await supabase.rpc('rpt_kpi', {
    p_company: ctx.company.id, p_from: from, p_to: to,
  });
  const k = (data || {}) as Kpi;

  const num = (v: number | null, suffix = '') =>
    v == null ? null : `${Number(v).toLocaleString('en-US', { maximumFractionDigits: 1 })}${suffix}`;

  /** ตัวเลขเงิน 3 ตัวบนสุด — ภาพรวมผลประกอบการของงวด */
  const MONEY = [
    { label: L.revenue, value: k.revenue, tone: 'text-ink-900' },
    { label: L.grossProfit, value: k.gross_profit,
      tone: Number(k.gross_profit) < 0 ? 'text-rose-600' : 'text-ink-900',
      sub: k.gross_margin == null ? L.notEnough : `${L.grossMargin} ${k.gross_margin}%` },
    { label: L.netProfit, value: k.net_profit,
      tone: Number(k.net_profit) < 0 ? 'text-rose-600' : 'text-emerald-700',
      sub: k.net_margin == null ? L.notEnough : `${L.netMargin} ${k.net_margin}%` },
  ];

  /**
   * ตัวชี้วัดรอบการหมุนเวียน
   * วงจรเงินสดยิ่งน้อยยิ่งดี จึงย้อมสีเฉพาะตัวนี้ตัวเดียว
   * ตัวอื่นไม่ย้อม เพราะ "ดี" หรือ "ไม่ดี" ขึ้นกับธุรกิจแต่ละแบบ
   */
  const CYCLE = [
    { label: L.dso, value: num(k.dso, ` ${L.days}`), hint: L.dsoHint },
    { label: L.dio, value: num(k.dio, ` ${L.days}`), hint: L.dioHint },
    { label: L.dpo, value: num(k.dpo, ` ${L.days}`), hint: L.dpoHint },
    { label: L.ccc, value: num(k.cash_conversion_cycle, ` ${L.days}`), hint: L.cccHint,
      tone: k.cash_conversion_cycle == null ? undefined
            : Number(k.cash_conversion_cycle) > 90 ? 'text-rose-600'
            : Number(k.cash_conversion_cycle) > 45 ? 'text-amber-600' : 'text-emerald-700' },
    { label: L.turnover, value: num(k.inventory_turnover, ` ${L.times}`), hint: L.turnoverHint },
    { label: L.arOverdue, value: k.ar_overdue_pct == null ? null : `${k.ar_overdue_pct}%`,
      hint: L.arOverdueHint,
      tone: k.ar_overdue_pct == null ? undefined
            : Number(k.ar_overdue_pct) > 25 ? 'text-rose-600'
            : Number(k.ar_overdue_pct) > 10 ? 'text-amber-600' : 'text-emerald-700' },
  ];

  return (
    <>
      <PageHeader
        title={L.title}
        subtitle={`${ctx.company.name_th} · ${localeDate(from, locale)} – ${localeDate(to, locale)} · ${currencyLabel(ctx.company.base_currency, locale)}`}
        action={<DateRangeFilter from={from} to={to} labels={{ from: d.common.from, to: d.common.to, apply: d.common.filter }} />}
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {MONEY.map((m) => (
          <Card key={m.label} className="card-pad">
            <p className="text-xxs text-ink-500">{m.label}</p>
            <p className={cn('mt-1 text-2xl font-semibold tabular-nums', m.tone)}>{money(m.value)}</p>
            {m.sub && <p className="mt-0.5 text-xxs text-ink-400">{m.sub}</p>}
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CYCLE.map((c) => (
          <Card key={c.label} className="card-pad">
            <p className="text-xxs text-ink-500">{c.label}</p>
            <p className={cn('mt-1 text-xl font-semibold tabular-nums', c.tone || 'text-ink-900')}>
              {c.value ?? <span className="text-sm font-normal text-ink-400">{L.notEnough}</span>}
            </p>
            <p className="mt-1 text-xxs leading-relaxed text-ink-400">{c.hint}</p>
          </Card>
        ))}
      </div>

      <p className="mt-4 text-xxs text-ink-400">{L.subtitle}</p>
    </>
  );
}
