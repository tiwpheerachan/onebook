import Link from 'next/link';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { FxLine } from '@/components/charts/fx-line';
import { FxBackfillButton } from '@/components/forms/fx-backfill';
import { FxCurrencyPicker } from '@/components/forms/fx-currency-picker';
import { localeDate, toDateStr } from '@/lib/format';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

const CURRENCIES = ['CNY', 'USD', 'EUR', 'JPY', 'SGD', 'MYR', 'KRW', 'GBP', 'AUD', 'HKD', 'TWD'];
const RANGES = [
  { days: 30, key: 'd30' as const },
  { days: 90, key: 'd90' as const },
  { days: 180, key: 'd180' as const },
  { days: 365, key: 'd365' as const },
];

interface Point { date: string; sell: number; buy: number | null; diff: number | null; pct: number | null }
interface Trend {
  currency: string; count: number;
  low: number; high: number; average: number;
  first: number; last: number; change: number | null;
  points: Point[];
}
interface Latest { currency: string; rate_date: string; sell: number; prev: number | null; pct: number | null }

export default async function FxRatesPage({
  searchParams,
}: {
  searchParams: { c?: string; d?: string };
}) {
  const ctx = await requirePermission('documents', 'view');
  const d = t();
  const L = d.ui.fxTrend;
  const locale = currentLocale();

  const currency = CURRENCIES.includes((searchParams.c || '').toUpperCase())
    ? (searchParams.c as string).toUpperCase() : 'CNY';
  const days = RANGES.some((r) => String(r.days) === searchParams.d)
    ? Number(searchParams.d) : 90;

  const to = toDateStr(new Date());
  const from = toDateStr(new Date(Date.now() - days * 86400000));

  const supabase = createClient();
  const [{ data: trend }, { data: latest }] = await Promise.all([
    supabase.rpc('rpt_fx_trend', { p_currency: currency, p_from: from, p_to: to }),
    supabase.rpc('rpt_fx_latest', { p_days: 400 }),
  ]);

  const tr = (trend || { points: [] }) as Trend;
  const all = (latest || []) as Latest[];
  const canEdit = can(ctx, 'documents', 'edit');
  const change = tr.change == null ? null : Number(tr.change);

  /** อัตราขึ้น = บาทอ่อน ซื้อของแพงขึ้น ซึ่งเป็นข่าวร้ายสำหรับคนนำเข้า */
  const verdict =
    change == null ? null
    : change > 0.05 ? { text: L.weakerBaht, tone: 'text-rose-600', Icon: TrendingUp }
    : change < -0.05 ? { text: L.strongerBaht, tone: 'text-emerald-600', Icon: TrendingDown }
    : { text: L.flat, tone: 'text-ink-500', Icon: Minus };

  const href = (c: string, dd: number) => `/reports/fx-rates?c=${c}&d=${dd}`;
  const n4 = (v: number | null | undefined) =>
    v == null ? '–' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

  return (
    <>
      <PageHeader
        title={L.title}
        subtitle={`${ctx.company.name_th} · ${L.subtitle}`}
        action={
          <FxBackfillButton currencies={[currency]} from={from} to={to} canEdit={canEdit} />
        }
      />

      {/* อัตราล่าสุดของทุกสกุลที่เคยดึงมา กดเพื่อสลับกราฟ */}
      {all.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {all.map((x) => {
            const up = Number(x.pct || 0) > 0;
            const flat = x.pct == null || Math.abs(Number(x.pct)) < 0.005;
            return (
              <Link key={x.currency} href={href(x.currency, days)}
                    className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition',
                      x.currency === currency
                        ? 'border-brand-300 bg-brand-50'
                        : 'border-ink-200 bg-white hover:bg-ink-50')}>
                <b className="font-mono text-xs text-ink-700">{x.currency}</b>
                <span className="tabular-nums text-ink-900">{n4(x.sell)}</span>
                {!flat && (
                  <span className={cn('text-xxs tabular-nums', up ? 'text-rose-600' : 'text-emerald-600')}>
                    {up ? '▲' : '▼'} {Math.abs(Number(x.pct)).toFixed(2)}%
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FxCurrencyPicker currencies={CURRENCIES} current={currency} />
        <span className="flex gap-1">
          {RANGES.map((r) => (
            <Link key={r.days} href={href(currency, r.days)}
                  className={cn('chip transition',
                    r.days === days ? 'bg-brand-600 text-white ring-brand-600'
                                    : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50')}>
              {L[r.key]}
            </Link>
          ))}
        </span>
        {tr.count > 0 && (
          <span className="text-xxs text-ink-400">{L.points.replace('{n}', String(tr.count))}</span>
        )}
      </div>

      {tr.count === 0 ? (
        <Card className="card-pad text-center">
          <p className="text-sm text-ink-500">{L.empty}</p>
          {!canEdit && <p className="mt-2 text-xxs text-ink-400">{L.noBot}</p>}
        </Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card className="card-pad">
              <p className="text-xxs text-ink-500">{L.latest}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-ink-900">{n4(tr.last)}</p>
              <p className="mt-0.5 text-xxs text-ink-400">{localeDate(tr.points.at(-1)?.date, locale)}</p>
            </Card>
            <Card className="card-pad">
              <p className="text-xxs text-ink-500">{L.change}</p>
              <p className={cn('mt-1 text-2xl font-semibold tabular-nums', verdict?.tone)}>
                {change == null ? '–' : `${change > 0 ? '+' : ''}${change}%`}
              </p>
              {verdict && (
                <p className={cn('mt-0.5 flex items-center gap-1 text-xxs', verdict.tone)}>
                  <verdict.Icon className="h-3 w-3" strokeWidth={2} /> {verdict.text}
                </p>
              )}
            </Card>
            <Card className="card-pad">
              <p className="text-xxs text-ink-500">{L.low} / {L.high}</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-ink-900">
                {n4(tr.low)} – {n4(tr.high)}
              </p>
            </Card>
            <Card className="card-pad">
              <p className="text-xxs text-ink-500">{L.average}</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-ink-900">{n4(tr.average)}</p>
            </Card>
          </div>

          <Card className="card-pad mb-5">
            <FxLine points={tr.points} labels={{ low: L.low, high: L.high }} />
            <p className="mt-2 text-xxs leading-relaxed text-ink-400">{L.readHint}</p>
          </Card>

          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>{L.date}</TH>
                  <TH align="right">{L.sell}</TH>
                  <TH align="right">{L.diff}</TH>
                </TR>
              </THead>
              <TBody>
                {tr.points.length === 0 && <EmptyRow colSpan={3} label={d.common.noData} />}
                {[...tr.points].reverse().slice(0, 60).map((p) => {
                  const up = Number(p.diff || 0) > 0;
                  return (
                    <TR key={p.date}>
                      <TD>{localeDate(p.date, locale)}</TD>
                      <TD align="right" className="font-medium tabular-nums">{n4(p.sell)}</TD>
                      <TD align="right" className={cn('tabular-nums',
                        p.diff == null ? 'text-ink-300' : up ? 'text-rose-600' : 'text-emerald-600')}>
                        {p.diff == null ? '–'
                          : `${up ? '+' : ''}${Number(p.diff).toFixed(4)} (${Number(p.pct).toFixed(2)}%)`}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}
