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
import { AttachmentPanel } from './attachment-panel';
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

  const [{ data: contacts }, { data: products }, { data: accounts }] = await Promise.all([
    supabase.from('contacts').select('id, name, tax_id')
      .eq('company_id', ctx.company.id).eq('is_active', true).order('name').limit(1000),
    supabase.from('products_masked').select('id, name, sku, sale_price, purchase_price, unit')
      .eq('company_id', ctx.company.id).eq('is_active', true).order('sku').limit(1000),
    supabase.from('accounts').select('id, code, name_th')
      .eq('company_id', ctx.company.id).eq('is_active', true).eq('is_header', false).order('code').limit(500),
  ]);

  let doc: any = null;
  let lines: any[] = [];
  let attachments: any[] = [];
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
        labels={{
          contact: d.doc.contact, docDate: d.doc.docDate, dueDate: d.doc.dueDate,
          reference: d.doc.reference, notes: d.common.notes, product: d.doc.product,
          description: d.doc.description, quantity: d.doc.quantity, unit: d.doc.unit,
          unitPrice: d.doc.unitPrice, discount: d.doc.discount, vatType: d.doc.vatType,
          whtType: d.doc.whtType, subtotal: d.doc.subtotal, vatBase: d.doc.vatBase,
          vat: d.doc.vat, wht: d.doc.wht, grandTotal: d.doc.grandTotal, netPayable: d.doc.netPayable,
          addLine: d.doc.addLine, account: d.doc.account,
          exclusive: d.doc.exclusive, inclusive: d.doc.inclusive, zeroRated: d.doc.zeroRated,
          exempt: d.doc.exempt, none: d.doc.none,
          save: d.common.save, approve: d.common.approve, void: d.common.void,
          saveAndApprove: `${d.common.save} + ${d.common.approve}`,
          select: d.common.search, freeText: d.doc.description, auto: 'อัตโนมัติ',
          amountInWords: 'จำนวนเงินเป็นตัวอักษร',
          frozen: d.security.frozen,
          voidReason: d.security.reason,
        }}
      />

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
