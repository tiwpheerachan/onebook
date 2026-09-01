import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DateRangeFilter } from '@/components/forms/date-range-filter';
import { PaymentForm, VoidPaymentButton } from '@/components/forms/payment-form';
import { StatusBadge } from '@/components/ui/badge';
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

  const [{ data }, { data: contacts }, { data: channels }] = await Promise.all([
    query.order('doc_date', { ascending: false }).limit(500),
    supabase.from('contacts').select('id, code, name')
      .eq('company_id', ctx.company.id).eq('is_active', true).order('name').limit(1000),
    supabase.from('financial_channels').select('id, code, name')
      .eq('company_id', ctx.company.id).eq('is_active', true).order('code'),
  ]);
  const rows = (data || []) as any[];
  const canCreate = can(ctx, 'finance.payments', 'create');
  const canVoid = can(ctx, 'finance.payments', 'void') || can(ctx, 'finance.payments', 'delete');
  const contactOpts = (contacts || []).map((c: any) => ({ id: c.id, label: `${c.code} · ${c.name}` }));
  const channelOpts = (channels || []).map((c: any) => ({ id: c.id, label: `${c.code} · ${c.name}` }));

  return (
    <>
      <PageHeader
        title={d.nav.payments}
        subtitle={`${ctx.company.name_th} · ${localeDate(from, locale)} – ${localeDate(to, locale)}`}
        action={
          <>
            <DateRangeFilter from={from} to={to} labels={{ from: d.common.from, to: d.common.to, apply: d.common.filter }} />
            <PaymentForm direction="receive" contacts={contactOpts} channels={channelOpts} d={d} canCreate={canCreate} />
            <PaymentForm direction="pay" contacts={contactOpts} channels={channelOpts} d={d} canCreate={canCreate} />
          </>
        }
      />
      <Card>
        <Table>
          <THead>
            <TR><TH>{d.doc.number}</TH><TH>{d.common.date}</TH><TH>{d.common.status}</TH>
              <TH>{d.doc.contact}</TH><TH>{d.nav.channels}</TH>
              <TH align="right">{d.common.amount}</TH><TH align="right">{d.ui.payment.wht}</TH>
              <TH align="right">{d.common.actions}</TH></TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={8} label={d.common.noData} />}
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="font-mono text-xs">{r.doc_number}</TD>
                <TD>{localeDate(r.doc_date, locale)}</TD>
                <TD>
                  <Badge tone={r.direction === 'receive' ? 'success' : 'warn'}>
                    {r.direction === 'receive' ? d.ui.payment.receive : d.ui.payment.pay}
                  </Badge>
                  {r.status === 'void' && <StatusBadge status="void" label={d.status.void} />}
                </TD>
                <TD><span className="block truncate max-w-[18rem]">{r.contacts?.name || '–'}</span></TD>
                <TD>{r.financial_channels?.name || '–'}</TD>
                <TD align="right" className="font-medium">{money(r.amount)}</TD>
                <TD align="right">{money(r.wht_amount)}</TD>
                <TD align="right">
                  {r.status !== 'void' && <VoidPaymentButton paymentId={r.id} d={d} canVoid={canVoid} />}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
