import { NextResponse } from 'next/server';
import { clientId, clientSecret, isGoodhrConfigured, redirectUri } from '@/lib/goodhr';

export const dynamic = 'force-dynamic';

/**
 * ใช้เป็น health check ของ Render และใช้ตรวจว่าเครื่องที่ deploy แล้ว
 * ตั้งค่า SSO ครบหรือยัง โดยไม่เปิดเผยค่าลับ
 *
 * ปุ่ม "เข้าสู่ระบบด้วย GoodHR" จะโผล่ก็ต่อเมื่อ sso.ready = true
 */
export async function GET() {
  const has = (v?: string | null) => !!v && !v.startsWith('TODO');
  return NextResponse.json({
    status: 'ok',
    ts: new Date().toISOString(),
    app_origin: process.env.APP_ORIGIN || null,
    sso: {
      ready: isGoodhrConfigured(),
      issuer: process.env.GOODHR_ISSUER || null,   // ไม่ใช่ค่าลับ
      client_id: clientId() || null,               // ไม่ใช่ค่าลับ
      has_client_secret: has(clientSecret()),      // บอกแค่ว่ามีหรือไม่มี
      redirect_uri: redirectUri(),                 // ไว้เทียบกับที่ลงทะเบียนกับ GoodHR
      trust_app_role: process.env.GOODHR_TRUST_APP_ROLE === 'true',
      password_login: process.env.ALLOW_PASSWORD_LOGIN === 'true',
    },
  });
}
