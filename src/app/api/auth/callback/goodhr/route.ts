import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { verifyIdToken, exchangeCode, fetchUserinfo, isGoodhrConfigured, mapAppRole, trustAppRole } from '@/lib/goodhr';

export const dynamic = 'force-dynamic';

const back = (req: Request, reason: string) =>
  NextResponse.redirect(new URL(`/login?sso=${reason}`, req.url));

/**
 * รับผู้ใช้กลับจาก GoodHR แล้วเปิดเซสชันของ ONEBOOK
 *
 * ลำดับการตรวจ (ข้ามข้อใดข้อหนึ่งไม่ได้)
 *   1) state ตรงกับที่ส่งไป            กัน CSRF
 *   2) แลก code ด้วย code_verifier     กันคนดัก code ไปใช้
 *   3) ตรวจลายเซ็น/ผู้ออก/ผู้รับ/nonce  กัน token ปลอม
 *   4) พนักงานยังทำงานอยู่ (is_active)
 *   5) ได้รับอนุญาตให้เข้าใช้ ONEBOOK แล้ว  ← ค่าเริ่มต้นคือ "ไม่อนุญาต"
 */
export async function GET(req: Request) {
  if (!isGoodhrConfigured()) return back(req, 'not_configured');

  const url = new URL(req.url);
  const jar = cookies();

  const err = url.searchParams.get('error');
  if (err) return back(req, err === 'access_denied' ? 'denied' : 'error');

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const savedState = jar.get('ghr_state')?.value;
  const verifier = jar.get('ghr_verifier')?.value;
  const nonce = jar.get('ghr_nonce')?.value;

  // ล้างคุกกี้ทันทีไม่ว่าผลจะเป็นอย่างไร ใช้ได้ครั้งเดียวเท่านั้น
  for (const k of ['ghr_state', 'ghr_verifier', 'ghr_nonce']) jar.delete(k);

  if (!code || !state || !savedState || !verifier) return back(req, 'expired');
  if (state !== savedState) return back(req, 'state_mismatch');

  try {
    const tokens = await exchangeCode(code, verifier);
    const claims = await verifyIdToken(tokens.id_token, nonce);

    // เติมข้อมูลที่ id_token อาจไม่มี (บาง provider ส่งเฉพาะใน userinfo)
    const extra = await fetchUserinfo(tokens.access_token);
    const c = { ...extra, ...claims };

    if (!c.sub) return back(req, 'no_sub');
    if (c.is_active === false) return back(req, 'inactive');
    if (!c.email) return back(req, 'no_email');

    const admin = createAdminClient();

    // ── ตรวจสิทธิ์เข้าใช้ก่อนสร้างบัญชี กันบัญชีขยะของคนที่ไม่ได้รับอนุญาต ──
    const { data: check } = await admin.rpc('sso_check_access', {
      p_sub: c.sub,
      p_email: c.email,
      p_employee_code: c.employee_code || null,
    });
    const chk = (check || {}) as any;
    const profile = chk.existing_profile;
    const pending = Number(chk.pending_invitations || 0);

    // app_role ที่ผู้ดูแล GoodHR เลือกไว้ ใช้ได้ต่อเมื่อเปิด GOODHR_TRUST_APP_ROLE
    const autoRole = trustAppRole() ? mapAppRole(c.app_role) : null;
    const hasAccess = !!profile || pending > 0 || !!autoRole;

    if (!hasAccess) return back(req, 'no_access');
    if (profile && profile.is_active === false) return back(req, 'suspended');
    if (profile && Number(profile.companies || 0) === 0 && pending === 0 && !autoRole) {
      return back(req, 'no_access');
    }

    // ── หา auth user เดิม หรือสร้างใหม่ถ้ายังไม่มี ──
    let userId: string | undefined = profile?.id;
    if (!userId) {
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email: c.email,
        email_confirm: true,
        user_metadata: { full_name: c.name, provider: 'goodhr', goodhr_sub: c.sub },
      });
      if (cErr || !created?.user) return back(req, 'create_failed');
      userId = created.user.id;
    }

    // ── ผูกโปรไฟล์กับ GoodHR และใช้คำเชิญที่ค้างอยู่ ──
    const { error: linkErr } = await admin.rpc('sso_link_profile', {
      p_user: userId,
      p_claims: c as any,
      p_auto_role: autoRole,
      p_company_name: c.company_name || null,
    });
    if (linkErr) return back(req, 'link_failed');

    // ── เปิดเซสชัน Supabase ให้ผู้ใช้ (ไม่ต้องใช้รหัสผ่าน) ──
    const { data: link, error: lErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: c.email,
    });
    const hashed = (link as any)?.properties?.hashed_token;
    if (lErr || !hashed) return back(req, 'session_failed');

    const supabase = createClient();
    const { error: vErr } = await supabase.auth.verifyOtp({ type: 'email', token_hash: hashed });
    if (vErr) return back(req, 'session_failed');

    // บันทึกประวัติการเข้าใช้
    await admin.from('audit_logs').insert({
      user_id: userId,
      user_email: c.email,
      action: 'login',
      resource: 'auth.goodhr',
      record_id: c.sub,
      after_data: {
        employee_code: c.employee_code, goodhr_role: c.role,
        department: c.department, company_name: c.company_name,
      },
    });

    return NextResponse.redirect(new URL('/dashboard', req.url));
  } catch (e: any) {
    console.error('[goodhr] callback failed:', e?.message);
    return back(req, 'failed');
  }
}
