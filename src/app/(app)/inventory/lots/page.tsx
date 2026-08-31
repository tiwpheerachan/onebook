import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card, CardHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { SearchBox } from '@/components/forms/search-box';
import { LotReceive, LotIssue, LotTrace, type LotRow } from '@/components/forms/lot-manager';
import { money, localeDate } from '@/lib/format';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

export default async function LotsPage({ searchParams }: { searchParams: { q?: string } }) {
  const ctx = await requirePermission('products.inventory', 'view');
  const d = t();
  const L = d.ui.lot;
  const locale = currentLocale();
  const canEdit = can(ctx, 'products.inventory', 'edit');

  const supabase = createClient();
  const [{ data: lots }, { data: expiring }, { data: recon }, { data: products }, { data: warehouses }] =
    await Promise.all([
      supabase.rpc('rpt_lot_balance', { p_company: ctx.company.id, p_product: null, p_q: searchParams.q || null }),
      supabase.rpc('rpt_lots_expiring', { p_company: ctx.company.id, p_days: 90 }),
      supabase.rpc('rpt_lot_reconcile', { p_company: ctx.company.id }),
      // เฉพาะสินค้าที่ตั้งให้ตามรอย ตัวอื่นรับเข้าทะเบียนไม่ได้อยู่แล้ว
      supabase.from('products').select('id, sku, name, tracking')
        .eq('company_id', ctx.company.id).eq('is_active', true).neq('tracking', 'none').order('sku'),
      supabase.from('warehouses').select('id, name')
        .eq('company_id', ctx.company.id).eq('is_active', true).order('name'),
    ]);

  const rows = (lots || []) as LotRow[];
  const soon = (expiring || []) as any[];
  const diffs = (recon || []) as any[];

  // ดึงประวัติทุกล็อตพร้อมกันรอบเดียว ดีกว่ายิงรายแถวตอนกดดู
  const traces = new Map<string, any>();
  await Promise.all(rows.slice(0, 200).map(async (r) => {
    const { data } = await supabase.rpc('rpt_lot_trace', { p_company: ctx.company.id, p_lot: r.id });
    traces.set(r.id, data);
  }));

  const trackLabel: Record<string, string> = {
    none: L.trackNone, lot: L.trackLot, serial: L.trackSerial,
  };

  return (
    <>
      <PageHeader
        title={L.title}
        subtitle={`${ctx.company.name_th} · ${L.subtitle}`}
        action={
          <>
            <SearchBox placeholder={d.common.search} defaultValue={searchParams.q} />
            <LotReceive
              d={d}
              canEdit={canEdit}
              products={(products || []).map((p: any) => ({
                id: p.id, label: `${p.sku} · ${p.name}`, tracking: p.tracking,
              }))}
              warehouses={(warehouses || []).map((w: any) => ({ id: w.id, label: w.name }))}
            />
          </>
        }
      />

      {soon.length > 0 && (
        <Card className="mb-5">
          <CardHeader title={L.expiringTitle} description={L.expiringSubtitle} />
          <Table>
            <THead>
              <TR>
                <TH>{L.lotNo}</TH><TH>{L.product}</TH><TH>{L.warehouse}</TH>
                <TH>{L.expiryDate}</TH><TH align="right">{L.remaining}</TH><TH>{d.common.status}</TH>
              </TR>
            </THead>
            <TBody>
              {soon.map((x) => (
                <TR key={x.id}>
                  <TD className="font-mono text-xs">{x.lot_no}</TD>
                  <TD><span className="block truncate max-w-[16rem]">{x.sku} · {x.product_name}</span></TD>
                  <TD className="text-ink-600">{x.warehouse || '—'}</TD>
                  <TD className="whitespace-nowrap">{localeDate(x.expiry_date, locale)}</TD>
                  <TD align="right">{money(x.qty_remaining, 4)}</TD>
                  <TD>
                    {Number(x.days_left) < 0
                      ? <Badge tone="danger">{L.expired}</Badge>
                      : <Badge tone="warn">{L.daysLeft.replace('{n}', String(x.days_left))}</Badge>}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <Card className="mb-5">
        <Table>
          <THead>
            <TR>
              <TH>{L.lotNo}</TH>
              <TH>{L.product}</TH>
              <TH>{L.tracking}</TH>
              <TH>{L.warehouse}</TH>
              <TH>{L.expiryDate}</TH>
              <TH align="right">{L.received}</TH>
              <TH align="right">{L.issued}</TH>
              <TH align="right">{L.remaining}</TH>
              <TH align="right">{d.common.actions}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={9} label={L.empty} />}
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="font-mono text-xs">
                  {r.lot_no}
                  {r.expired && <Badge tone="danger">{L.expired}</Badge>}
                </TD>
                <TD><span className="block truncate max-w-[16rem]">{r.sku} · {r.product_name}</span></TD>
                <TD className="text-xs text-ink-500">{trackLabel[r.tracking] || r.tracking}</TD>
                <TD className="text-ink-600">{r.warehouse || '—'}</TD>
                <TD className="whitespace-nowrap text-ink-600">
                  {r.expiry_date ? localeDate(r.expiry_date, locale) : '—'}
                </TD>
                <TD align="right" className="text-ink-600">{money(r.qty_received, 4)}</TD>
                <TD align="right" className="text-ink-600">{money(r.qty_issued, 4)}</TD>
                <TD align="right" className={cn('font-medium',
                  r.qty_remaining > 0 ? 'text-ink-900' : 'text-ink-400')}>
                  {money(r.qty_remaining, 4)}
                </TD>
                <TD align="right">
                  <span className="inline-flex items-center gap-1">
                    <LotTrace row={r} trace={traces.get(r.id)} d={d} />
                    <LotIssue row={r} d={d} canEdit={canEdit} />
                  </span>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      {diffs.length > 0 && (
        <Card>
          <CardHeader title={L.reconcileTitle} description={L.reconcileSubtitle} />
          <Table>
            <THead>
              <TR>
                <TH>{L.product}</TH><TH>{L.tracking}</TH>
                <TH align="right">{L.stockQty}</TH><TH align="right">{L.lotQty}</TH>
                <TH align="right">{L.diff}</TH>
              </TR>
            </THead>
            <TBody>
              {diffs.map((x) => (
                <TR key={x.product_id}>
                  <TD><span className="block truncate max-w-[18rem]">{x.sku} · {x.product_name}</span></TD>
                  <TD className="text-xs text-ink-500">{trackLabel[x.tracking] || x.tracking}</TD>
                  <TD align="right">{money(x.stock_qty, 4)}</TD>
                  <TD align="right">{money(x.lot_qty, 4)}</TD>
                  <TD align="right" className="font-medium text-amber-700">{money(x.diff, 4)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
