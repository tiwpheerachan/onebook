import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';
import { PageHeader, Card, CardHeader } from '@/components/ui/page-header';
import { PermissionMatrix } from '@/components/forms/permission-matrix';
import { RowFilterEditor } from '@/components/forms/row-filter-editor';

export const dynamic = 'force-dynamic';

export default async function RolesPage() {
  const ctx = await requirePermission('settings.roles', 'view');
  const d = t();
  const supabase = createClient();

  const { data: roles } = await supabase
    .from('roles').select('*').eq('company_id', ctx.company.id).order('code');
  const roleIds = (roles || []).map((r: any) => r.id);
  const { data: perms } = roleIds.length
    ? await supabase.from('role_permissions').select('*').in('role_id', roleIds)
    : { data: [] as any[] };

  const { data: cgroups } = await supabase
    .from('contact_groups').select('id, name')
    .eq('company_id', ctx.company.id).order('sort_order').order('name');

  const L = d.ui.rowFilter;
  const canEditRoles = can(ctx, 'settings.roles', 'edit');
  // เงื่อนไขระดับแถวใช้ได้กับสองเมนูนี้เท่านั้น จึงหยิบเฉพาะแถวที่เกี่ยว
  const filterRows = (perms || []).filter((p: any) =>
    p.resource === 'contacts' || p.resource === 'documents');

  return (
    <>
      <PageHeader
        title={d.nav.roles}
        subtitle={`${ctx.company.name_th} · กำหนดสิทธิ์การมองเห็นและแก้ไขได้ละเอียดถึงระดับเมนูและการกระทำ`}
      />
      <Card>
        <CardHeader
          title="ตารางสิทธิ์"
          description="ติ๊กเพื่อให้สิทธิ์ · การเปลี่ยนแปลงบันทึกทันทีและถูกบันทึกใน audit log · สิทธิ์บังคับใช้ทั้งบน UI และที่ระดับฐานข้อมูล (RLS)"
        />
        <div className="p-5">
          <PermissionMatrix
            roles={(roles || []).map((r: any) => ({ id: r.id, code: r.code, name: r.name_th, isSystem: r.is_system }))}
            permissions={(perms || []) as any[]}
            canEdit={can(ctx, 'settings.roles', 'edit')}
          />
        </div>
      </Card>

      <Card className="mt-6">
        <CardHeader title={L.title} description={L.hint} />
        <div className="divide-y divide-ink-100">
          {filterRows.length === 0 && (
            <p className="px-5 py-6 text-sm text-ink-400">{L.noRow}</p>
          )}
          {filterRows.map((p: any) => {
            const role = (roles || []).find((r: any) => r.id === p.role_id);
            if (!role) return null;
            return (
              <div key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="text-sm text-ink-800">{role.name_th}</span>
                  <span className="ml-2 font-mono text-xxs text-ink-400">{p.resource}</span>
                </span>
                <RowFilterEditor
                  roleId={p.role_id}
                  roleName={role.name_th}
                  resource={p.resource}
                  current={p.row_filter}
                  groups={(cgroups || []).map((g: any) => ({ id: g.id, label: g.name }))}
                  d={d}
                  canEdit={canEditRoles}
                />
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}
