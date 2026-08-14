import Link from 'next/link';
import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';
import { PageHeader, Card, CardHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { StatCard } from '@/components/ui/stat-card';
import { ExportCsvButton } from '@/components/ui/export-csv';
import { StockAdjust } from '@/components/forms/stock-adjust';
import { money } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function InventoryPage({ searchParams }: { searchParams: { as_of?: string } }) {
  const ctx = await requirePermission('products.inventory', 'view');
  const d = t();
  const supabase = createClient();
  const asOf = searchParams.as_of || new Date().toISOString().slice(0, 10);

  const [{ data: stock }, { data: products }] = await Promise.all([
    supabase.rpc('rpt_stock_balance', { p_company: ctx.company.id, p_as_of: asOf }),
    supabase
      .from('products')
      .select('id, sku, name')
      .eq('company_id', ctx.company.id)
      .eq('track_inventory', true)
      .eq('is_active', true)
      .order('sku')
      .limit(500),
  ]);

  const rows = (stock || []) as any[];
  const totalValue = rows.reduce((s, r) => s + Number(r.stock_value || 0), 0);
  const negative = rows.filter((r) => Number(r.qty_on_hand) < 0).length;

  const labels = {
    adjust: d.inv.adjust, cancel: d.common.cancel, save: d.common.save,
    product: d.nav.products, date: d.common.date, qtyDelta: d.inv.qtyDelta,
    unitCost: d.inv.unitCost, unitCostHint: d.inv.unitCostHint, note: d.common.notes,
    adjustHint: d.inv.adjustHint,
  };

  return (
    <>
      <PageHeader
        title={d.nav.inventory}
        subtitle={`${ctx.company.name_th} · ${d.inv.asOf} ${asOf}`}
        action={
          <>
            {can(ctx, 'products.inventory', 'export') && (
              <ExportCsvButton
                label={d.common.export}
                filename="stock-balance.csv"
                rows={[
                  ['SKU', d.inv.productName, d.doc.unit, d.inv.qtyOnHand, d.inv.stockValue, d.inv.avgCost],
                  ...rows.map((r) => [r.sku, r.product_name, r.unit, r.qty_on_hand, r.stock_value, r.avg_unit_cost]),
                ]}
              />
            )}
            {can(ctx, 'products.inventory', 'edit') && (
              <StockAdjust products={(products || []).map((p: any) => ({ id: p.id, label: `${p.sku} · ${p.name}` }))} labels={labels} />
            )}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={d.inv.stockValue} value={totalValue} suffix={d.common.baht} tone="brand" />
        <StatCard label={d.inv.skuCount} value={rows.length} isCurrency={false} />
        <StatCard label={d.inv.negativeStock} value={negative} isCurrency={false} tone={negative > 0 ? 'negative' : undefined} />
      </div>

      <Card>
        <CardHeader title={d.inv.stockBalance} description={d.inv.fifoNote} />
        <Table>
          <THead>
            <TR>
              <TH>SKU</TH>
              <TH>{d.inv.productName}</TH>
              <TH>{d.doc.unit}</TH>
              <TH className="num">{d.inv.qtyIn}</TH>
              <TH className="num">{d.inv.qtyOut}</TH>
              <TH className="num">{d.inv.qtyOnHand}</TH>
              <TH className="num">{d.inv.avgCost}</TH>
              <TH className="num">{d.inv.stockValue}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={8} label={d.common.noData} />}
            {rows.map((r) => (
              <TR key={r.product_id}>
                <TD className="font-mono text-xxs">
                  <Link href={`/inventory/${r.product_id}`} className="text-brand-700 hover:underline">{r.sku}</Link>
                </TD>
                <TD>{r.product_name}</TD>
                <TD className="text-ink-500">{r.unit}</TD>
                <TD className="num text-ink-500">{money(r.qty_in)}</TD>
                <TD className="num text-ink-500">{money(r.qty_out)}</TD>
                <TD className={`num font-medium ${Number(r.qty_on_hand) < 0 ? 'text-rose-600' : ''}`}>{money(r.qty_on_hand)}</TD>
                <TD className="num text-ink-500">{money(r.avg_unit_cost)}</TD>
                <TD className="num font-medium">{money(r.stock_value)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
