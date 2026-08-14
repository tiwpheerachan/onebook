import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { SearchBox } from '@/components/forms/search-box';
import { ContactManager } from '@/components/forms/contact-manager';
import { ExportCsvButton } from '@/components/ui/export-csv';
import { money } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ContactsPage({ searchParams }: { searchParams: { q?: string } }) {
  const ctx = await requirePermission('contacts', 'view');
  const d = t();
  const supabase = createClient();

  let q = supabase.from('contacts').select('*').eq('company_id', ctx.company.id).order('code').limit(500);
  if (searchParams.q) q = q.or(`name.ilike.%${searchParams.q}%,code.ilike.%${searchParams.q}%,tax_id.ilike.%${searchParams.q}%`);
  const { data } = await q;
  const rows = (data || []) as any[];

  const labels = {
    create: d.common.create, edit: d.common.edit, save: d.common.save,
    cancel: d.common.cancel, required: d.common.required,
  };

  return (
    <>
      <PageHeader
        title={d.nav.contacts}
        subtitle={ctx.company.name_th}
        action={
          <>
            <SearchBox placeholder={d.common.search} defaultValue={searchParams.q} />
            {can(ctx, 'contacts', 'export') && (
              <ExportCsvButton
                label={d.common.export}
                filename="contacts.csv"
                rows={[['รหัส','ชื่อ','เลขภาษี','ประเภท','โทร','อีเมล','เครดิต(วัน)'],
                  ...rows.map((r) => [r.code, r.name, r.tax_id || '', r.kind, r.phone || '', r.email || '', r.credit_days])]}
              />
            )}
            <ContactManager canCreate={can(ctx, 'contacts', 'create')} canEdit={can(ctx, 'contacts', 'edit')} labels={labels} />
          </>
        }
      />
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>รหัส</TH><TH>ชื่อ</TH><TH>เลขประจำตัวผู้เสียภาษี</TH><TH>ประเภท</TH>
              <TH>โทรศัพท์</TH><TH align="right">เครดิต</TH><TH align="right">วงเงิน</TH><TH />
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={8} label={d.common.noData} />}
            {rows.map((r) => (
              <TR key={r.id}>
                <TD><span className="font-mono text-xs">{r.code}</span></TD>
                <TD className="max-w-[22rem] truncate font-medium text-ink-900">{r.name}</TD>
                <TD><span className="font-mono text-xs text-ink-500">{r.tax_id || '–'}</span></TD>
                <TD>
                  <Badge tone={r.kind === 'vendor' ? 'warn' : r.kind === 'both' ? 'brand' : 'neutral'}>
                    {r.kind === 'customer' ? 'ลูกค้า' : r.kind === 'vendor' ? 'ผู้ขาย' : 'ทั้งสอง'}
                  </Badge>
                </TD>
                <TD>{r.phone || '–'}</TD>
                <TD align="right">{r.credit_days} วัน</TD>
                <TD align="right">{money(r.credit_limit)}</TD>
                <TD>
                  <ContactManager canCreate={false} canEdit={can(ctx, 'contacts', 'edit')} editRow={r} labels={labels} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
