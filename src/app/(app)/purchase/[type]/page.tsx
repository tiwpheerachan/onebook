import { notFound } from 'next/navigation';
import { DocumentList } from '@/components/documents/document-list';
import { OaImportButton } from '@/components/documents/oa-import-button';
import { KIND_SLUG } from '@/lib/constants';
import { isPurchase } from '@/components/documents/doc-meta';
import { requirePermission, can } from '@/lib/session';
import { t } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export default async function PurchaseListPage({
  params, searchParams,
}: { params: { type: string }; searchParams: any }) {
  if (!KIND_SLUG[params.type] || !isPurchase(params.type)) notFound();

  // เฉพาะหน้าใบขอซื้อ: ปุ่มนำเข้าจาก OA (คนที่มีสิทธิ์สร้างเอกสารเท่านั้น)
  let importBtn = null;
  if (params.type === 'purchase-requests') {
    const ctx = await requirePermission('documents', 'view');
    if (can(ctx, 'documents', 'create')) {
      const d = t();
      importBtn = (
        <OaImportButton
          labels={{ importBtn: d.ui.oaImport.importBtn, done: d.ui.oaImport.done, failed: d.ui.oaImport.failed }}
        />
      );
    }
  }

  return (
    <>
      {importBtn && <div className="mb-3 flex justify-end">{importBtn}</div>}
      <DocumentList slug={params.type} searchParams={searchParams} />
    </>
  );
}
