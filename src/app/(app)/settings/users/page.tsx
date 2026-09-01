import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card, CardHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { UserAccessManager } from '@/components/forms/user-access-manager';
import { SsoInvite, InvitationList } from '@/components/forms/sso-invite';
import { localeDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const ctx = await requirePermission('settings.users', 'view');
  const d = t();
  const L = d.ui.usersPage;
  const locale = currentLocale();
  const supabase = createClient();

  // ยิงพร้อมกัน : สามคิวรีนี้ไม่ขึ้นต่อกัน
  const [{ data: members }, { data: roles }, { data: allProfiles }] = await Promise.all([
    supabase
      .from('user_companies')
      .select('id, user_id, role_id, can_view_subsidiaries, is_active, created_at, profiles(full_name, email, is_group_admin, last_login_at, employee_code, department, position, goodhr_app_role, auth_source), roles(name_th, code)')
      .eq('company_id', ctx.company.id),
    supabase.from('roles').select('id, name_th, code').eq('company_id', ctx.company.id).order('code'),
    supabase.from('profiles').select('id, full_name, email').eq('is_active', true).order('full_name').limit(500),
  ]);

  const rows = (members || []) as any[];

  // รายชื่อที่อนุญาตไว้แต่ยังไม่เคยล็อกอินด้วย GoodHR
  const { data: invRows } = await supabase
    .from('sso_invitations')
    .select('id, employee_code, email, note, can_view_subsidiaries, created_at, roles(name_th)')
    .eq('company_id', ctx.company.id)
    .is('consumed_at', null)
    .order('created_at', { ascending: false });
  const invitations = (invRows || []).map((r: any) => ({
    id: r.id, employee_code: r.employee_code, email: r.email,
    role: r.roles?.name_th || '-', note: r.note,
    can_view_subsidiaries: r.can_view_subsidiaries, created_at: r.created_at,
  }));

  return (
    <>
      <PageHeader
        title={d.nav.users}
        subtitle={`${ctx.company.name_th} · ${L.subtitle.replace('{n}', String(rows.length))}`}
        action={
          <>
          <SsoInvite
            canCreate={can(ctx, 'settings.users', 'create')}
            roles={(roles || []).map((r: any) => ({ id: r.id, label: r.name_th }))}
          />
          <UserAccessManager
            canCreate={can(ctx, 'settings.users', 'create')}
            roles={(roles || []).map((r: any) => ({ id: r.id, label: r.name_th }))}
            profiles={(allProfiles || []).map((p: any) => ({ id: p.id, label: `${p.full_name} · ${p.email}` }))}
          />
          </>
        }
      />

      <InvitationList rows={invitations} canEdit={can(ctx, 'settings.users', 'edit')} />
      <Card>
        <CardHeader title={L.cardTitle} />
        <Table>
          <THead>
            <TR><TH>{L.name}</TH><TH>{L.empCode}</TH><TH>{L.deptRole}</TH><TH>{L.onebookRole}</TH>
              <TH>{L.seeSubs}</TH><TH>{L.lastSeen}</TH><TH>{L.status}</TH><TH /></TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={8} label={d.common.noData} />}
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="font-medium text-ink-900">
                  {r.profiles?.full_name}
                  {r.profiles?.is_group_admin && <Badge tone="brand">Group Admin</Badge>}
                </TD>
                <TD>
                  <span className="font-mono text-xs text-ink-600">{r.profiles?.employee_code || '–'}</span>
                  {r.profiles?.auth_source === 'goodhr' && <Badge tone="brand">GoodHR</Badge>}
                </TD>
                <TD className="text-xs text-ink-600"><span className="block truncate max-w-[16rem]">{r.profiles?.department || '–'}
                  {r.profiles?.position && <span className="text-ink-400"> · {r.profiles.position}</span>}</span></TD>
                <TD>
                  <Badge tone="neutral">{r.roles?.name_th}</Badge>
                  {/* GoodHR เสนอบทบาทมาคนละตัวกับที่ให้จริง — เตือนให้ผู้ดูแลรู้ */}
                  {r.profiles?.goodhr_app_role && r.profiles.goodhr_app_role !== r.roles?.code
                    && r.profiles.goodhr_app_role !== r.roles?.name_th && (
                    <span
                      title={L.goodhrHint.replace('{role}', r.profiles.goodhr_app_role)}
                      className="ml-1 text-xxs text-amber-600"
                    >
                      (GoodHR : {r.profiles.goodhr_app_role})
                    </span>
                  )}
                </TD>
                <TD>{r.can_view_subsidiaries ? <Badge tone="success">{L.yes}</Badge> : <span className="text-ink-300">–</span>}</TD>
                <TD className="text-xs text-ink-500">{r.profiles?.last_login_at ? localeDate(r.profiles.last_login_at, locale) : '–'}</TD>
                <TD>{r.is_active ? <Badge tone="success">{L.active}</Badge> : <Badge tone="danger">{L.suspended}</Badge>}</TD>
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
