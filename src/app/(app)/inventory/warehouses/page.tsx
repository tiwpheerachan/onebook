import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';
import { PageHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { WarehouseEditor, StockTransfer, DefaultBadge } from '@/components/forms/warehouse-manager';
import { money } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function WarehousesPage() {
  const ctx = await requirePermission('products.inventory', 'view');
  const d = t();
  const L = d.ui.warehouse;
  const canEdit = can(ctx, 'products.inventory', 'edit');
  const supabase = createClient();

  const [{ data: whs }, { data: totals }, { data: products }] = await Promise.all([
    supabase.from('warehouses').select('*').eq('company_id', ctx.company.id)
      .order('sort_order').order('code'),
    supabase.rpc('rpt_stock_by_warehouse', { p_company: ctx.company.id }),
    supabase.from('products').select('id, sku, name')
      .eq('company_id', ctx.company.id).eq('track_inventory', true).eq('is_active', true)
      .order('sku').limit(500),
  ]);

  const rows = (whs || []) as any[];
  // ยอดคงเหลือรายคลังมาจากคนละแหล่ง จับคู่ด้วย id
  const byId = new Map(((totals || []) as any[]).map((x) => [x.warehouse_id, x]));

  return (
    <>
      <PageHeader
        title={L.title}
        subtitle={`${ctx.company.name_th} · ${L.subtitle}`}
        action={
          <>
            <StockTransfer
              warehouses={rows.filter((w) => w.is_active).map((w) => ({ id: w.id, label: `${w.code} · ${w.name}` }))}
              products={(products || []).map((p: any) => ({ id: p.id, label: `${p.sku} · ${p.name}` }))}
              d={d}
              canEdit={canEdit}
            />
            <WarehouseEditor d={d} canEdit={canEdit} />
          </>
        }
      />

      <div className="card overflow-hidden">
        <Table>
          <THead>
            <TR>
              <TH>{L.code}</TH>
              <TH>{L.name}</TH>
              <TH className="text-right">{L.skuCount}</TH>
              <TH className="text-right">{L.qtyOnHand}</TH>
              <TH className="text-right">{L.stockValue}</TH>
              <TH className="text-right">{d.common.actions}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={6} label={L.empty} />}
            {rows.map((w) => {
              const s = byId.get(w.id) || {};
              return (
                <TR key={w.id}>
                  <TD><span className="font-mono text-xs">{w.code}</span></TD>
                  <TD>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-ink-800">{w.name}</span>
                      <DefaultBadge on={w.is_default} label={L.isDefault} />
                      {!w.is_active && <span className="chip bg-ink-100 text-ink-500 ring-ink-200">{L.inactive}</span>}
                    </span>
                    {w.address && <span className="block truncate text-xxs text-ink-400">{w.address}</span>}
                  </TD>
                  <TD className="text-right tabular-nums text-ink-600">{s.sku_count ?? 0}</TD>
                  <TD className="text-right tabular-nums text-ink-600">{Number(s.qty_on_hand ?? 0).toLocaleString()}</TD>
                  <TD className="text-right tabular-nums font-medium text-ink-900">{money(s.stock_value ?? 0)}</TD>
                  <TD className="text-right">
                    <WarehouseEditor row={w} d={d} canEdit={canEdit} />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </div>
    </>
  );
}
