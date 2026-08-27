import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';
import { PageHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { GroupEditor, ApplyGroupAccounts } from '@/components/forms/product-group-manager';
import { money } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ProductGroupsPage() {
  const ctx = await requirePermission('products', 'view');
  const d = t();
  const L = d.ui.pgroup;
  const canEdit = can(ctx, 'products', 'edit');
  const supabase = createClient();

  const [{ data }, { data: groups }, { data: accounts }] = await Promise.all([
    supabase.rpc('rpt_product_groups', { p_company: ctx.company.id }),
    supabase.from('product_groups').select('*').eq('company_id', ctx.company.id).order('code'),
    supabase.from('accounts').select('id, code, name_th')
      .eq('company_id', ctx.company.id).eq('is_header', false)
      .order('code').limit(500),
  ]);

  const rows = (data || []) as any[];
  const raw = new Map(((groups || []) as any[]).map((g) => [g.id, g]));
  const accOpts = (accounts || []).map((a: any) => ({ id: a.id, label: `${a.code} ${a.name_th}` }));

  return (
    <>
      <PageHeader
        title={L.title}
        subtitle={`${ctx.company.name_th} · ${L.subtitle}`}
        action={<GroupEditor accounts={accOpts} d={d} canEdit={canEdit} />}
      />

      <div className="card overflow-hidden">
        <Table>
          <THead>
            <TR>
              <TH>{L.code}</TH>
              <TH>{L.name}</TH>
              <TH>{L.income}</TH>
              <TH>{L.cogs}</TH>
              <TH className="text-right">{L.productCount}</TH>
              <TH className="text-right">{L.stockValue}</TH>
              <TH className="text-right">{d.common.actions}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={7} label={L.empty} />}
            {rows.map((g) => (
              <TR key={g.id}>
                <TD><span className="font-mono text-xs">{g.code}</span></TD>
                <TD>
                  <span className="text-ink-800">{g.name}</span>
                  {!g.is_active && <span className="ml-2 chip bg-ink-100 text-ink-500 ring-ink-200">{d.common.no}</span>}
                  {g.note && <span className="block truncate text-xxs text-ink-400">{g.note}</span>}
                </TD>
                <TD className="font-mono text-xs text-ink-600">{g.income_account || '—'}</TD>
                <TD className="font-mono text-xs text-ink-600">{g.cogs_account || '—'}</TD>
                <TD className="text-right tabular-nums text-ink-600">{g.product_count}</TD>
                <TD className="text-right tabular-nums text-ink-700">{money(g.stock_value)}</TD>
                <TD className="text-right">
                  <span className="flex items-center justify-end gap-1">
                    <ApplyGroupAccounts groupId={g.id} d={d} canEdit={canEdit} />
                    <GroupEditor row={raw.get(g.id)} accounts={accOpts} d={d} canEdit={canEdit} />
                  </span>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-ink-400">{L.templateHint}</p>
    </>
  );
}
