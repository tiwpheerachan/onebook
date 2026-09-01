import Link from 'next/link';
import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { docTitle, isPurchase } from '@/components/documents/doc-meta';
import { SLUG_BY_KIND } from '@/lib/constants';
import { localeDate, money, currencyLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';

interface QueueRow {
  id: string; kind: string; doc_number: string; doc_date: string;
  contact_name: string | null; grand_total: number; step_no: number;
}

/** เอกสารที่รอให้ผู้ใช้คนนี้ตัดสินในขั้นถัดไป */
export default async function ApprovalsPage() {
  const ctx = await requirePermission('documents', 'approve');
  const d = t();
  const L = d.ui.approval;
  const locale = currentLocale();

  const supabase = createClient();
  const { data } = await supabase.rpc('rpt_my_approvals', { p_company: ctx.company.id });
  const rows = (data || []) as QueueRow[];

  const href = (r: QueueRow) => {
    const slug = SLUG_BY_KIND[r.kind];
    return `/${isPurchase(slug) ? 'purchase' : 'sales'}/${slug}/${r.id}`;
  };

  return (
    <>
      <PageHeader
        title={L.queueTitle}
        subtitle={`${ctx.company.name_th} · ${currencyLabel(ctx.company.base_currency, locale)}`}
      />

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>{L.docNumber}</TH>
              <TH>{L.docKind}</TH>
              <TH>{L.docDate}</TH>
              <TH>{L.contact}</TH>
              <TH align="right">{L.amount}</TH>
              <TH align="right">{L.step}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={6} label={L.queueEmpty} />}
            {rows.map((r) => (
              <TR key={r.id}>
                <TD>
                  <Link href={href(r)} className="font-mono text-xs font-medium text-brand-700 hover:underline">
                    {r.doc_number}
                  </Link>
                </TD>
                <TD className="text-xs text-ink-600">{docTitle(d, SLUG_BY_KIND[r.kind])}</TD>
                <TD>{localeDate(r.doc_date, locale)}</TD>
                <TD className="text-ink-600">
                  <span className="block max-w-[18rem] truncate">{r.contact_name || '–'}</span>
                </TD>
                <TD align="right" className="font-medium">{money(r.grand_total)}</TD>
                <TD align="right" className="num text-ink-500">{r.step_no}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
