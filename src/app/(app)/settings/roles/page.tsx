import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';
import { PageHeader, Card, CardHeader } from '@/components/ui/page-header';
import { PermissionMatrix } from '@/components/forms/permission-matrix';

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
    </>
  );
}
