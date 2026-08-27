import Link from 'next/link';
import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { NewLandedCost } from '@/components/forms/landed-cost-panel';
import { localeDate } from '@/lib/format';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

const TONE: Record<string, string> = {
  draft: 'bg-amber-50 text-amber-700 ring-amber-200',
  confirmed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cancelled: 'bg-ink-100 text-ink-500 ring-ink-200',
};

export default async function LandedCostsPage() {
  const ctx = await requirePermission('products.inventory', 'view');
  const d = t();
  const L = d.ui.landed;
  const locale = currentLocale();
  const supabase = createClient();

  const [{ data: rows }, { data: docs }] = await Promise.all([
    supabase.from('landed_costs')
      .select('*, documents(doc_number, kind)')
      .eq('company_id', ctx.company.id)
      .order('doc_date', { ascending: false }).limit(100),
    // เอกสารที่รับของเข้าคลัง เป็นตัวเลือกให้ผูกต้นทุนแฝง
    supabase.from('documents')
      .select('id, doc_number, kind, doc_date')
      .eq('company_id', ctx.company.id)
      .in('kind', ['goods_receipt', 'bill'])
      .neq('status', 'void')
      .order('doc_date', { ascending: false }).limit(200),
  ]);

  const list = (rows || []) as any[];
  const st: Record<string, string> = { draft: L.stDraft, confirmed: L.stConfirmed, cancelled: L.stCancelled };
  const mt: Record<string, string> = { value: L.mValue, qty: L.mQty, weight: L.mWeight };

  return (
    <>
      <PageHeader
        title={L.title}
        subtitle={`${ctx.company.name_th} · ${L.subtitle}`}
        action={
          <NewLandedCost
            documents={(docs || []).map((x: any) => ({
              id: x.id, label: `${x.doc_number} · ${x.doc_date}`,
            }))}
            d={d}
            canEdit={can(ctx, 'products.inventory', 'edit')}
          />
        }
      />

      <div className="card overflow-hidden">
        <Table>
          <THead>
            <TR>
              <TH>{L.number}</TH>
              <TH>{L.date}</TH>
              <TH>{L.sourceDoc}</TH>
              <TH>{L.method}</TH>
              <TH>{L.status}</TH>
            </TR>
          </THead>
          <TBody>
            {list.length === 0 && <EmptyRow colSpan={5} label={L.empty} />}
            {list.map((r) => (
              <TR key={r.id}>
                <TD>
                  <Link href={`/inventory/landed-costs/${r.id}`} className="font-mono text-xs text-brand-700 hover:underline">
                    {r.doc_number}
                  </Link>
                </TD>
                <TD className="whitespace-nowrap text-ink-600">{localeDate(r.doc_date, locale)}</TD>
                <TD className="font-mono text-xs text-ink-600">{r.documents?.doc_number || '—'}</TD>
                <TD className="text-ink-600">{mt[r.method] || r.method}</TD>
                <TD><span className={cn('chip', TONE[r.status])}>{st[r.status] || r.status}</span></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </>
  );
}
