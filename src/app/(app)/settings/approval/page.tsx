import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ApprovalRuleEditor, type RuleRow } from '@/components/forms/approval-rule-manager';
import { docTitle } from '@/components/documents/doc-meta';
import { SLUG_BY_KIND } from '@/lib/constants';
import { money, currencyLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ApprovalSettingsPage() {
  const ctx = await requirePermission('settings.roles', 'view');
  const d = t();
  const L = d.ui.approval;
  const locale = currentLocale();
  const canEdit = can(ctx, 'settings.roles', 'edit');

  const supabase = createClient();
  const [{ data: rules }, { data: roles }] = await Promise.all([
    supabase.from('approval_rules').select('*')
      .eq('company_id', ctx.company.id)
      .order('doc_kind', { nullsFirst: true }).order('min_amount').order('step_no'),
    supabase.from('roles').select('id, code, name_th, name_en, name_zh')
      .eq('company_id', ctx.company.id).order('code'),
  ]);

  const rows = (rules || []) as RuleRow[];
  const roleName = (r: any) =>
    locale === 'en' ? r.name_en || r.name_th
    : locale === 'zh' ? r.name_zh || r.name_th
    : r.name_th;
  const roleList = (roles || []).map((r: any) => ({ id: r.id, label: roleName(r) }));
  const roleById = new Map(roleList.map((r) => [r.id, r.label]));

  return (
    <>
      <PageHeader
        title={L.title}
        subtitle={`${ctx.company.name_th} · ${L.subtitle} · ${currencyLabel(ctx.company.base_currency, locale)}`}
        breadcrumb={[{ label: d.nav.settings }, { label: L.title }]}
        action={<ApprovalRuleEditor roles={roleList} canEdit={canEdit} />}
      />

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>{L.docKind}</TH>
              <TH align="right">{L.minAmount}</TH>
              <TH align="right">{L.maxAmount}</TH>
              <TH align="right">{L.step}</TH>
              <TH>{L.role}</TH>
              <TH>{d.common.status}</TH>
              <TH align="right">{d.common.actions}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={7} label={L.empty} />}
            {rows.map((r) => (
              <TR key={r.id}>
                <TD>{r.doc_kind ? docTitle(d, SLUG_BY_KIND[r.doc_kind]) : L.anyKind}</TD>
                <TD align="right">{money(r.min_amount)}</TD>
                <TD align="right" className="text-ink-500">
                  {r.max_amount == null ? L.noLimit : money(r.max_amount)}
                </TD>
                <TD align="right" className="num">{r.step_no}</TD>
                <TD>{roleById.get(r.role_id) || '–'}</TD>
                <TD>
                  {r.is_active
                    ? <Badge tone="success">{L.active}</Badge>
                    : <Badge>{d.ui.coa.inactive}</Badge>}
                </TD>
                <TD align="right">
                  <ApprovalRuleEditor row={r} roles={roleList} canEdit={canEdit} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <p className="mt-3 text-xxs leading-relaxed text-ink-400">{L.amountHint}</p>
    </>
  );
}
