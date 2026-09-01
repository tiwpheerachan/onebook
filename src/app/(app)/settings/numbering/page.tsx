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
  const L = d.ui.numbering;
  const CYCLE_LABEL: Record<string, string> = { monthly: L.monthly, yearly: L.yearly, never: L.never };
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
            <TH>{L.docKind}</TH>
            <TH>{L.prefix}</TH>
            <TH>{L.pattern}</TH>
            <TH>{L.reset}</TH>
            <TH className="text-right">{L.nextNo}</TH>
            <TH>{L.sample}</TH>
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
                  {isDefault && <Badge>{L.isDefault}</Badge>}
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
        title={L.title}
        subtitle={`${ctx.company.name_th} · ${L.subtitle}`}
      />
      {section(SALES_KINDS, d.nav.sales, L.salesHint)}
      {section(PURCHASE_KINDS, d.nav.purchase, L.purchaseHint)}
    </>
  );
}
