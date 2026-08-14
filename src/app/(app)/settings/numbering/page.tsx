import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';
import { PageHeader, Card, CardHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { NumberingEditor, renderPattern } from '@/components/forms/numbering-editor';
import { SALES_KINDS, PURCHASE_KINDS, SLUG_BY_KIND, type DocKind } from '@/lib/constants';
import { docTitle } from '@/components/documents/doc-meta';

export const dynamic = 'force-dynamic';

const CYCLE_LABEL: Record<string, string> = {
  monthly: 'ทุกเดือน',
  yearly: 'ทุกปี',
  never: 'ไม่รีเซ็ต',
};

/** ค่าเริ่มต้นเดียวกับที่ next_doc_number ใช้ตอนยังไม่เคยตั้งค่า */
const defaultRow = (kind: DocKind) => ({
  doc_kind: kind,
  prefix: kind.slice(0, 2).toUpperCase(),
  pattern: '{PREFIX}{YY}{MM}-{SEQ:4}',
  next_number: 1,
  reset_cycle: 'monthly',
});

export default async function NumberingPage() {
  const ctx = await requirePermission('settings.numbering', 'view');
  const d = t();
  const canEdit = can(ctx, 'settings.numbering', 'edit');
  const supabase = createClient();

  const { data } = await supabase
    .from('doc_sequences')
    .select('doc_kind, prefix, pattern, next_number, reset_cycle')
    .eq('company_id', ctx.company.id);

  const byKind = new Map<string, any>((data || []).map((r: any) => [r.doc_kind, r]));

  const section = (kinds: DocKind[], title: string, hint: string) => (
    <Card className="mb-5">
      <CardHeader title={title} description={hint} />
      <Table>
        <THead>
          <TR>
            <TH>ประเภทเอกสาร</TH>
            <TH>อักษรนำหน้า</TH>
            <TH>รูปแบบ</TH>
            <TH>รีเซ็ต</TH>
            <TH className="text-right">เลขถัดไป</TH>
            <TH>ตัวอย่าง</TH>
            <TH className="text-right">{d.common.actions}</TH>
          </TR>
        </THead>
        <TBody>
          {kinds.map((kind) => {
            const row = byKind.get(kind) || defaultRow(kind);
            const isDefault = !byKind.has(kind);
            return (
              <TR key={kind}>
                <TD className="font-medium text-ink-800">
                  {docTitle(d, SLUG_BY_KIND[kind])}
                  {isDefault && <Badge>ค่าเริ่มต้น</Badge>}
                </TD>
                <TD className="font-mono text-xs">{row.prefix}</TD>
                <TD className="font-mono text-xxs text-ink-500">{row.pattern}</TD>
                <TD className="text-xs">{CYCLE_LABEL[row.reset_cycle] || row.reset_cycle}</TD>
                <TD className="num">{row.next_number}</TD>
                <TD className="font-mono text-xs text-brand-700">
                  {renderPattern(row.pattern, row.prefix, Number(row.next_number) || 1)}
                </TD>
                <TD className="text-right">
                  <NumberingEditor row={row} kindLabel={docTitle(d, SLUG_BY_KIND[kind])} canEdit={canEdit} />
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </Card>
  );

  return (
    <>
      <PageHeader
        title="รูปแบบเลขที่เอกสาร"
        subtitle={`${ctx.company.name_th} · ระบบออกเลขให้อัตโนมัติตอนบันทึกเอกสารใหม่ ตั้งค่าแยกได้ทุกประเภท`}
      />
      {section(SALES_KINDS, d.nav.sales, 'เอกสารที่ออกให้ลูกค้า')}
      {section(PURCHASE_KINDS, d.nav.purchase, 'เอกสารฝั่งซื้อและค่าใช้จ่าย')}
    </>
  );
}
