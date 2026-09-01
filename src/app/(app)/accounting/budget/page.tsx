import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { MonthPicker } from '@/components/forms/month-picker';
import { BudgetEditor, type BudgetRow } from '@/components/forms/budget-manager';
import { money, currencyLabel, localeYear } from '@/lib/format';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

interface VsActual {
  account_id: string; code: string;
  name_th: string; name_en: string | null; name_zh: string | null;
  dimension_id: string | null; dimension_code: string | null; dimension_name: string | null;
  budget: number; actual: number; commitment: number;
  used: number; remaining: number; used_ratio: number | null;
}

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: { y?: string; m?: string };
}) {
  const ctx = await requirePermission('accounting.budget', 'view');
  const d = t();
  const L = d.ui.budget;
  const locale = currentLocale();
  const now = new Date();
  const year = Number(searchParams.y) || now.getFullYear();
  const month = Number(searchParams.m) || now.getMonth() + 1;

  const supabase = createClient();
  const [{ data: vs }, { data: budgets }, { data: accounts }, { data: dimensions }] = await Promise.all([
    supabase.rpc('rpt_budget_vs_actual', { p_company: ctx.company.id, p_year: year, p_month: month }),
    supabase.from('budgets').select('*').eq('company_id', ctx.company.id).eq('fiscal_year', year),
    // ตั้งงบได้เฉพาะบัญชีค่าใช้จ่ายและต้นทุน ไม่ใช่ทุกบัญชีในผัง
    supabase.from('accounts').select('id, code, name_th')
      .eq('company_id', ctx.company.id).eq('is_active', true).eq('is_header', false)
      .in('type', ['expense', 'cost_of_sales', 'other_expense']).order('code').limit(500),
    supabase.from('dimensions').select('id, code, name')
      .eq('company_id', ctx.company.id).eq('is_active', true).order('code').limit(500),
  ]);

  const rows = (vs || []) as VsActual[];
  const byId = new Map((budgets || []).map((b: any) => [`${b.account_id}|${b.dimension_id || ''}`, b as BudgetRow]));
  const canEdit = can(ctx, 'accounting.budget', 'edit') || can(ctx, 'accounting.budget', 'create');
  const canDelete = can(ctx, 'accounting.budget', 'delete');

  const accName = (r: VsActual) =>
    locale === 'en' ? r.name_en || r.name_th
    : locale === 'zh' ? r.name_zh || r.name_th
    : r.name_th;

  /** แถบสัดส่วนการใช้งบ — แดงเมื่อเกิน เหลืองเมื่อใกล้เต็ม */
  const tone = (ratio: number | null) =>
    ratio == null ? 'bg-ink-300'
    : ratio > 1 ? 'bg-rose-500'
    : ratio > 0.85 ? 'bg-amber-500' : 'bg-brand-500';

  return (
    <>
      <PageHeader
        title={L.title}
        subtitle={`${ctx.company.name_th} · ${L.subtitle} · ${currencyLabel(ctx.company.base_currency, locale)}`}
        breadcrumb={[{ label: d.nav.accounting }, { label: L.title }]}
        action={
          <>
            <MonthPicker year={year} month={month} />
            <BudgetEditor
              accounts={(accounts || []).map((a: any) => ({ id: a.id, label: `${a.code} ${a.name_th}` }))}
              dimensions={(dimensions || []).map((x: any) => ({ id: x.id, label: `${x.code} · ${x.name}` }))}
              year={year} month={month} canEdit={canEdit} canDelete={canDelete}
            />
          </>
        }
      />

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>{L.account}</TH>
              <TH>{L.dimension}</TH>
              <TH align="right">{L.amount}</TH>
              <TH align="right">{L.actual}</TH>
              <TH align="right">{L.commitment}</TH>
              <TH align="right">{L.remaining}</TH>
              <TH>{L.usedRatio}</TH>
              <TH align="right">{d.common.actions}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={8} label={L.empty} />}
            {rows.map((r) => {
              const ratio = r.used_ratio == null ? null : Number(r.used_ratio);
              const key = `${r.account_id}|${r.dimension_id || ''}`;
              return (
                <TR key={key}>
                  <TD>
                    <span className="font-mono text-xxs text-ink-400">{r.code}</span> {accName(r)}
                  </TD>
                  <TD className="text-xs text-ink-500">
                    {r.dimension_code ? `${r.dimension_code} · ${r.dimension_name}` : L.allDimensions}
                  </TD>
                  <TD align="right">{money(r.budget)}</TD>
                  <TD align="right" className="text-ink-600">{money(r.actual)}</TD>
                  <TD align="right" className="text-ink-500">{money(r.commitment)}</TD>
                  <TD align="right" className={cn('font-medium',
                    Number(r.remaining) < 0 ? 'text-rose-600' : 'text-ink-900')}>
                    {money(r.remaining)}
                  </TD>
                  <TD>
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-ink-100">
                        <span className={cn('block h-full rounded-full', tone(ratio))}
                              style={{ width: `${Math.min(100, Math.max(0, (ratio ?? 0) * 100))}%` }} />
                      </span>
                      <span className="tabular-nums text-xxs text-ink-500">
                        {ratio == null ? '–' : `${(ratio * 100).toFixed(0)}%`}
                      </span>
                    </span>
                  </TD>
                  <TD align="right">
                    <BudgetEditor
                      row={byId.get(key)}
                      accounts={(accounts || []).map((a: any) => ({ id: a.id, label: `${a.code} ${a.name_th}` }))}
                      dimensions={(dimensions || []).map((x: any) => ({ id: x.id, label: `${x.code} · ${x.name}` }))}
                      year={year} month={month} canEdit={canEdit} canDelete={canDelete}
                    />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>

      <p className="mt-3 text-xxs leading-relaxed text-ink-400">
        {L.commitmentHint} · {localeYear(year, locale)}
      </p>
    </>
  );
}
