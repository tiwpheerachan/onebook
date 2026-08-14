import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';
import { PageHeader, Card, CardHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { StatCard } from '@/components/ui/stat-card';
import { ExportCsvButton } from '@/components/ui/export-csv';
import { AssetManager } from '@/components/forms/asset-manager';
import { AssetDispose } from '@/components/forms/asset-dispose';
import { DepreciationRunner } from '@/components/forms/depreciation-runner';
import { money } from '@/lib/format';

export const dynamic = 'force-dynamic';

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-ink-100 text-ink-700 ring-ink-200',
  active: 'bg-brand-50 text-brand-700 ring-brand-200',
  fully_depreciated: 'bg-amber-50 text-amber-700 ring-amber-200',
  disposed: 'bg-ink-100 text-ink-400 ring-ink-200',
};

export default async function AssetsPage({ searchParams }: { searchParams: { as_of?: string } }) {
  const ctx = await requirePermission('accounting.assets', 'view');
  const d = t();
  const supabase = createClient();
  const asOf = searchParams.as_of || new Date().toISOString().slice(0, 10);

  const [{ data: register }, { data: assets }, { data: accounts }] = await Promise.all([
    supabase.rpc('rpt_asset_register', { p_company: ctx.company.id, p_as_of: asOf }),
    supabase.from('fixed_assets').select('*').eq('company_id', ctx.company.id).order('code').limit(500),
    supabase
      .from('accounts')
      .select('id, code, name_th')
      .eq('company_id', ctx.company.id)
      .eq('is_header', false)
      .order('code')
      .limit(500),
  ]);

  const rows = (register || []) as any[];
  const byId = new Map((assets || []).map((a: any) => [a.id, a]));
  const accOptions = (accounts || []).map((a: any) => ({ id: a.id, label: `${a.code} ${a.name_th}` }));

  const live = rows.filter((r) => r.status !== 'disposed');
  const totalCost = live.reduce((s, r) => s + Number(r.cost || 0), 0);
  const totalAccum = live.reduce((s, r) => s + Number(r.accum_dep || 0), 0);
  const totalBook = live.reduce((s, r) => s + Number(r.book_value || 0), 0);

  const managerLabels = {
    create: d.assets.create, edit: d.common.edit, save: d.common.save, cancel: d.common.cancel,
    code: d.assets.code, name: d.assets.name, category: d.assets.category,
    serialNo: d.assets.serialNo, location: d.assets.location,
    acquiredDate: d.assets.acquiredDate, inServiceDate: d.assets.inServiceDate,
    cost: d.assets.cost, salvage: d.assets.salvage, method: d.assets.method,
    straightLine: d.assets.straightLine, declining: d.assets.declining, noDep: d.assets.noDep,
    lifeMonths: d.assets.lifeMonths, decliningRate: d.assets.decliningRate,
    openingAccum: d.assets.openingAccum, assetAccount: d.assets.assetAccount,
    accumAccount: d.assets.accumAccount, depExpenseAccount: d.assets.depExpenseAccount,
    auto: d.assets.auto, note: d.common.notes, monthlyPreview: d.assets.monthlyPreview,
  };

  const disposeLabels = {
    dispose: d.assets.dispose, cancel: d.common.cancel, confirm: d.common.save,
    disposedDate: d.assets.disposedDate, proceeds: d.assets.proceeds, note: d.common.notes,
    bookValue: d.assets.bookValue, gain: d.assets.gain, loss: d.assets.loss,
  };

  const runnerLabels = {
    runDep: d.assets.runDep, close: d.common.cancel, calculate: d.assets.calculate,
    postToJournal: d.assets.postToJournal, periodEnd: d.assets.periodEnd, periodHint: d.assets.periodHint,
    preview: d.assets.preview, posted: d.assets.posted, items: d.assets.items,
    nothingToPost: d.assets.nothingToPost, code: d.assets.code, name: d.assets.name,
    amount: d.assets.depAmount, bookValue: d.assets.bookValue,
  };

  return (
    <>
      <PageHeader
        title={d.nav.assets}
        subtitle={`${ctx.company.name_th} · ${d.inv.asOf} ${asOf}`}
        action={
          <>
            {can(ctx, 'accounting.assets', 'export') && (
              <ExportCsvButton
                label={d.common.export}
                filename="fixed-assets.csv"
                rows={[
                  [d.assets.code, d.assets.name, d.assets.category, d.assets.acquiredDate, d.assets.cost, d.assets.accumDep, d.assets.bookValue, d.common.status],
                  ...rows.map((r) => [r.code, r.name, r.category || '', r.acquired_date, r.cost, r.accum_dep, r.book_value, r.status]),
                ]}
              />
            )}
            {can(ctx, 'accounting.assets', 'post') && <DepreciationRunner labels={runnerLabels} />}
            <AssetManager
              canCreate={can(ctx, 'accounting.assets', 'create')}
              canEdit={can(ctx, 'accounting.assets', 'edit')}
              accounts={accOptions}
              labels={managerLabels}
            />
          </>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={d.assets.totalCost} value={totalCost} suffix={d.common.baht} />
        <StatCard label={d.assets.accumDep} value={totalAccum} suffix={d.common.baht} tone="negative" />
        <StatCard label={d.assets.netBookValue} value={totalBook} suffix={d.common.baht} tone="brand" />
      </div>

      <Card>
        <CardHeader title={d.assets.register} description={d.assets.registerHint} />
        <Table>
          <THead>
            <TR>
              <TH>{d.assets.code}</TH>
              <TH>{d.assets.name}</TH>
              <TH>{d.assets.category}</TH>
              <TH>{d.assets.acquiredDate}</TH>
              <TH className="num">{d.assets.cost}</TH>
              <TH className="num">{d.assets.accumDep}</TH>
              <TH className="num">{d.assets.bookValue}</TH>
              <TH>{d.common.status}</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={9} label={d.common.noData} />}
            {rows.map((r) => (
              <TR key={r.asset_id}>
                <TD className="font-mono text-xxs">{r.code}</TD>
                <TD>{r.name}</TD>
                <TD className="text-ink-500">{r.category || '—'}</TD>
                <TD className="whitespace-nowrap text-ink-500">{r.acquired_date}</TD>
                <TD className="num">{money(r.cost)}</TD>
                <TD className="num text-ink-500">{money(r.accum_dep)}</TD>
                <TD className="num font-medium">{money(r.book_value)}</TD>
                <TD>
                  <span className={`chip ${STATUS_STYLE[r.status] || STATUS_STYLE.draft}`}>
                    {d.assets.status[r.status as keyof typeof d.assets.status] || r.status}
                  </span>
                </TD>
                <TD>
                  <div className="flex items-center justify-end gap-1">
                    <AssetManager
                      canCreate={false}
                      canEdit={can(ctx, 'accounting.assets', 'edit') && r.status !== 'disposed'}
                      editRow={byId.get(r.asset_id)}
                      accounts={accOptions}
                      labels={managerLabels}
                    />
                    {can(ctx, 'accounting.assets', 'post') && r.status !== 'disposed' && (
                      <AssetDispose
                        asset={{ id: r.asset_id, code: r.code, name: r.name, book_value: Number(r.book_value) }}
                        labels={disposeLabels}
                      />
                    )}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
