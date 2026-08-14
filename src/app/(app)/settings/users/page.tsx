import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card, CardHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { UserAccessManager } from '@/components/forms/user-access-manager';
import { localeDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const ctx = await requirePermission('settings.users', 'view');
  const d = t();
  const locale = currentLocale();
  const supabase = createClient();

  // ยิงพร้อมกัน : สามคิวรีนี้ไม่ขึ้นต่อกัน
  const [{ data: members }, { data: roles }, { data: allProfiles }] = await Promise.all([
    supabase
      .from('user_companies')
      .select('id, user_id, role_id, can_view_subsidiaries, is_active, created_at, profiles(full_name, email, is_group_admin, last_login_at), roles(name_th, code)')
      .eq('company_id', ctx.company.id),
    supabase.from('roles').select('id, name_th, code').eq('company_id', ctx.company.id).order('code'),
    supabase.from('profiles').select('id, full_name, email').eq('is_active', true).order('full_name').limit(500),
  ]);

  const rows = (members || []) as any[];

  return (
    <>
      <PageHeader
        title={d.nav.users}
        subtitle={`${ctx.company.name_th} · ${rows.length} ผู้ใช้ที่ได้รับสิทธิ์ในบริษัทนี้`}
        action={
          <UserAccessManager
            canCreate={can(ctx, 'settings.users', 'create')}
            roles={(roles || []).map((r: any) => ({ id: r.id, label: r.name_th }))}
            profiles={(allProfiles || []).map((p: any) => ({ id: p.id, label: `${p.full_name} · ${p.email}` }))}
          />
        }
      />
      <Card>
        <CardHeader title="ผู้ใช้และบทบาทในบริษัทนี้" />
        <Table>
          <THead>
            <TR><TH>ชื่อ</TH><TH>อีเมล</TH><TH>บทบาท</TH><TH>เห็นบริษัทลูก</TH><TH>เข้าใช้ล่าสุด</TH><TH>สถานะ</TH><TH /></TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={7} label={d.common.noData} />}
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="font-medium text-ink-900">
                  {r.profiles?.full_name}
                  {r.profiles?.is_group_admin && <Badge tone="brand">Group Admin</Badge>}
                </TD>
                <TD className="text-ink-600">{r.profiles?.email}</TD>
                <TD><Badge tone="neutral">{r.roles?.name_th}</Badge></TD>
                <TD>{r.can_view_subsidiaries ? <Badge tone="success">ใช่</Badge> : <span className="text-ink-300">–</span>}</TD>
                <TD className="text-xs text-ink-500">{r.profiles?.last_login_at ? localeDate(r.profiles.last_login_at, locale) : '–'}</TD>
                <TD>{r.is_active ? <Badge tone="success">ใช้งาน</Badge> : <Badge tone="danger">ระงับ</Badge>}</TD>
                <TD>
                  <UserAccessManager
                    canCreate={false}
                    canEdit={can(ctx, 'settings.users', 'edit')}
                    membership={{ id: r.id, is_active: r.is_active }}
                    roles={[]} profiles={[]}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <p className="mt-4 rounded-lg bg-ink-100 px-4 py-3 text-xs leading-relaxed text-ink-600">
        การสร้างบัญชีผู้ใช้ใหม่ทำที่ Supabase Studio &gt; Authentication &gt; Users (หรือผ่านผู้ดูแลระบบ)
        จากนั้นจึงกลับมาที่หน้านี้เพื่อกำหนดบทบาทให้ผู้ใช้ในแต่ละบริษัท
        ระบบแนะนำให้เปิดใช้ Multi-Factor Authentication ใน Supabase สำหรับผู้ใช้ทุกคน
      </p>
    </>
  );
}
