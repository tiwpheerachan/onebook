import { notFound } from 'next/navigation';
import { Printer, GitBranch } from 'lucide-react';
import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/badge';
import { PrintButton } from '@/components/ui/print-button';
import { KIND_SLUG, SLUG_BY_KIND } from '@/lib/constants';
import { nextKinds } from '@/lib/doc-flow';
import { localeDate } from '@/lib/format';
import { DocumentEditor } from './document-editor';
import { ConvertButton } from './convert-button';
import { ReserveButton } from './reserve-button';
import { AttachmentPanel } from './attachment-panel';
import { DepositPanel } from './deposit-panel';
import { docTitle, isPurchase } from './doc-meta';

export async function DocumentPage({
  slug, id, initialContactId,
}: {
  slug: string;
  id: string;
  /** ผู้ติดต่อที่เลือกมาจากหน้าอื่น เช่น กด "ทำรายการ" จากหน้าผู้ติดต่อ */
  initialContactId?: string;
}) {
  const kind = KIND_SLUG[slug];
  if (!kind) notFound();
  const isNew = id === 'new';
  const ctx = await requirePermission('documents', isNew ? 'create' : 'view');
  const d = t();
  const locale = currentLocale();
  const supabase = createClient();
  const section: 'sales' | 'purchase' = isPurchase(slug) ? 'purchase' : 'sales';

  const [{ data: contacts }, { data: products }, { data: accounts }, { data: dimensions }] = await Promise.all([
    supabase.from('contacts').select('id, name, tax_id')
      .eq('company_id', ctx.company.id).eq('is_active', true).order('name').limit(1000),
    supabase.from('products_masked').select('id, name, sku, sale_price, purchase_price, unit')
      .eq('company_id', ctx.company.id).eq('is_active', true).order('sku').limit(1000),
    supabase.from('accounts').select('id, code, name_th')
      .eq('company_id', ctx.company.id).eq('is_active', true).eq('is_header', false).order('code').limit(500),
    // ผู้ที่ไม่มีสิทธิ์ settings.dimensions จะได้ข้อมูลว่างจาก RLS ช่องเลือกจึงหายไปเอง
    supabase.from('dimensions').select('id, code, name, group_name')
      .eq('company_id', ctx.company.id).eq('is_active', true).order('code').limit(500),
  ]);

  let doc: any = null;
  let lines: any[] = [];
  let attachments: any[] = [];
  let credit: any = null;
  let openDeposits: any[] = [];
  let appliedDeposits: any[] = [];
  if (!isNew) {
    const { data } = await supabase.from('documents').select('*').eq('id', id).maybeSingle();
    if (!data) notFound();
    doc = data;
    const { data: ls } = await supabase.from('document_lines').select('*').eq('document_id', id).order('line_no');
    lines = ls || [];
    const { data: at } = await supabase
      .from('attachments')
      .select('id, file_name, mime_type, size_bytes, created_at')
      .eq('document_id', id)
      .order('created_at', { ascending: false });
    attachments = at || [];

    // สถานะวงเงินของลูกค้า บอกก่อนกดอนุมัติดีกว่าให้กดแล้วเจอข้อความปฏิเสธ
    // เฉพาะเอกสารที่ก่อหนี้ลูกค้าเท่านั้น ใบเสนอราคาหรือเอกสารซื้อไม่เกี่ยว
    if (doc.contact_id && ['invoice', 'tax_invoice', 'debit_note'].includes(doc.kind)) {
      const { data: cs } = await supabase.rpc('rpt_credit_status', {
        p_company: ctx.company.id, p_contact: doc.contact_id,
      });
      if (cs && !(cs as any).unlimited) credit = cs;
    }

    // เงินมัดจำที่หักได้กับเอกสารใบนี้ และที่หักไปแล้ว
    const DEPOSIT_TARGETS = ['invoice', 'tax_invoice', 'billing_note', 'bill', 'expense'];
    if (DEPOSIT_TARGETS.includes(doc.kind)) {
      const [{ data: ap }, { data: op }] = await Promise.all([
        supabase.rpc('rpt_deposit_applications', { p_document: doc.id }),
        doc.contact_id && !['void', 'closed', 'paid'].includes(doc.status)
          ? supabase.rpc('rpt_open_deposits', {
              p_company: ctx.company.id, p_contact: doc.contact_id,
              p_side: section === 'purchase' ? 'purchase' : 'sales',
            })
          : Promise.resolve({ data: [] as any }),
      ]);
      appliedDeposits = (ap || []) as any[];
      openDeposits = (op || []) as any[];
    }
  }

  return (
    <>
      <PageHeader
        title={isNew ? `${d.common.create}${docTitle(d, slug)}` : `${docTitle(d, slug)} ${doc.doc_number}`}
        subtitle={isNew ? ctx.company.name_th : `${ctx.company.name_th} · ${localeDate(doc.doc_date, locale)}`}
        breadcrumb={[
          { label: section === 'sales' ? d.nav.sales : d.nav.purchase },
          { label: docTitle(d, slug), href: `/${section}/${slug}` },
          { label: isNew ? d.common.create : doc.doc_number },
        ]}
        action={
          <>
            {doc && <StatusBadge status={doc.status} label={(d.status as any)[doc.status]} />}
            {doc && doc.status !== 'void' && can(ctx, 'documents', 'create') && (
              <ConvertButton
                documentId={doc.id}
                targets={nextKinds(kind).map((k) => ({ kind: k, label: docTitle(d, SLUG_BY_KIND[k]) }))}
                labels={{ convert: d.doc.convert }}
              />
            )}
            {doc && (
              <a href={`/documents/trace/${doc.id}`} className="btn-secondary no-print">
                <GitBranch className="h-4 w-4 text-ink-400" strokeWidth={1.8} /> ที่มา
              </a>
            )}
            {doc && (
              <a href={`/print/${doc.id}`} target="_blank" rel="noopener" className="btn-secondary no-print">
                <Printer className="h-4 w-4 text-ink-400" strokeWidth={1.8} /> {d.doc.printForm}
              </a>
            )}
            {/* จองสินค้าได้เฉพาะใบสั่งขายที่ยังไม่ปิด และคนที่มีสิทธิ์แก้สต๊อก */}
            {doc && kind === 'sales_order'
              && !['void', 'closed'].includes(doc.status)
              && can(ctx, 'products.inventory', 'edit') && (
              <ReserveButton
                documentId={doc.id}
                labels={{
                  reserve: d.ui.salesOrder.reserve,
                  reserved: d.ui.salesOrder.reserved,
                  nothingToReserve: d.ui.salesOrder.nothingToReserve,
                  shortTitle: d.ui.salesOrder.shortTitle,
                  shortLine: d.ui.salesOrder.shortLine,
                }}
              />
            )}
            {doc && <PrintButton label={d.common.print} />}
          </>
        }
      />

      <DocumentEditor
        slug={slug}
        kind={kind}
        section={section}
        title={docTitle(d, slug)}
        contacts={(contacts || []).map((c: any) => ({ id: c.id, label: c.name, sub: c.tax_id }))}
        products={(products || []).map((p: any) => ({
          id: p.id,
          label: `${p.sku} · ${p.name}`,
          price: section === 'sales' ? Number(p.sale_price) : Number(p.purchase_price),
          unit: p.unit,
        }))}
        accounts={(accounts || []).map((a: any) => ({ id: a.id, label: `${a.code} ${a.name_th}` }))}
        dimensions={(dimensions || []).map((x: any) => ({ id: x.id, label: `${x.code} · ${x.name}` }))}
        doc={doc}
        lines={lines}
        initialContactId={initialContactId}
        perms={{
          create: can(ctx, 'documents', 'create'),
          edit: can(ctx, 'documents', 'edit'),
          approve: can(ctx, 'documents', 'approve'),
          void: can(ctx, 'documents', 'void') || can(ctx, 'documents', 'delete'),
        }}
        lockedThrough={ctx.lockedThrough}
        credit={credit}
        labels={{
          contact: d.doc.contact, docDate: d.doc.docDate, dueDate: d.doc.dueDate,
          reference: d.doc.reference, notes: d.common.notes, product: d.doc.product,
          description: d.doc.description, quantity: d.doc.quantity, unit: d.doc.unit,
          unitPrice: d.doc.unitPrice, discount: d.doc.discount, vatType: d.doc.vatType,
          whtType: d.doc.whtType, subtotal: d.doc.subtotal, vatBase: d.doc.vatBase,
          vat: d.doc.vat, wht: d.doc.wht, grandTotal: d.doc.grandTotal, netPayable: d.doc.netPayable,
          addLine: d.doc.addLine, account: d.doc.account,
          dimension: d.ui.dimension.title, noDimension: d.ui.dimension.none,
          creditLimit: d.ui.credit.limit, creditOutstanding: d.ui.credit.outstanding,
          creditAvailable: d.ui.credit.available, creditOver: d.ui.credit.over,
          creditNear: d.ui.credit.near, creditOverrideHint: d.ui.credit.overrideHint,
          exclusive: d.doc.exclusive, inclusive: d.doc.inclusive, zeroRated: d.doc.zeroRated,
          exempt: d.doc.exempt, none: d.doc.none,
          save: d.common.save, approve: d.common.approve, void: d.common.void,
          saveAndApprove: `${d.common.save} + ${d.common.approve}`,
          select: d.common.search, freeText: d.doc.freeText, auto: d.doc.auto,
          removeLine: d.doc.removeLine,
          amountInWords: d.doc.amountInWords,
          frozen: d.security.frozen,
          voidReason: d.security.reason,
        }}
      />

      {doc && (
        <DepositPanel
          documentId={doc.id}
          available={openDeposits}
          applied={appliedDeposits}
          netPayable={Number(doc.net_payable || 0)}
          canEdit={can(ctx, 'documents', 'edit')}
          locale={locale}
          labels={{
            title: d.ui.deposit.title, applied: d.ui.deposit.applied,
            available: d.ui.deposit.available, remaining: d.ui.deposit.remaining,
            apply: d.ui.deposit.apply, remove: d.ui.deposit.remove,
            netPayable: d.ui.deposit.netPayable, hint: d.ui.deposit.hint,
          }}
        />
      )}

      {doc && (
        <AttachmentPanel
          documentId={doc.id}
          rows={attachments}
          canEdit={can(ctx, 'documents', 'edit')}
          canDelete={can(ctx, 'documents', 'delete')}
          label={d.doc.attachments}
        />
      )}
    </>
  );
}
