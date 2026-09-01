import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { SearchBox } from '@/components/forms/search-box';
import { ProductManager } from '@/components/forms/product-manager';
import { ExportCsvButton } from '@/components/ui/export-csv';
import { money } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ProductsPage({ searchParams }: { searchParams: { q?: string } }) {
  const ctx = await requirePermission('products', 'view');
  const d = t();
  const M = d.ui.misc;
  const supabase = createClient();

  // อ่านผ่าน view ที่ปิดคอลัมน์ตามสิทธิ์ ไม่ใช่ตารางตรง
  let q = supabase.from('products_masked').select('*').eq('company_id', ctx.company.id).order('sku').limit(500);
  if (searchParams.q) q = q.or(`name.ilike.%${searchParams.q}%,sku.ilike.%${searchParams.q}%`);
  const { data } = await q;
  const rows = (data || []) as any[];

  const { data: accounts } = await supabase
    .from('accounts').select('id, code, name_th')
    .eq('company_id', ctx.company.id).eq('is_header', false).order('code').limit(500);
  const accOptions = (accounts || []).map((a: any) => ({ id: a.id, label: `${a.code} ${a.name_th}` }));

  const showCost = can(ctx, 'products', 'edit') || can(ctx, 'report', 'view');
  const labels = {
    create: d.common.create, edit: d.common.edit, save: d.common.save,
    cancel: d.common.cancel, required: d.common.required,
    tracking: d.ui.lot.tracking, trackNone: d.ui.lot.trackNone,
    trackLot: d.ui.lot.trackLot, trackSerial: d.ui.lot.trackSerial,
    ...d.ui.master,
  };

  return (
    <>
      <PageHeader
        title={d.nav.products}
        subtitle={ctx.company.name_th}
        action={
          <>
            <SearchBox placeholder={d.common.search} defaultValue={searchParams.q} />
            {can(ctx, 'products', 'export') && (
              <ExportCsvButton label={d.common.export} filename="products.csv"
                rows={[[M.productCode, M.productName, M.productKind, M.unit, M.salePrice], ...rows.map((r) => [r.sku, r.name, r.kind, r.unit, r.sale_price])]} />
            )}
            <ProductManager canCreate={can(ctx, 'products', 'create')} canEdit={can(ctx, 'products', 'edit')} accounts={accOptions} labels={labels} />
          </>
        }
      />
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>{M.productCode}</TH><TH>{M.productName}</TH><TH>{M.productKind}</TH><TH>{M.unit}</TH>
              <TH align="right">{M.salePrice}</TH>{showCost && <TH align="right">{M.purchasePrice}</TH>}<TH>{M.tax}</TH><TH />
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={showCost ? 8 : 7} label={d.common.noData} />}
            {rows.map((r) => (
              <TR key={r.id}>
                <TD><span className="font-mono text-xs">{r.sku}</span></TD>
                <TD className="font-medium text-ink-900"><span className="block truncate max-w-[22rem]">{r.name}</span></TD>
                <TD><Badge tone={r.kind === 'service' ? 'brand' : 'neutral'}>{r.kind === 'good' ? M.kindGood : r.kind === 'service' ? M.kindService : M.kindAsset}</Badge></TD>
                <TD>{r.unit}</TD>
                <TD align="right">{money(r.sale_price)}</TD>
                {showCost && <TD align="right">{money(r.purchase_price)}</TD>}
                <TD className="text-xs text-ink-500">{r.vat_treatment}</TD>
                <TD><ProductManager canCreate={false} canEdit={can(ctx, 'products', 'edit')} editRow={r} accounts={accOptions} labels={labels} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
