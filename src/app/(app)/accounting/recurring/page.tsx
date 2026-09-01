import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card, CardHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  RecurringEditor, AmortEditor, RunRecurringButton,
  type RecurringRow, type AmortRow,
} from '@/components/forms/recurring-manager';
import { money, localeDate, currencyLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function RecurringPage() {
  const ctx = await requirePermission('journal', 'view');
  const d = t();
  const L = d.ui.recurring;
  const locale = currentLocale();
  const canEdit = can(ctx, 'journal', 'edit');
  const canRun = can(ctx, 'journal', 'post');

  const supabase = createClient();
  const [{ data: tpls }, { data: tplLines }, { data: amorts }, { data: accounts }, { data: dims }, { data: due }] =
    await Promise.all([
      supabase.from('recurring_journals').select('*')
        .eq('company_id', ctx.company.id).order('next_date'),
      supabase.from('recurring_journal_lines').select('*')
        .eq('company_id', ctx.company.id).order('line_no'),
      supabase.from('amortizations').select('*')
        .eq('company_id', ctx.company.id).order('start_date', { ascending: false }),
      supabase.from('accounts').select('id, code, name_th')
        .eq('company_id', ctx.company.id).eq('is_active', true).eq('is_header', false)
        .order('code').limit(1000),
      supabase.from('dimensions').select('id, code, name')
        .eq('company_id', ctx.company.id).eq('is_active', true).order('code').limit(500),
      supabase.rpc('rpt_recurring_due', { p_company: ctx.company.id }),
    ]);

  const accountOpts = (accounts || []).map((a: any) => ({ id: a.id, label: `${a.code} ${a.name_th}` }));
  const dimOpts = (dims || []).map((x: any) => ({ id: x.id, label: `${x.code} · ${x.name}` }));

  // แนบบรรทัดเข้ากับแม่แบบ เพื่อให้ฟอร์มแก้ไขมีข้อมูลครบตั้งแต่เปิด
  const linesOf = (id: string) => (tplLines || []).filter((l: any) => l.template_id === id);
  const rows = ((tpls || []) as any[]).map((r) => ({ ...r, lines: linesOf(r.id) })) as RecurringRow[];
  const amortRows = (amorts || []) as AmortRow[];

  const dueRec = ((due as any)?.recurring || []).length;
  const dueAmt = ((due as any)?.amortization || []).length;

  const freqLabel: Record<string, string> = {
    monthly: L.monthly, quarterly: L.quarterly, yearly: L.yearly,
  };

  return (
    <>
      <PageHeader
        title={L.title}
        subtitle={`${ctx.company.name_th} · ${L.subtitle} · ${currencyLabel(ctx.company.base_currency, locale)}`}
        breadcrumb={[{ label: d.nav.accounting }, { label: L.title }]}
        action={
          <>
            <RecurringEditor accounts={accountOpts} dimensions={dimOpts} canEdit={canEdit} />
            <AmortEditor accounts={accountOpts} dimensions={dimOpts} canEdit={canEdit} />
          </>
        }
      />

      <Card className="mb-5 card-pad">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-sm font-medium text-ink-900">{L.dueTitle}</p>
            <p className="mt-0.5 text-xs text-ink-500">
              {dueRec + dueAmt === 0
                ? L.dueNone
                : `${L.tabRecurring} ${dueRec} · ${L.tabAmort} ${dueAmt}`}
            </p>
          </div>
          <span className="ml-auto"><RunRecurringButton canRun={canRun} /></span>
        </div>
        <p className="mt-2 text-xxs leading-relaxed text-ink-400">{L.runHint}</p>
      </Card>

      <Card className="mb-5">
        <CardHeader title={L.tabRecurring} />
        <Table>
          <THead>
            <TR>
              <TH>{L.name}</TH>
              <TH>{L.frequency}</TH>
              <TH>{L.nextDate}</TH>
              <TH align="right">{L.amount}</TH>
              <TH>{d.common.status}</TH>
              <TH align="right">{d.common.actions}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={6} label={L.empty} />}
            {rows.map((r) => {
              const amt = (r.lines || []).reduce((a, l) => a + Number(l.debit || 0), 0);
              return (
                <TR key={r.id}>
                  <TD>
                    <span className="font-medium text-ink-800">{r.name}</span>
                    <span className="block text-xxs text-ink-400">{r.description}</span>
                  </TD>
                  <TD className="text-xs text-ink-600">
                    {freqLabel[r.frequency] || r.frequency}
                    {r.auto_reverse && (
                      <span className="ml-1 chip bg-sky-50 text-sky-700 ring-sky-200">{L.autoReverse}</span>
                    )}
                  </TD>
                  <TD>{localeDate(r.next_date, locale)}</TD>
                  <TD align="right">{money(amt)}</TD>
                  <TD>
                    {r.is_active
                      ? <Badge tone="success">{L.active}</Badge>
                      : <Badge>{d.ui.coa.inactive}</Badge>}
                  </TD>
                  <TD align="right">
                    <RecurringEditor row={r} accounts={accountOpts} dimensions={dimOpts} canEdit={canEdit} />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>

      <Card>
        <CardHeader title={L.tabAmort} description={L.lastPeriodHint} />
        <Table>
          <THead>
            <TR>
              <TH>{L.amortName}</TH>
              <TH>{L.startDate}</TH>
              <TH align="right">{L.totalAmount}</TH>
              <TH align="right">{L.perPeriod}</TH>
              <TH align="right">{L.posted}</TH>
              <TH align="right">{d.common.actions}</TH>
            </TR>
          </THead>
          <TBody>
            {amortRows.length === 0 && <EmptyRow colSpan={6} label={L.amortEmpty} />}
            {amortRows.map((a) => (
              <TR key={a.id}>
                <TD className="font-medium text-ink-800">{a.name}</TD>
                <TD>{localeDate(a.start_date, locale)}</TD>
                <TD align="right">{money(a.total_amount)}</TD>
                <TD align="right" className="text-ink-600">
                  {money(Number(a.total_amount) / Math.max(1, a.months))}
                </TD>
                <TD align="right" className="num text-ink-500">
                  {a.posted_periods}/{a.months}
                  <span className="block text-xxs">
                    {L.remainingPeriods.replace('{n}', String(a.months - a.posted_periods))}
                  </span>
                </TD>
                <TD align="right">
                  <AmortEditor row={a} accounts={accountOpts} dimensions={dimOpts} canEdit={canEdit} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
