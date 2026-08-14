import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CompanyManager } from '@/components/forms/company-manager';
import { CompanyProfileEditor } from '@/components/forms/company-profile';

export const dynamic = 'force-dynamic';

export default async function CompaniesPage() {
  const ctx = await requirePermission('settings.companies', 'view');
  const d = t();
  const canEdit = can(ctx, 'settings.companies', 'edit');
  const supabase = createClient();
  const { data } = await supabase.from('companies').select('*').order('parent_id', { nullsFirst: true }).order('code');
  const rows = (data || []) as any[];

  return (
    <>
      <PageHeader
        title={d.nav.companies}
        subtitle={`${rows.length} บริษัทในเครือ · การเปิดบริษัทใหม่จะสร้างผังบัญชีและบทบาทมาตรฐานให้อัตโนมัติ`}
        action={<CompanyManager isGroupAdmin={ctx.isGroupAdmin} parents={rows.filter((r) => !r.parent_id).map((r) => ({ code: r.code, name: r.name_th }))} />}
      />
      <Card>
        <Table>
          <THead>
            <TR><TH>รหัส</TH><TH>ชื่อบริษัท</TH><TH>เลขประจำตัวผู้เสียภาษี</TH><TH>สาขา</TH><TH>VAT</TH><TH>สถานะ</TH><TH className="text-right">{d.common.actions}</TH></TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={7} label={d.common.noData} />}
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="font-mono text-xs">{r.code}</TD>
                <TD className={r.parent_id ? 'pl-8 text-ink-700' : 'font-semibold text-ink-900'}>
                  {r.name_th}
                  {!r.parent_id && <Badge tone="brand">บริษัทแม่</Badge>}
                  {r.name_en && <span className="ml-2 text-xs text-ink-400">{r.name_en}</span>}
                </TD>
                <TD className="font-mono text-xs">{r.tax_id || '–'}</TD>
                <TD className="text-xs">{r.branch_code} {r.branch_name}</TD>
                <TD>{r.vat_registered ? <Badge tone="success">{Number(r.vat_rate)}%</Badge> : <Badge>ไม่จด</Badge>}</TD>
                <TD>{r.is_active ? <Badge tone="success">ใช้งาน</Badge> : <Badge tone="danger">ปิด</Badge>}</TD>
                <TD className="text-right">
                  <CompanyProfileEditor row={r} canEdit={canEdit} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
