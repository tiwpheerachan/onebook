import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DimensionEditor, DimensionDelete, type DimensionRow } from '@/components/forms/dimension-manager';

export const dynamic = 'force-dynamic';

export default async function DimensionsPage() {
  const ctx = await requirePermission('settings.dimensions', 'view');
  const d = t();
  const L = d.ui.dimension;
  const canEdit = can(ctx, 'settings.dimensions', 'edit') || can(ctx, 'settings.dimensions', 'create');
  const canDelete = can(ctx, 'settings.dimensions', 'delete');

  const supabase = createClient();
  const { data } = await supabase.rpc('rpt_dimensions', { p_company: ctx.company.id });
  const rows = (data || []) as DimensionRow[];

  return (
    <>
      <PageHeader
        title={L.title}
        subtitle={`${ctx.company.name_th} · ${L.subtitle}`}
        action={<DimensionEditor d={d} canEdit={canEdit} defaultGroup={L.title} />}
      />

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>{L.groupName}</TH>
              <TH>{L.code}</TH>
              <TH>{L.name}</TH>
              <TH align="right">{L.usage}</TH>
              <TH>{d.common.status}</TH>
              <TH align="right">{d.common.actions}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={6} label={L.empty} />}
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="text-ink-600">{r.group_name}</TD>
                <TD className="font-mono text-xs">{r.code}</TD>
                <TD className="font-medium text-ink-900">{r.name}</TD>
                <TD align="right" className="text-ink-500">{r.doc_count}</TD>
                <TD>
                  {r.is_active
                    ? <Badge tone="success">{L.active}</Badge>
                    : <Badge>{d.common.inactive}</Badge>}
                </TD>
                <TD align="right">
                  <span className="inline-flex items-center gap-1">
                    <DimensionEditor row={r} d={d} canEdit={canEdit} defaultGroup={L.title} />
                    <DimensionDelete row={r} d={d} canDelete={canDelete} />
                  </span>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
