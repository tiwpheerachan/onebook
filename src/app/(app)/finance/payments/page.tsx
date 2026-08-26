import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DateRangeFilter } from '@/components/forms/date-range-filter';
import { firstDayOfMonth, lastDayOfMonth, localeDate, money } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function PaymentsPage({ searchParams }: { searchParams: { from?: string; to?: string; q?: string } }) {
  const ctx = await requirePermission('finance.payments', 'view');
  const d = t();
  const locale = currentLocale();
  const from = searchParams.from || firstDayOfMonth();
  const to = searchParams.to || lastDayOfMonth();
  const supabase = createClient();
  let query = supabase
    .from('payments')
    .select('*, contacts(name), financial_channels(name)')
    .eq('company_id', ctx.company.id);

  // ค้นเลขที่รายการ : ข้ามช่วงวันที่ ด้วยเหตุผลเดียวกับหน้าสมุดรายวัน
  const q = (searchParams.q || '').trim();
  if (q) query = query.ilike('doc_number', `%${q}%`);
  else query = query.gte('doc_date', from).lte('doc_date', to);

  const { data } = await query
    .order('doc_date', { ascending: false }).limit(500);
  const rows = (data || []) as any[];

  return (
    <>
      <PageHeader
        title={d.nav.payments}
        subtitle={`${ctx.company.name_th} · ${localeDate(from, locale)} – ${localeDate(to, locale)}`}
        action={<DateRangeFilter from={from} to={to} labels={{ from: d.common.from, to: d.common.to, apply: d.common.filter }} />}
      />
      <Card>
        <Table>
          <THead>
            <TR><TH>เลขที่</TH><TH>วันที่</TH><TH>ประเภท</TH><TH>คู่ค้า</TH><TH>ช่องทาง</TH>
              <TH align="right">จำนวนเงิน</TH><TH align="right">WHT</TH></TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={7} label={d.common.noData} />}
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="font-mono text-xs">{r.doc_number}</TD>
                <TD>{localeDate(r.doc_date, locale)}</TD>
                <TD><Badge tone={r.direction === 'receive' ? 'success' : 'warn'}>{r.direction === 'receive' ? 'รับเงิน' : 'จ่ายเงิน'}</Badge></TD>
                <TD className="max-w-[18rem] truncate">{r.contacts?.name || '–'}</TD>
                <TD>{r.financial_channels?.name || '–'}</TD>
                <TD align="right" className="font-medium">{money(r.amount)}</TD>
                <TD align="right">{money(r.wht_amount)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
