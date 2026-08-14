import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';
import { PageHeader, Card, CardHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { EtaxActions } from '@/components/forms/etax-actions';
import { isEtaxConfigured } from '@/lib/etax-provider';
import { money, firstDayOfMonth, lastDayOfMonth } from '@/lib/format';
import { AlertTriangle } from 'lucide-react';

export const dynamic = 'force-dynamic';

const STATUS_STYLE: Record<string, string> = {
  none: 'bg-ink-100 text-ink-500 ring-ink-200',
  draft: 'bg-ink-100 text-ink-700 ring-ink-200',
  signed: 'bg-sky-50 text-sky-700 ring-sky-200',
  submitted: 'bg-amber-50 text-amber-700 ring-amber-200',
  accepted: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
  cancelled: 'bg-ink-100 text-ink-400 ring-ink-200',
};

const ETAX_KINDS = ['tax_invoice', 'invoice', 'receipt', 'credit_note', 'debit_note'];

export default async function EtaxPage({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  const ctx = await requirePermission('tax.etax', 'view');
  const d = t();
  const supabase = createClient();
  const from = searchParams.from || firstDayOfMonth();
  const to = searchParams.to || lastDayOfMonth();

  const [{ data: docs }, { data: etax }] = await Promise.all([
    supabase
      .from('documents')
      .select('id, kind, doc_number, doc_date, grand_total, status, contact_snapshot')
      .eq('company_id', ctx.company.id)
      .in('kind', ETAX_KINDS)
      .neq('status', 'draft')
      .gte('doc_date', from)
      .lte('doc_date', to)
      .order('doc_date', { ascending: false })
      .limit(300),
    supabase
      .from('etax_documents')
      .select('id, document_id, status, provider_ref, error_message, submitted_at')
      .eq('company_id', ctx.company.id),
  ]);

  const rows = (docs || []) as any[];
  const byDoc = new Map((etax || []).map((e: any) => [e.document_id, e]));
  const configured = isEtaxConfigured();
  const editable = can(ctx, 'tax.etax', 'create');

  const labels = {
    prepare: d.etax.prepare, submit: d.etax.submit, download: d.etax.download,
    preparing: d.common.loading, viewXml: d.etax.viewXml, close: d.common.close,
  };

  return (
    <>
      <PageHeader
        title={d.nav.etax}
        subtitle={`${ctx.company.name_th} · ${from} – ${to}`}
        action={
          <form className="flex items-center gap-2">
            <input type="date" name="from" defaultValue={from} className="input h-9 w-40 py-1.5 text-sm" />
            <input type="date" name="to" defaultValue={to} className="input h-9 w-40 py-1.5 text-sm" />
            <button className="btn-secondary" type="submit">{d.common.filter}</button>
          </form>
        }
      />

      {!configured && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
          <div>
            <p className="font-medium">{d.etax.notConfigured}</p>
            <p className="mt-1 text-xs leading-relaxed">{d.etax.notConfiguredHint}</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader title={d.etax.title} description={d.etax.hint} />
        <Table>
          <THead>
            <TR>
              <TH>{d.common.date}</TH>
              <TH>{d.doc.number}</TH>
              <TH>{d.doc.contact}</TH>
              <TH className="num">{d.doc.grandTotal}</TH>
              <TH>{d.etax.etaxStatus}</TH>
              <TH>{d.etax.providerRef}</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={7} label={d.common.noData} />}
            {rows.map((r) => {
              const e = byDoc.get(r.id);
              const st = e?.status || 'none';
              return (
                <TR key={r.id}>
                  <TD className="whitespace-nowrap">{r.doc_date}</TD>
                  <TD className="font-mono text-xxs">{r.doc_number}</TD>
                  <TD className="max-w-[16rem] truncate">{(r.contact_snapshot as any)?.name || '—'}</TD>
                  <TD className="num">{money(r.grand_total)}</TD>
                  <TD>
                    <span className={`chip ${STATUS_STYLE[st]}`}>{d.etax.status[st as 'draft']}</span>
                    {e?.error_message && (
                      <span className="mt-1 block max-w-[18rem] truncate text-xxs text-rose-600" title={e.error_message}>
                        {e.error_message}
                      </span>
                    )}
                  </TD>
                  <TD className="font-mono text-xxs text-ink-500">{e?.provider_ref || '—'}</TD>
                  <TD>
                    {editable && (
                      <EtaxActions
                        documentId={r.id}
                        docNumber={r.doc_number}
                        etaxId={e?.id}
                        status={st}
                        configured={configured}
                        labels={labels}
                      />
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
