import Link from 'next/link';
import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DateRangeFilter } from '@/components/forms/date-range-filter';
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

  const { data } = await query
    .order('entry_date', { ascending: false }).limit(500);
  const rows = (data || []) as any[];

  return (
    <>
      <PageHeader
        title={d.nav.journal}
        subtitle={`${ctx.company.name_th} · ${localeDate(from, locale)} – ${localeDate(to, locale)}`}
        action={<DateRangeFilter from={from} to={to} labels={{ from: d.common.from, to: d.common.to, apply: d.common.filter }} />}
      />
      <Card>
        <Table>
          <THead>
            <TR><TH>เลขที่</TH><TH>วันที่</TH><TH>สมุด</TH><TH>คำอธิบาย</TH>
              <TH align="right">เดบิต</TH><TH align="right">เครดิต</TH><TH>สถานะ</TH></TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={7} label={d.common.noData} />}
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
                    {r.status === 'posted' ? 'ผ่านรายการ' : r.status === 'reversed' ? 'กลับรายการ' : 'ร่าง'}
                  </Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
