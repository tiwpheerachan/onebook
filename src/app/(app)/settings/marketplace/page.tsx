import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';
import { PageHeader, Card, CardHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { MarketplaceManager, SettlementImport, SettlementPost } from '@/components/forms/marketplace';
import { money } from '@/lib/format';
import { Info } from 'lucide-react';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = {
  shopee: 'Shopee',
  lazada: 'Lazada',
  tiktok: 'TikTok Shop',
  line_myshop: 'LINE MyShop',
  woocommerce: 'WooCommerce',
  other: 'อื่น ๆ',
};

export default async function MarketplacePage() {
  const ctx = await requirePermission('settings.marketplace', 'view');
  const d = t();
  const supabase = createClient();

  const [{ data: accounts }, { data: settlements }, { data: channels }, { data: acc }] = await Promise.all([
    supabase
      .from('marketplace_accounts')
      .select('id, kind, shop_name, shop_ref, channel_id, income_account_id, fee_account_id, last_sync_at, is_active')
      .eq('company_id', ctx.company.id)
      .order('kind'),
    supabase
      .from('marketplace_settlements')
      .select('id, account_id, settlement_ref, period_from, period_to, paid_date, gross_amount, fee_amount, adjustment, net_amount, order_count, journal_entry_id')
      .eq('company_id', ctx.company.id)
      .order('paid_date', { ascending: false })
      .limit(100),
    supabase
      .from('financial_channels')
      .select('id, code, name')
      .eq('company_id', ctx.company.id)
      .eq('is_active', true)
      .order('code'),
    supabase
      .from('accounts')
      .select('id, code, name_th')
      .eq('company_id', ctx.company.id)
      .eq('is_header', false)
      .order('code')
      .limit(500),
  ]);

  const shops = (accounts || []) as any[];
  const rows = (settlements || []) as any[];
  const byId = new Map(shops.map((s) => [s.id, s]));
  const editable = can(ctx, 'settings.marketplace', 'edit');
  const canPost = can(ctx, 'documents', 'approve');

  const options = {
    channels: (channels || []).map((c: any) => ({ id: c.id, label: `${c.code} · ${c.name}` })),
    accounts: (acc || []).map((a: any) => ({ id: a.id, label: `${a.code} ${a.name_th}` })),
    shops: shops.map((s) => ({ id: s.id, label: `${KIND_LABEL[s.kind]} · ${s.shop_name}` })),
  };

  const labels = {
    create: d.mp.addShop, edit: d.common.edit, save: d.common.save, cancel: d.common.cancel,
    shopName: d.mp.shopName, shopRef: d.mp.shopRef, platform: d.mp.platform,
    channel: d.nav.channels, incomeAccount: d.mp.incomeAccount, feeAccount: d.mp.feeAccount,
    auto: d.assets.auto, importSettlement: d.mp.importSettlement, close: d.common.close,
    shop: d.mp.shop, settlementRef: d.mp.settlementRef, periodFrom: d.common.from, periodTo: d.common.to,
    paidDate: d.mp.paidDate, gross: d.mp.gross, fee: d.mp.fee, adjustment: d.mp.adjustment,
    net: d.mp.net, orderCount: d.mp.orderCount, post: d.mp.post, posted: d.mp.posted,
  };

  return (
    <>
      <PageHeader
        title={d.nav.marketplace}
        subtitle={ctx.company.name_th}
        action={
          editable && (
            <>
              <SettlementImport shops={options.shops} labels={labels} />
              <MarketplaceManager canCreate options={options} labels={labels} />
            </>
          )
        }
      />

      <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900 ring-1 ring-inset ring-sky-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
        <div>
          <p className="font-medium">{d.mp.apiNote}</p>
          <p className="mt-1 text-xs leading-relaxed">{d.mp.apiNoteHint}</p>
        </div>
      </div>

      <Card className="mb-5">
        <CardHeader title={d.mp.shops} description={d.mp.shopsHint} />
        <Table>
          <THead>
            <TR>
              <TH>{d.mp.platform}</TH>
              <TH>{d.mp.shopName}</TH>
              <TH>{d.mp.shopRef}</TH>
              <TH>{d.mp.lastSync}</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {shops.length === 0 && <EmptyRow colSpan={5} label={d.mp.noShop} />}
            {shops.map((s) => (
              <TR key={s.id}>
                <TD>{KIND_LABEL[s.kind]}</TD>
                <TD>{s.shop_name}</TD>
                <TD className="font-mono text-xxs text-ink-500">{s.shop_ref || '—'}</TD>
                <TD className="text-ink-500">{s.last_sync_at ? String(s.last_sync_at).slice(0, 10) : d.mp.never}</TD>
                <TD>
                  {editable && (
                    <div className="flex justify-end">
                      <MarketplaceManager canCreate={false} editRow={s} options={options} labels={labels} />
                    </div>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <Card>
        <CardHeader title={d.mp.settlements} description={d.mp.settlementsHint} />
        <Table>
          <THead>
            <TR>
              <TH>{d.mp.paidDate}</TH>
              <TH>{d.mp.shop}</TH>
              <TH>{d.mp.settlementRef}</TH>
              <TH className="num">{d.mp.gross}</TH>
              <TH className="num">{d.mp.fee}</TH>
              <TH className="num">{d.mp.net}</TH>
              <TH>{d.common.status}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={7} label={d.common.noData} />}
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="whitespace-nowrap">{r.paid_date || '—'}</TD>
                <TD>{KIND_LABEL[byId.get(r.account_id)?.kind] || '—'}</TD>
                <TD className="font-mono text-xxs">{r.settlement_ref || '—'}</TD>
                <TD className="num">{money(r.gross_amount)}</TD>
                <TD className="num text-rose-600">{money(r.fee_amount)}</TD>
                <TD className="num font-medium">{money(r.net_amount)}</TD>
                <TD>
                  {r.journal_entry_id ? (
                    <span className="chip bg-emerald-50 text-emerald-700 ring-emerald-200">{d.mp.posted}</span>
                  ) : canPost ? (
                    <SettlementPost settlementId={r.id} labels={labels} />
                  ) : (
                    <span className="chip bg-ink-100 text-ink-500 ring-ink-200">{d.status.draft}</span>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
