import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';
import { PageHeader } from '@/components/ui/page-header';
import { DocumentTrace, type Trace } from '@/components/documents/document-trace';
import { TraceTabs } from '@/components/documents/trace-tabs';
import { docTitle } from '@/components/documents/doc-meta';
import { SLUG_BY_KIND } from '@/lib/constants';
import type { GraphInput } from '@/lib/trace-graph';

export const dynamic = 'force-dynamic';

/** หน้าสืบที่มาของเอกสาร : ใบนี้มาจากไหน ลงบัญชีเป็นอะไร เงินไปไหน */
export default async function TracePage({ params }: { params: { id: string } }) {
  await requirePermission('documents', 'view');
  const d = t();
  const supabase = createClient();

  // ยิงพร้อมกัน สองฟังก์ชันนี้ไม่ขึ้นต่อกัน
  const [{ data, error }, { data: graphData }] = await Promise.all([
    supabase.rpc('rpt_document_trace', { p_document: params.id }),
    supabase.rpc('rpt_document_graph', { p_document: params.id }),
  ]);
  if (error || !data) notFound();

  const trace = data as Trace;
  const graph = (graphData || { root: params.id, nodes: [], edges: [], truncated: false }) as GraphInput;
  const doc = trace.document;
  const label = docTitle(d, SLUG_BY_KIND[doc.kind] || '');

  return (
    <>
      <PageHeader
        title={`${d.ui.graph.title} · ${label} ${doc.doc_number}`}
        subtitle={`${doc.contact_name || '–'} · ${d.ui.graph.subtitle}`}
        breadcrumb={[{ label: d.nav.dashboard }, { label: d.ui.graph.title }]}
      />
      <TraceTabs graph={graph} d={d} list={<DocumentTrace trace={trace} dict={d} />} />
    </>
  );
}
