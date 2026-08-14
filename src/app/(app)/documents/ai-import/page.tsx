import Link from 'next/link';
import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';
import { PageHeader, Card, CardHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { AiUpload, AiJobActions } from '@/components/forms/ai-import';
import { isAicomConfigured } from '@/lib/aicom';
import { money } from '@/lib/format';
import { AlertTriangle } from 'lucide-react';

export const dynamic = 'force-dynamic';

const STATUS_STYLE: Record<string, string> = {
  queued: 'bg-ink-100 text-ink-600 ring-ink-200',
  processing: 'bg-sky-50 text-sky-700 ring-sky-200',
  review: 'bg-amber-50 text-amber-700 ring-amber-200',
  imported: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  failed: 'bg-rose-50 text-rose-700 ring-rose-200',
  discarded: 'bg-ink-100 text-ink-400 ring-ink-200',
};

export default async function AiImportPage() {
  const ctx = await requirePermission('documents.ai_import', 'view');
  const d = t();
  const supabase = createClient();

  const { data } = await supabase
    .from('ai_import_jobs')
    .select('id, file_name, status, detected_kind, confidence, mapped, document_id, error_message, created_at')
    .eq('company_id', ctx.company.id)
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = (data || []) as any[];
  const configured = isAicomConfigured();
  const editable = can(ctx, 'documents.ai_import', 'create');

  const labels = {
    upload: d.ai.upload, uploading: d.common.loading, file: d.ai.file, fileHint: d.ai.fileHint,
    close: d.common.close, create: d.ai.createDoc, discard: d.ai.discard, view: d.common.edit,
  };

  return (
    <>
      <PageHeader
        title={d.nav.aiImport}
        subtitle={ctx.company.name_th}
        action={editable && <AiUpload configured={configured} labels={labels} />}
      />

      {!configured && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
          <div>
            <p className="font-medium">{d.ai.notConfigured}</p>
            <p className="mt-1 text-xs leading-relaxed">{d.ai.notConfiguredHint}</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader title={d.ai.jobs} description={d.ai.jobsHint} />
        <Table>
          <THead>
            <TR>
              <TH>{d.ai.fileName}</TH>
              <TH>{d.ai.detected}</TH>
              <TH className="num">{d.ai.confidence}</TH>
              <TH>{d.doc.number}</TH>
              <TH className="num">{d.doc.grandTotal}</TH>
              <TH>{d.common.status}</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={7} label={d.common.noData} />}
            {rows.map((r) => {
              const m = (r.mapped || {}) as any;
              return (
                <TR key={r.id}>
                  <TD className="max-w-[18rem] truncate">{r.file_name}</TD>
                  <TD className="text-ink-600">{r.detected_kind || '—'}</TD>
                  <TD className="num text-ink-500">{r.confidence != null ? `${Number(r.confidence).toFixed(0)}%` : '—'}</TD>
                  <TD className="font-mono text-xxs">{m.doc_number || '—'}</TD>
                  <TD className="num">{m.grand_total ? money(m.grand_total) : '—'}</TD>
                  <TD>
                    <span className={`chip ${STATUS_STYLE[r.status]}`}>{d.ai.status[r.status as 'queued']}</span>
                    {r.error_message && (
                      <span className="mt-1 block max-w-[20rem] truncate text-xxs text-rose-600" title={r.error_message}>
                        {r.error_message}
                      </span>
                    )}
                  </TD>
                  <TD>
                    {r.document_id ? (
                      <Link href="/purchase/expenses" className="text-xxs text-brand-700 underline underline-offset-2">
                        {d.ai.openDoc}
                      </Link>
                    ) : (
                      editable && r.status === 'review' && <AiJobActions jobId={r.id} mapped={m} labels={labels} />
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
