import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { YearEndActions } from '@/components/forms/year-end-actions';
import { money, localeDate, localeYear, currencyLabel } from '@/lib/format';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

interface FyStatus {
  fiscal_year: number; from: string; to: string;
  revenue: number; expense: number; net_profit: number;
  draft_entries: number; closed: boolean;
  closed_at: string | null; entry_id: string | null;
}

export default async function YearEndPage({
  searchParams,
}: {
  searchParams: { y?: string };
}) {
  const ctx = await requirePermission('period', 'view');
  const d = t();
  const L = d.ui.yearEnd;
  const locale = currentLocale();
  const year = Number(searchParams.y) || new Date().getFullYear() - 1;

  const supabase = createClient();
  const { data } = await supabase.rpc('rpt_fiscal_year', {
    p_company: ctx.company.id, p_year: year,
  });
  const fy = (data || {}) as FyStatus;

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
  const profit = Number(fy.net_profit || 0);

  return (
    <>
      <PageHeader
        title={L.title}
        subtitle={`${ctx.company.name_th} · ${L.subtitle} · ${currencyLabel(ctx.company.base_currency, locale)}`}
        breadcrumb={[{ label: d.nav.accounting }, { label: L.title }]}
        action={
          <>
            {/* เลือกปีด้วยลิงก์ ไม่ต้องมี state ฝั่งผู้ใช้ */}
            <span className="flex gap-1">
              {years.map((y) => (
                <Link key={y} href={`/accounting/year-end?y=${y}`}
                      className={cn('chip transition',
                        y === year ? 'bg-brand-600 text-white ring-brand-600'
                                   : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50')}>
                  {localeYear(y, locale)}
                </Link>
              ))}
            </span>
            <YearEndActions
              year={year}
              closed={!!fy.closed}
              blocked={Number(fy.draft_entries || 0)}
              canClose={can(ctx, 'period', 'lock')}
              canReopen={can(ctx, 'period', 'unlock')}
            />
          </>
        }
      />

      <Card className="mb-5 card-pad">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-sm font-medium text-ink-900">
              {L.fiscalYear} {localeYear(year, locale)}
            </p>
            <p className="mt-0.5 text-xs text-ink-500">
              {L.period} {localeDate(fy.from, locale)} – {localeDate(fy.to, locale)}
            </p>
          </div>
          <span className="ml-auto">
            {fy.closed
              ? <Badge tone="success">{L.statusClosed}</Badge>
              : <Badge>{L.statusOpen}</Badge>}
          </span>
        </div>
        {fy.closed && fy.closed_at && (
          <p className="mt-2 text-xxs text-ink-400">
            {L.closedAt.replace('{date}', localeDate(fy.closed_at, locale))}
            {fy.entry_id && (
              <>
                {' · '}
                <Link href={`/accounting/journal/${fy.entry_id}`}
                      className="text-brand-700 hover:underline">
                  {L.viewEntry}
                </Link>
              </>
            )}
          </p>
        )}
      </Card>

      {Number(fy.draft_entries || 0) > 0 && (
        <p className="mb-5 flex items-start gap-2 rounded-lg bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          {L.hasDrafts.replace('{n}', String(fy.draft_entries))}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: L.revenue, value: fy.revenue, tone: 'text-ink-900' },
          { label: L.expense, value: fy.expense, tone: 'text-ink-900' },
          { label: L.netProfit, value: profit,
            tone: profit < 0 ? 'text-rose-600' : 'text-emerald-700' },
        ].map((s) => (
          <Card key={s.label} className="card-pad">
            <p className="text-xxs text-ink-500">{s.label}</p>
            <p className={cn('mt-1 text-2xl font-semibold tabular-nums', s.tone)}>{money(s.value)}</p>
          </Card>
        ))}
      </div>

      <p className="mt-4 text-xxs leading-relaxed text-ink-400">{L.hint}</p>
      <p className="mt-1 text-xxs leading-relaxed text-ink-400">{L.reopenHint}</p>
    </>
  );
}
