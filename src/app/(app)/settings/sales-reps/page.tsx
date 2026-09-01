import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';
import { PageHeader, Card, CardHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { SalesRefEditor, SalesRefDelete, type RefRow } from '@/components/forms/sales-rep-manager';

export const dynamic = 'force-dynamic';

export default async function SalesRepsPage() {
  const ctx = await requirePermission('contacts', 'view');
  const d = t();
  const L = d.ui.salesRep;
  const canEdit = can(ctx, 'contacts', 'edit') || can(ctx, 'contacts', 'create');
  const canDelete = can(ctx, 'contacts', 'delete');

  const supabase = createClient();
  const [{ data: reps }, { data: zones }] = await Promise.all([
    supabase.rpc('rpt_sales_reps', { p_company: ctx.company.id }),
    supabase.rpc('rpt_sales_zones', { p_company: ctx.company.id }),
  ]);

  const repRows = (reps || []) as RefRow[];
  const zoneRows = (zones || []) as RefRow[];

  return (
    <>
      <PageHeader title={L.title} subtitle={`${ctx.company.name_th} · ${L.subtitle}`} />

      <Card className="mb-5">
        <CardHeader
          title={L.reps}
          right={<SalesRefEditor kind="rep" d={d} canEdit={canEdit} />}
        />
        <Table>
          <THead>
            <TR>
              <TH>{L.code}</TH><TH>{L.name}</TH><TH>{L.phone}</TH>
              <TH align="right">{L.commissionRate}</TH>
              <TH align="right">{L.customers}</TH>
              <TH>{d.common.status}</TH><TH align="right">{d.common.actions}</TH>
            </TR>
          </THead>
          <TBody>
            {repRows.length === 0 && <EmptyRow colSpan={7} label={L.emptyReps} />}
            {repRows.map((r) => (
              <TR key={r.id}>
                <TD className="font-mono text-xs">{r.code}</TD>
                <TD className="font-medium text-ink-900">{r.name}</TD>
                <TD className="text-ink-600">{r.phone || '—'}</TD>
                <TD align="right">{Number(r.commission_rate ?? 0).toFixed(2)}</TD>
                <TD align="right" className="text-ink-500">{r.customer_count}</TD>
                <TD>{r.is_active ? <Badge tone="success">{L.active}</Badge> : <Badge>{d.common.inactive}</Badge>}</TD>
                <TD align="right">
                  <span className="inline-flex items-center gap-1">
                    <SalesRefEditor kind="rep" row={r} d={d} canEdit={canEdit} />
                    <SalesRefDelete kind="rep" row={r} d={d} canDelete={canDelete} />
                  </span>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <Card>
        <CardHeader
          title={L.zones}
          right={<SalesRefEditor kind="zone" d={d} canEdit={canEdit} />}
        />
        <Table>
          <THead>
            <TR>
              <TH>{L.code}</TH><TH>{L.name}</TH>
              <TH align="right">{L.customers}</TH>
              <TH>{d.common.status}</TH><TH align="right">{d.common.actions}</TH>
            </TR>
          </THead>
          <TBody>
            {zoneRows.length === 0 && <EmptyRow colSpan={5} label={L.emptyZones} />}
            {zoneRows.map((r) => (
              <TR key={r.id}>
                <TD className="font-mono text-xs">{r.code}</TD>
                <TD className="font-medium text-ink-900">{r.name}</TD>
                <TD align="right" className="text-ink-500">{r.customer_count}</TD>
                <TD>{r.is_active ? <Badge tone="success">{L.active}</Badge> : <Badge>{d.common.inactive}</Badge>}</TD>
                <TD align="right">
                  <span className="inline-flex items-center gap-1">
                    <SalesRefEditor kind="zone" row={r} d={d} canEdit={canEdit} />
                    <SalesRefDelete kind="zone" row={r} d={d} canDelete={canDelete} />
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
