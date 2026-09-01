import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ExportCsvButton } from '@/components/ui/export-csv';
import { SearchBox } from '@/components/forms/search-box';
import { AccountEditor, type AccountRow } from '@/components/forms/account-manager';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

export default async function CoaPage({
  searchParams,
}: {
  searchParams: { q?: string; inactive?: string };
}) {
  const ctx = await requirePermission('accounting.coa', 'view');
  const d = t();
  const L = d.ui.coa;
  const locale = currentLocale();
  const canEdit = can(ctx, 'accounting.coa', 'edit') || can(ctx, 'accounting.coa', 'create');
  const showInactive = searchParams.inactive === '1';

  const supabase = createClient();
  let q = supabase
    .from('accounts')
    .select('*')
    .eq('company_id', ctx.company.id)
    .order('code')
    .limit(1000);
  if (!showInactive) q = q.eq('is_active', true);

  const term = (searchParams.q || '').trim();
  if (term) q = q.or(`code.ilike.%${term}%,name_th.ilike.%${term}%,name_en.ilike.%${term}%`);

  const { data } = await q;
  const rows = (data || []) as AccountRow[];

  const TYPE_LABEL: Record<string, string> = {
    asset: L.typeAsset, liability: L.typeLiability, equity: L.typeEquity,
    revenue: L.typeRevenue, cost_of_sales: L.typeCostOfSales, expense: L.typeExpense,
    other_income: L.typeOtherIncome, other_expense: L.typeOtherExpense, tax: L.typeTax,
  };

  // ชื่อบัญชีตามภาษาที่เลือก ถ้ายังไม่ได้แปลให้ใช้ชื่อไทยแทนที่จะโชว์ช่องว่าง
  const name = (r: AccountRow) =>
    locale === 'en' ? r.name_en || r.name_th
    : locale === 'zh' ? r.name_zh || r.name_th
    : r.name_th;

  // บัญชีหัวข้อเท่านั้นที่เป็นแม่ได้ ไม่งั้นผังจะซ้อนกันมั่ว
  const parents = rows
    .filter((r) => r.is_header)
    .map((r) => ({ code: r.code, label: `${r.code} ${name(r)}` }));

  const link = (next: Record<string, string>) => {
    const p = new URLSearchParams();
    if (term) p.set('q', term);
    if (showInactive) p.set('inactive', '1');
    for (const [k, v] of Object.entries(next)) { if (v) p.set(k, v); else p.delete(k); }
    const s = p.toString();
    return s ? `/accounting/coa?${s}` : '/accounting/coa';
  };

  return (
    <>
      <PageHeader
        title={d.nav.coa}
        subtitle={`${ctx.company.name_th} · ${rows.length} ${L.accounts} · ${L.subtitle}`}
        action={
          <>
            <SearchBox placeholder={L.search} defaultValue={searchParams.q} />
            {can(ctx, 'accounting.coa', 'export') && (
              <ExportCsvButton label={d.common.export} filename="chart-of-accounts.csv"
                rows={[[L.code, L.name, L.nameEn, L.type, L.normalSide],
                  ...rows.map((r) => [
                    r.code, r.name_th, r.name_en || '',
                    TYPE_LABEL[r.type] || r.type,
                    r.normal_side === 'D' ? L.debit : L.credit,
                  ])]} />
            )}
            <AccountEditor d={d} canEdit={canEdit} parents={parents} />
          </>
        }
      />

      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <a href={link({ inactive: showInactive ? '' : '1' })}
           className={cn('chip transition',
             showInactive ? 'bg-brand-600 text-white ring-brand-600'
                          : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50')}>
          {L.showInactive}
        </a>
      </div>

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>{L.code}</TH>
              <TH>{L.name}</TH>
              <TH>{L.type}</TH>
              <TH>{L.normalSide}</TH>
              <TH>{d.common.status}</TH>
              <TH align="right">{d.common.actions}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={6} label={d.common.noData} />}
            {rows.map((r) => (
              <TR key={r.id}>
                <TD><span className="font-mono text-xs">{r.code}</span></TD>
                <TD className={r.is_header ? 'font-semibold text-ink-900' : 'pl-6 text-ink-700'}>
                  {name(r)}
                  {/* บัญชีที่เครื่องลงบัญชีอ้างถึง ทำเครื่องหมายไว้ให้รู้ว่าห้ามแก้รหัส */}
                  {r.system_key && (
                    <span className="ml-2 font-mono text-xxs text-brand-500" title={L.systemLocked}>
                      {r.system_key}
                    </span>
                  )}
                </TD>
                <TD className="text-xs text-ink-500">{TYPE_LABEL[r.type] || r.type}</TD>
                <TD className="text-xs">{r.normal_side === 'D' ? L.debit : L.credit}</TD>
                <TD>
                  {r.is_active
                    ? <Badge tone="success">{L.active}</Badge>
                    : <Badge>{L.inactive}</Badge>}
                </TD>
                <TD align="right">
                  <AccountEditor row={r} d={d} canEdit={canEdit} parents={parents} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
