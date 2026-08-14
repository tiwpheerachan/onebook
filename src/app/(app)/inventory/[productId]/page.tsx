import { notFound } from 'next/navigation';
import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';
import { PageHeader, Card, CardHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { ExportCsvButton } from '@/components/ui/export-csv';
import { money, firstDayOfYear, lastDayOfMonth } from '@/lib/format';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = {
  receive: 'รับเข้า',
  issue: 'ตัดออก',
  adjust: 'ปรับปรุง',
};

export default async function StockCardPage({
  params, searchParams,
}: {
  params: { productId: string };
  searchParams: { from?: string; to?: string };
}) {
  const ctx = await requirePermission('products.inventory', 'view');
  const d = t();
  const supabase = createClient();
  const from = searchParams.from || firstDayOfYear();
  const to = searchParams.to || lastDayOfMonth();

  const [{ data: product }, { data: moves }] = await Promise.all([
    supabase
      .from('products')
      .select('id, sku, name, unit')
      .eq('id', params.productId)
      .eq('company_id', ctx.company.id)
      .maybeSingle(),
    supabase.rpc('rpt_stock_card', {
      p_company: ctx.company.id,
      p_product: params.productId,
      p_from: from,
      p_to: to,
    }),
  ]);

  if (!product) notFound();
  const rows = (moves || []) as any[];
  const last = rows[rows.length - 1];

  return (
    <>
      <PageHeader
        title={`${d.inv.stockCard} · ${product.sku}`}
        subtitle={`${product.name} · ${from} – ${to}`}
        breadcrumb={[{ label: d.nav.inventory, href: '/inventory' }, { label: product.sku }]}
        action={
          can(ctx, 'products.inventory', 'export') && (
            <ExportCsvButton
              label={d.common.export}
              filename={`stock-card-${product.sku}.csv`}
              rows={[
                [d.common.date, d.inv.moveKind, d.inv.docNumber, d.common.notes, d.inv.qtyIn, d.inv.qtyOut, d.inv.unitCost, d.inv.qtyOnHand],
                ...rows.map((r) => [r.move_date, r.kind, r.doc_number || '', r.note || '', r.qty_in, r.qty_out, r.unit_cost, r.running_qty]),
              ]}
            />
          )
        }
      />

      <Card>
        <CardHeader
          title={d.inv.stockCard}
          description={d.inv.fifoNote}
          right={
            last ? (
              <span className="text-sm">
                <span className="text-ink-500">{d.inv.qtyOnHand}: </span>
                <span className={`font-semibold tabular-nums ${Number(last.running_qty) < 0 ? 'text-rose-600' : 'text-ink-900'}`}>
                  {money(last.running_qty)} {product.unit}
                </span>
              </span>
            ) : undefined
          }
        />
        <Table>
          <THead>
            <TR>
              <TH>{d.common.date}</TH>
              <TH>{d.inv.moveKind}</TH>
              <TH>{d.inv.docNumber}</TH>
              <TH>{d.common.notes}</TH>
              <TH className="num">{d.inv.qtyIn}</TH>
              <TH className="num">{d.inv.qtyOut}</TH>
              <TH className="num">{d.inv.unitCost}</TH>
              <TH className="num">{d.inv.qtyOnHand}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={8} label={d.common.noData} />}
            {rows.map((r, i) => (
              <TR key={i}>
                <TD className="whitespace-nowrap">{r.move_date}</TD>
                <TD className="text-ink-600">{KIND_LABEL[r.kind] || r.kind}</TD>
                <TD className="font-mono text-xxs text-ink-500">{r.doc_number || '—'}</TD>
                <TD className="text-ink-500">{r.note || '—'}</TD>
                <TD className="num">{Number(r.qty_in) ? money(r.qty_in) : '—'}</TD>
                <TD className="num">{Number(r.qty_out) ? money(r.qty_out) : '—'}</TD>
                <TD className="num text-ink-500">{money(r.unit_cost)}</TD>
                <TD className={`num font-medium ${Number(r.running_qty) < 0 ? 'text-rose-600' : ''}`}>{money(r.running_qty)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
