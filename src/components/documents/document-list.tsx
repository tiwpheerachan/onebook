import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/badge';
import { SearchBox } from '@/components/forms/search-box';
import { ExportCsvButton } from '@/components/ui/export-csv';
import { localeDate, money } from '@/lib/format';
import { KIND_SLUG } from '@/lib/constants';
import { docTitle, isPurchase } from './doc-meta';

export async function DocumentList({
  slug, searchParams,
}: { slug: string; searchParams: { q?: string; status?: string } }) {
  const ctx = await requirePermission('documents', 'view');
  const d = t();
  const locale = currentLocale();
  const kind = KIND_SLUG[slug];
  const section = isPurchase(slug) ? 'purchase' : 'sales';
  const supabase = createClient();

  let query = supabase
    .from('documents')
    .select('id, doc_number, doc_date, due_date, grand_total, net_payable, paid_amount, status, contacts(name)')
    .eq('company_id', ctx.company.id)
    .eq('kind', kind)
    .order('doc_date', { ascending: false })
    .limit(300);

  if (searchParams.q) query = query.ilike('doc_number', `%${searchParams.q}%`);
  if (searchParams.status) query = query.eq('status', searchParams.status);

  const { data, error } = await query;
  const rows = (data || []) as any[];

  const csv = [
    ['เลขที่', 'วันที่', 'ผู้ติดต่อ', 'ยอดรวม', 'คงค้าง', 'สถานะ'],
    ...rows.map((r) => [
      r.doc_number, r.doc_date, r.contacts?.name || '',
      r.grand_total, Number(r.net_payable) - Number(r.paid_amount), r.status,
    ]),
  ];

  return (
    <>
      <PageHeader
        title={docTitle(d, slug)}
        subtitle={ctx.company.name_th}
        breadcrumb={[{ label: section === 'sales' ? d.nav.sales : d.nav.purchase }, { label: docTitle(d, slug) }]}
        action={
          <>
            <SearchBox placeholder={d.common.search + ' ' + d.doc.number} defaultValue={searchParams.q} />
            {can(ctx, 'documents', 'export') && (
              <ExportCsvButton rows={csv} filename={`${slug}.csv`} label={d.common.export} />
            )}
            {can(ctx, 'documents', 'create') && (
              <Link href={`/${section}/${slug}/new`} className="btn-primary">
                <Plus className="h-4 w-4" /> {d.common.create}
              </Link>
            )}
          </>
        }
      />

      {error && (
        <div className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {error.message}
        </div>
      )}

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>{d.doc.number}</TH>
              <TH>{d.doc.docDate}</TH>
              <TH>{d.doc.dueDate}</TH>
              <TH>{d.doc.contact}</TH>
              <TH align="right">{d.doc.grandTotal}</TH>
              <TH align="right">คงค้าง</TH>
              <TH>{d.common.status}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={7} label={d.common.noData} />}
            {rows.map((r) => (
              <TR key={r.id}>
                <TD>
                  <Link href={`/${section}/${slug}/${r.id}`} className="font-medium text-brand-700 hover:underline">
                    {r.doc_number}
                  </Link>
                </TD>
                <TD>{localeDate(r.doc_date, locale)}</TD>
                <TD>{r.due_date ? localeDate(r.due_date, locale) : '–'}</TD>
                <TD className="max-w-[18rem] truncate">{r.contacts?.name || '–'}</TD>
                <TD align="right">{money(r.grand_total)}</TD>
                <TD align="right">{money(Number(r.net_payable) - Number(r.paid_amount))}</TD>
                <TD><StatusBadge status={r.status} label={(d.status as any)[r.status]} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
