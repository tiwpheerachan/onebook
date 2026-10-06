import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { LocationManager } from '@/components/forms/location-manager';

export const dynamic = 'force-dynamic';

export default async function AssetLocationsPage() {
  const ctx = await requirePermission('accounting.assets', 'view');
  const d = t();
  const supabase = createClient();
  const { data } = await supabase
    .from('asset_locations')
    .select('id, code, name, building, floor, room, is_active')
    .eq('company_id', ctx.company.id)
    .order('code');
  const rows = (data || []) as any[];
  const L = d.ui.assetLoc;
  const labels = {
    create: L.create, edit: L.edit, save: d.common.save, cancel: d.common.cancel, delete: L.delete,
    confirmDelete: L.confirmDelete, code: L.code, name: L.name, building: L.building, floor: L.floor, room: L.room,
    active: L.active, yes: L.yes, no: L.no,
  };
  const canEdit = can(ctx, 'accounting.assets', 'edit');
  const canDelete = can(ctx, 'accounting.assets', 'delete');

  return (
    <>
      <PageHeader
        title={L.title}
        subtitle={`${ctx.company.name_th} · ${L.subtitle}`}
        action={<LocationManager canCreate={can(ctx, 'accounting.assets', 'create')} canEdit={false} canDelete={false} labels={labels} />}
      />
      <Card>
        <Table>
          <THead><TR>
            <TH>{L.code}</TH><TH>{L.name}</TH><TH>{L.building}</TH><TH>{L.floor}</TH><TH>{L.room}</TH><TH>{L.active}</TH><TH />
          </TR></THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={7} label={d.common.noData} />}
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="font-mono text-xxs">{r.code}</TD>
                <TD>{r.name}</TD>
                <TD className="text-ink-500">{r.building || '—'}</TD>
                <TD className="text-ink-500">{r.floor || '—'}</TD>
                <TD className="text-ink-500">{r.room || '—'}</TD>
                <TD>{r.is_active ? L.yes : L.no}</TD>
                <TD>
                  <div className="flex justify-end">
                    <LocationManager canCreate={false} canEdit={canEdit} canDelete={canDelete} editRow={r} labels={labels} />
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
