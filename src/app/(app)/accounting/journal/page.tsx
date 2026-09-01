import Link from 'next/link';
import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DateRangeFilter } from '@/components/forms/date-range-filter';
import { JournalEntryForm, ReverseEntryButton } from '@/components/forms/journal-entry-form';
import { firstDayOfMonth, lastDayOfMonth, localeDate, money } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function JournalPage({ searchParams }: { searchParams: { from?: string; to?: string; q?: string } }) {
  const ctx = await requirePermission('journal', 'view');
  const d = t();
  const locale = currentLocale();
  const supabase = createClient();
  const from = searchParams.from || firstDayOfMonth();
  const to = searchParams.to || lastDayOfMonth();

  let query = supabase
    .from('journal_entries')
    .select('*')
    .eq('company_id', ctx.company.id);

  // ค้นเลขที่รายการ : ข้ามช่วงวันที่ไปเลย เพราะคนที่กดมาจากแผนภาพหรือหน้าเจาะดู
  // ต้องการรายการใบนั้นโดยเฉพาะ ซึ่งมักอยู่คนละเดือนกับช่วงที่ตั้งไว้
  const q = (searchParams.q || '').trim();
  if (q) query = query.ilike('entry_number', `%${q}%`);
  else query = query.gte('entry_date', from).lte('entry_date', to);

  const [{ data }, { data: accounts }, { data: dims }] = await Promise.all([
    query.order('entry_date', { ascending: false }).limit(500),
    supabase.from('accounts').select('id, code, name_th')
      .eq('company_id', ctx.company.id).eq('is_active', true).eq('is_header', false).order('code').limit(1000),
    supabase.from('dimensions').select('id, code, name')
      .eq('company_id', ctx.company.id).eq('is_active', true).order('code').limit(500),
  ]);
  const rows = (data || []) as any[];
  const accOpts = (accounts || []).map((a: any) => ({ id: a.id, label: `${a.code} ${a.name_th}` }));
  const dimOpts = (dims || []).map((x: any) => ({ id: x.id, label: `${x.code} · ${x.name}` }));
  const canCreate = can(ctx, 'journal', 'create');
  const canPost = can(ctx, 'journal', 'post');
  const canVoid = can(ctx, 'journal', 'void');

  return (
    <>
      <PageHeader
        title={d.nav.journal}
        subtitle={`${ctx.company.name_th} · ${localeDate(from, locale)} – ${localeDate(to, locale)}`}
        action={
          <>
            <DateRangeFilter from={from} to={to} labels={{ from: d.common.from, to: d.common.to, apply: d.common.filter }} />
            <JournalEntryForm accounts={accOpts} dimensions={dimOpts} d={d}
                              canCreate={canCreate} canPost={canPost} />
          </>
        }
      />
      <Card>
        <Table>
          <THead>
            <TR><TH>{d.doc.number}</TH><TH>{d.common.date}</TH><TH>{d.ui.journalEntry.book}</TH>
              <TH>{d.ui.journalEntry.description}</TH>
              <TH align="right">{d.ui.journalEntry.debit}</TH>
              <TH align="right">{d.ui.journalEntry.credit}</TH>
              <TH>{d.common.status}</TH><TH align="right">{d.common.actions}</TH></TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={8} label={d.common.noData} />}
            {rows.map((r) => (
              <TR key={r.id}>
                <TD>
                  <Link href={`/accounting/journal/${r.id}`} className="font-medium text-brand-700 hover:underline">
                    {r.entry_number}
                  </Link>
                </TD>
                <TD>{localeDate(r.entry_date, locale)}</TD>
                <TD><Badge tone="neutral">{r.book}</Badge></TD>
                <TD><span className="block truncate max-w-[24rem]">{r.description}</span></TD>
                <TD align="right">{money(r.total_debit)}</TD>
                <TD align="right">{money(r.total_credit)}</TD>
                <TD>
                  <Badge tone={r.status === 'posted' ? 'success' : r.status === 'reversed' ? 'danger' : 'neutral'}>
                    {r.status === 'posted' ? d.ui.journalEntry.post
                      : r.status === 'reversed' ? d.ui.journalEntry.reverse
                      : d.status.draft}
                  </Badge>
                </TD>
                <TD align="right">
                  {r.status === 'posted' && (
                    <ReverseEntryButton entryId={r.id} d={d} canVoid={canVoid} reversed={!!r.reversed_by} />
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
