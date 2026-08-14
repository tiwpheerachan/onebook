import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isGoodhrConfigured, randomToken, pkceChallenge, buildAuthorizeUrl, appOrigin } from '@/lib/goodhr';

export const dynamic = 'force-dynamic';

/**
 * เริ่มขั้นตอนล็อกอินด้วย GoodHR
 * สร้าง PKCE + state + nonce เก็บไว้ในคุกกี้อายุสั้น แล้วพาผู้ใช้ไปหน้า GoodHR
 */
export async function GET(req: Request) {
  if (!isGoodhrConfigured()) {
    return NextResponse.redirect(new URL('/login?sso=not_configured', appOrigin(req)));
  }

  const verifier = randomToken(32);
  const state = randomToken(16);
  const nonce = randomToken(16);

  const jar = cookies();
  const opts = {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 600, // 10 นาที พอสำหรับล็อกอินหนึ่งครั้ง
  };
  jar.set('ghr_verifier', verifier, opts);
  jar.set('ghr_state', state, opts);
  jar.set('ghr_nonce', nonce, opts);

  const url = await buildAuthorizeUrl({ state, nonce, challenge: pkceChallenge(verifier) });
  return NextResponse.redirect(url);
}
