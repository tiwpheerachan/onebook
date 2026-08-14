import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionContext } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { currentLocale } from '@/i18n/server';
import { PageHeader } from '@/components/ui/page-header';
import { ProfileForm } from '@/components/forms/profile-form';
import { Badge } from '@/components/ui/badge';
import { signOutAction } from '@/actions/session';
import { Building2, IdCard, KeyRound, LogOut, ShieldCheck } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');

  const supabase = createClient();
  const { data: p } = await supabase
    .from('profiles')
    .select('full_name, email, phone, employee_code, department, position, branch, auth_source, goodhr_role, goodhr_app_role, goodhr_synced_at, last_login_at, is_group_admin')
    .eq('id', ctx.userId)
    .maybeSingle();

  const me = (p || {}) as any;
  const fromGoodhr = me.auth_source === 'goodhr';

  // บริษัทที่เข้าถึงได้ พร้อมบทบาทในแต่ละบริษัท
  const { data: access } = await supabase
    .from('user_companies')
    .select('company_id, can_view_subsidiaries, is_active, companies(code, name_th), roles(name_th)')
    .eq('user_id', ctx.userId);

  const rows = (access || []) as any[];

  return (
    <>
      <PageHeader
        title="โปรไฟล์ของฉัน"
        subtitle="ข้อมูลส่วนตัว บริษัทที่เข้าถึงได้ และการเข้าสู่ระบบ"
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <ProfileForm fullName={me.full_name || ctx.fullName} phone={me.phone ?? null} locale={currentLocale()} />

          {/* ---------- ข้อมูลจาก GoodHR ---------- */}
          {fromGoodhr && (
            <div className="card p-5">
              <div className="flex items-center gap-2">
                <IdCard className="h-4 w-4 text-ink-400" strokeWidth={1.8} />
                <h2 className="text-sm font-semibold text-ink-900">ข้อมูลพนักงานจาก GoodHR</h2>
              </div>
              <p className="mt-0.5 text-xs text-ink-500">
                ซิงก์อัตโนมัติทุกครั้งที่เข้าสู่ระบบ แก้ที่นี่ไม่ได้ — ถ้าไม่ตรงให้แจ้งฝ่ายบุคคลแก้ใน GoodHR
              </p>
              <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                {[
                  ['รหัสพนักงาน', me.employee_code],
                  ['แผนก', me.department],
                  ['ตำแหน่ง', me.position],
                  ['สาขา', me.branch],
                  ['บทบาทใน GoodHR', me.goodhr_role],
                  ['บทบาทที่ HR เสนอไว้', me.goodhr_app_role],
                ].map(([k, v]) => (
                  <div key={k as string}>
                    <dt className="text-xxs uppercase tracking-wide text-ink-400">{k}</dt>
                    <dd className="text-ink-800">{v || '—'}</dd>
                  </div>
                ))}
              </dl>
              {me.goodhr_synced_at && (
                <p className="mt-3 text-xxs text-ink-400">
                  ซิงก์ล่าสุด {new Date(me.goodhr_synced_at).toLocaleString('th-TH')}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-5">
          {/* ---------- บัญชีและการเข้าสู่ระบบ ---------- */}
          <div className="card p-5">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-ink-400" strokeWidth={1.8} />
              <h2 className="text-sm font-semibold text-ink-900">บัญชีและการเข้าสู่ระบบ</h2>
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-xxs uppercase tracking-wide text-ink-400">อีเมล</dt>
                <dd className="break-all text-ink-800">{me.email || ctx.email}</dd>
              </div>
              <div>
                <dt className="text-xxs uppercase tracking-wide text-ink-400">วิธีเข้าสู่ระบบ</dt>
                <dd>
                  {fromGoodhr
                    ? <Badge tone="brand">GoodHR SSO</Badge>
                    : <Badge tone="neutral">อีเมลและรหัสผ่าน</Badge>}
                </dd>
              </div>
              {me.last_login_at && (
                <div>
                  <dt className="text-xxs uppercase tracking-wide text-ink-400">เข้าใช้ล่าสุด</dt>
                  <dd className="text-ink-800">{new Date(me.last_login_at).toLocaleString('th-TH')}</dd>
                </div>
              )}
              {ctx.isGroupAdmin && (
                <div className="flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-2 text-xs text-brand-800">
                  <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} />
                  คุณเป็นผู้ดูแลกลุ่ม เห็นและแก้ได้ทุกบริษัท
                </div>
              )}
            </dl>

            {/* ออกจาก GoodHR ด้วย ไม่งั้นกดเข้าใหม่จะเข้าได้เลยโดยไม่ถามรหัส */}
            {fromGoodhr ? (
              <a href="/api/auth/goodhr/logout" className="btn-secondary mt-4 w-full justify-center">
                <LogOut className="h-4 w-4 text-ink-400" strokeWidth={1.8} /> ออกจากระบบ
              </a>
            ) : (
              <form action={signOutAction} className="mt-4">
                <button type="submit" className="btn-secondary w-full justify-center">
                  <LogOut className="h-4 w-4 text-ink-400" strokeWidth={1.8} /> ออกจากระบบ
                </button>
              </form>
            )}
          </div>

          {/* ---------- บริษัทที่เข้าถึงได้ ---------- */}
          <div className="card p-5">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-ink-400" strokeWidth={1.8} />
              <h2 className="text-sm font-semibold text-ink-900">บริษัทที่เข้าถึงได้</h2>
            </div>
            <ul className="mt-3 divide-y divide-ink-100">
              {rows.length === 0 && <li className="py-3 text-sm text-ink-400">ยังไม่ได้รับสิทธิ์บริษัทใด</li>}
              {rows.map((r) => (
                <li key={r.company_id} className="flex items-center gap-2 py-2.5">
                  <span className="font-mono text-xxs text-ink-400">{r.companies?.code}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-800">{r.companies?.name_th}</span>
                  <span className="chip bg-ink-100 text-ink-600 ring-ink-200">{r.roles?.name_th}</span>
                  {!r.is_active && <span className="chip bg-rose-50 text-rose-700 ring-rose-200">ปิดใช้</span>}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xxs text-ink-400">
              ต้องการสิทธิ์เพิ่ม ติดต่อผู้ดูแลระบบที่หน้า{' '}
              <Link href="/settings/users" className="text-brand-600 underline">ผู้ใช้และสิทธิ์</Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
