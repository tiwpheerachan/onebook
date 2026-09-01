import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card, CardHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { DateRangeFilter } from '@/components/forms/date-range-filter';
import { firstDayOfMonth, lastDayOfMonth, localeDate, money } from '@/lib/format';
import { LedgerAccountPicker } from '@/components/forms/ledger-picker';

export const dynamic = 'force-dynamic';

export default async function LedgerPage({
  searchParams,
}: { searchParams: { from?: string; to?: string; account?: string } }) {
  const ctx = await requirePermission('journal', 'view');
  const d = t();
  const M = d.ui.misc;
  const locale = currentLocale();
  const supabase = createClient();
  const from = searchParams.from || firstDayOfMonth();
  const to = searchParams.to || lastDayOfMonth();

  const { data: accounts } = await supabase
    .from('accounts').select('id, code, name_th')
    .eq('company_id', ctx.company.id).eq('is_header', false).order('code').limit(1000);

  const accountId = searchParams.account || (accounts || [])[0]?.id;

  let rows: any[] = [];
  let opening = 0;
  if (accountId) {
    const { data: lines } = await supabase
      .from('journal_lines')
      .select('debit, credit, description, journal_entries!inner(entry_number, entry_date, status)')
      .eq('company_id', ctx.company.id)
      .eq('account_id', accountId)
      .gte('journal_entries.entry_date', from)
      .lte('journal_entries.entry_date', to)
      .eq('journal_entries.status', 'posted')
      .limit(1000);
    rows = (lines || []).sort((a: any, b: any) =>
      a.journal_entries.entry_date < b.journal_entries.entry_date ? -1 : 1);

    const { data: prior } = await supabase
      .from('journal_lines')
      .select('debit, credit, journal_entries!inner(entry_date, status)')
      .eq('company_id', ctx.company.id)
      .eq('account_id', accountId)
      .lt('journal_entries.entry_date', from)
      .eq('journal_entries.status', 'posted')
      .limit(5000);
    opening = (prior || []).reduce((a: number, l: any) => a + Number(l.debit) - Number(l.credit), 0);
  }

  let running = opening;
  const acc = (accounts || []).find((a: any) => a.id === accountId);

  return (
    <>
      <PageHeader
        title={d.nav.ledger}
        subtitle={`${ctx.company.name_th} · ${localeDate(from, locale)} – ${localeDate(to, locale)}`}
        action={<DateRangeFilter from={from} to={to} labels={{ from: d.common.from, to: d.common.to, apply: d.common.filter }} />}
      />
      <div className="mb-4">
        <LedgerAccountPicker
          accounts={(accounts || []).map((a: any) => ({ id: a.id, label: `${a.code} · ${a.name_th}` }))}
          current={accountId || ''}
        />
      </div>
      <Card>
        <CardHeader title={acc ? `${acc.code} · ${acc.name_th}` : d.nav.ledger} />
        <Table>
          <THead>
            <TR><TH>{M.date}</TH><TH>{M.docNo}</TH><TH>{M.description}</TH>
              <TH align="right">{M.debit}</TH><TH align="right">{M.credit}</TH><TH align="right">{M.balance}</TH></TR>
          </THead>
          <TBody>
            <TR className="bg-ink-50/60">
              <TD colSpan={3}>{M.openingBalance}</TD><TD /><TD /><TD align="right">{money(opening)}</TD>
            </TR>
            {rows.length === 0 && <EmptyRow colSpan={6} label={d.common.noData} />}
            {rows.map((l: any, i: number) => {
              running += Number(l.debit) - Number(l.credit);
              return (
                <TR key={i}>
                  <TD>{localeDate(l.journal_entries.entry_date, locale)}</TD>
                  <TD className="font-mono text-xs">{l.journal_entries.entry_number}</TD>
                  <TD><span className="block truncate max-w-[26rem]">{l.description}</span></TD>
                  <TD align="right">{Number(l.debit) ? money(l.debit) : '–'}</TD>
                  <TD align="right">{Number(l.credit) ? money(l.credit) : '–'}</TD>
                  <TD align="right" className="font-medium">{money(running)}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
