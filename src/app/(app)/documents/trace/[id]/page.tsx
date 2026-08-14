import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';
import { PageHeader } from '@/components/ui/page-header';
import { DocumentTrace, type Trace } from '@/components/documents/document-trace';
import { docTitle } from '@/components/documents/doc-meta';
import { SLUG_BY_KIND } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/** หน้าสืบที่มาของเอกสาร : ใบนี้มาจากไหน ลงบัญชีเป็นอะไร เงินไปไหน */
export default async function TracePage({ params }: { params: { id: string } }) {
  await requirePermission('documents', 'view');
  const d = t();
  const supabase = createClient();

  const { data, error } = await supabase.rpc('rpt_document_trace', { p_document: params.id });
  if (error || !data) notFound();

  const trace = data as Trace;
  const doc = trace.document;
  const label = docTitle(d, SLUG_BY_KIND[doc.kind] || '');

  return (
    <>
      <PageHeader
        title={`ที่มาของ ${label} ${doc.doc_number}`}
        subtitle={`${doc.contact_name || '–'} · ทุกตัวเลขในหน้านี้อ้างอิงจากรายการจริงในฐานข้อมูล ไม่ได้คำนวณซ้ำ`}
        breadcrumb={[{ label: d.nav.dashboard }, { label: 'ที่มาของตัวเลข' }]}
      />
      <DocumentTrace trace={trace} dict={d} />
    </>
  );
}
