import Link from 'next/link';
import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ExportCsvButton } from '@/components/ui/export-csv';
import { PrintButton } from '@/components/ui/print-button';
import { money, currencyLabel, firstDayOfMonth, lastDayOfMonth } from '@/lib/format';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

interface TrialRow {
  code: string; name: string; type: string;
  balance_a: number; balance_b: number; diff: number; diff_pct: number | null;
  moved_a: number; moved_b: number;
}
interface PlRow {
  code: string; name: string; section: string;
  amount_a: number; amount_b: number; diff: number; diff_pct: number | null;
}

/** เดือนก่อนหน้าของช่วงที่เลือก ใช้เป็นงวดเปรียบเทียบตั้งต้น */
function prevMonth(from: string) {
  const d = new Date(from + 'T00:00:00Z');
  const a = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  const b = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0));
  return { from: a.toISOString().slice(0, 10), to: b.toISOString().slice(0, 10) };
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: { fa?: string; ta?: string; fb?: string; tb?: string; view?: string };
}) {
  const ctx = await requirePermission('report', 'view');
  const d = t();
  const L = d.ui.compare;
  const locale = currentLocale();

  const fb = searchParams.fb || firstDayOfMonth();
  const tb = searchParams.tb || lastDayOfMonth();
  const prev = prevMonth(fb);
  const fa = searchParams.fa || prev.from;
  const ta = searchParams.ta || prev.to;
  const view = searchParams.view === 'pl' ? 'pl' : 'trial';

  const supabase = createClient();
  const { data } = await supabase.rpc(
    view === 'pl' ? 'rpt_profit_loss_compare' : 'rpt_trial_balance_compare',
    { p_company: ctx.company.id, p_from_a: fa, p_to_a: ta, p_from_b: fb, p_to_b: tb },
  );

  const trialRows = view === 'trial' ? ((data || []) as TrialRow[]) : [];
  const plRows = view === 'pl' ? (((data as any)?.rows || []) as PlRow[]) : [];
  const plSum = view === 'pl' ? ((data as any)?.summary || {}) : {};

  const tab = (key: 'trial' | 'pl', label: string) => {
    const p = new URLSearchParams({ fa, ta, fb, tb });
    if (key !== 'trial') p.set('view', key);
    return (
      <Link key={key} href={`/reports/compare?${p.toString()}`}
            className={cn('chip transition',
              view === key ? 'bg-brand-600 text-white ring-brand-600'
                           : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50')}>
        {label}
      </Link>
    );
  };

  /** ผลต่างเป็นบวกหรือลบ ระบายสีให้อ่านเร็ว และเว้นขีดเมื่องวดก่อนเป็นศูนย์ */
  const Pct = ({ v }: { v: number | null }) =>
    v == null
      ? <span className="text-ink-300">–</span>
      : <span className={cn('tabular-nums', v > 0 ? 'text-emerald-700' : v < 0 ? 'text-rose-600' : 'text-ink-500')}>
          {v > 0 ? '+' : ''}{v.toFixed(1)}%
        </span>;

  const summaryCard = (label: string, a: number, b: number) => (
    <div key={label} className="px-5 py-3.5">
      <p className="text-xxs uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-ink-900">{money(b)}</p>
      <p className="text-xxs tabular-nums text-ink-500">
        {L.periodA} {money(a)}
        {a !== 0 && (
          <span className={cn('ml-1.5', b - a >= 0 ? 'text-emerald-700' : 'text-rose-600')}>
            {b - a >= 0 ? '+' : ''}{(((b - a) / Math.abs(a)) * 100).toFixed(1)}%
          </span>
        )}
      </p>
    </div>
  );

  const gp_a = Number(plSum.revenue_a || 0) - Number(plSum.cost_a || 0);
  const gp_b = Number(plSum.revenue_b || 0) - Number(plSum.cost_b || 0);
  const np_a = gp_a - Number(plSum.expense_a || 0);
  const np_b = gp_b - Number(plSum.expense_b || 0);

  return (
    <>
      <PageHeader
        title={view === 'pl' ? L.plTitle : L.title}
        subtitle={`${ctx.company.name_th} · ${view === 'pl' ? L.plSubtitle : L.subtitle} · ${currencyLabel(ctx.company.base_currency, locale)}`}
        action={
          <>
            <form className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="view" value={view} />
              <span className="flex items-center gap-1.5">
                <span className="text-xxs text-ink-500">{L.periodA}</span>
                <input type="date" name="fa" defaultValue={fa} className="input h-9 w-36 py-1.5 text-sm" />
                <input type="date" name="ta" defaultValue={ta} className="input h-9 w-36 py-1.5 text-sm" />
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-xxs text-ink-500">{L.periodB}</span>
                <input type="date" name="fb" defaultValue={fb} className="input h-9 w-36 py-1.5 text-sm" />
                <input type="date" name="tb" defaultValue={tb} className="input h-9 w-36 py-1.5 text-sm" />
              </span>
              <button className="btn-secondary" type="submit">{d.common.filter}</button>
            </form>
            {can(ctx, 'report', 'export') && (
              <ExportCsvButton
                label={d.common.export}
                filename={`compare-${view}-${fa}_${ta}-vs-${fb}_${tb}.csv`}
                rows={view === 'pl'
                  ? [[L.account, L.periodA, L.periodB, L.diff, L.diffPct],
                     ...plRows.map((r) => [`${r.code} ${r.name}`, r.amount_a, r.amount_b, r.diff, r.diff_pct ?? ''])]
                  : [[L.account, L.periodA, L.periodB, L.diff, L.diffPct],
                     ...trialRows.map((r) => [`${r.code} ${r.name}`, r.balance_a, r.balance_b, r.diff, r.diff_pct ?? ''])]}
              />
            )}
            <PrintButton label={d.common.print} />
          </>
        }
      />

      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        {tab('trial', L.tabTrial)}
        {tab('pl', L.tabPl)}
      </div>

      {view === 'pl' && (
        <Card className="mb-5">
          <div className="grid grid-cols-1 divide-y divide-ink-200 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            {summaryCard(L.revenue, Number(plSum.revenue_a || 0), Number(plSum.revenue_b || 0))}
            {summaryCard(L.grossProfit, gp_a, gp_b)}
            {summaryCard(L.expense, Number(plSum.expense_a || 0), Number(plSum.expense_b || 0))}
            {summaryCard(L.netProfit, np_a, np_b)}
          </div>
        </Card>
      )}

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>{L.account}</TH>
              <TH align="right">{L.periodA}</TH>
              <TH align="right">{L.periodB}</TH>
              <TH align="right">{L.diff}</TH>
              <TH align="right">{L.diffPct}</TH>
            </TR>
          </THead>
          <TBody>
            {view === 'trial' && trialRows.length === 0 && <EmptyRow colSpan={5} label={L.empty} />}
            {view === 'pl' && plRows.length === 0 && <EmptyRow colSpan={5} label={L.empty} />}

            {view === 'trial' && trialRows.map((r) => (
              <TR key={r.code}>
                <TD>
                  <span className="font-mono text-xs text-ink-500">{r.code}</span>{' '}
                  <span className="text-ink-900">{r.name}</span>
                  {/* บัญชีที่เพิ่งมีความเคลื่อนไหวงวดนี้ ทำป้ายไว้ให้สังเกตได้ */}
                  {Number(r.moved_a) === 0 && Number(r.moved_b) !== 0 && (
                    <Badge tone="brand">{L.newInPeriod}</Badge>
                  )}
                </TD>
                <TD align="right" className="text-ink-600">{money(r.balance_a)}</TD>
                <TD align="right" className="font-medium text-ink-900">{money(r.balance_b)}</TD>
                <TD align="right" className={cn('tabular-nums',
                  r.diff > 0 ? 'text-emerald-700' : r.diff < 0 ? 'text-rose-600' : 'text-ink-400')}>
                  {r.diff > 0 ? '+' : ''}{money(r.diff)}
                </TD>
                <TD align="right"><Pct v={r.diff_pct} /></TD>
              </TR>
            ))}

            {view === 'pl' && plRows.map((r) => (
              <TR key={r.code}>
                <TD>
                  <span className="font-mono text-xs text-ink-500">{r.code}</span>{' '}
                  <span className="text-ink-900">{r.name}</span>
                </TD>
                <TD align="right" className="text-ink-600">{money(r.amount_a)}</TD>
                <TD align="right" className="font-medium text-ink-900">{money(r.amount_b)}</TD>
                <TD align="right" className={cn('tabular-nums',
                  r.diff > 0 ? 'text-emerald-700' : r.diff < 0 ? 'text-rose-600' : 'text-ink-400')}>
                  {r.diff > 0 ? '+' : ''}{money(r.diff)}
                </TD>
                <TD align="right"><Pct v={r.diff_pct} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <p className="mt-4 text-xs leading-relaxed text-ink-400">{L.hint}</p>
    </>
  );
}
