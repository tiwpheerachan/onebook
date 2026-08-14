import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isGoodhrConfigured, clientId } from '@/lib/goodhr';

export const dynamic = 'force-dynamic';

/** ออกจากระบบ ONEBOOK แล้วออกจาก GoodHR ต่อ (ไม่งั้นกดเข้าใหม่จะเข้าได้เลยโดยไม่ถามรหัส) */
export async function GET(req: Request) {
  const supabase = createClient();
  await supabase.auth.signOut();

  const origin = (process.env.APP_ORIGIN || new URL(req.url).origin).replace(/\/+$/, '');
  if (!isGoodhrConfigured()) return NextResponse.redirect(`${origin}/login`);

  const issuer = (process.env.GOODHR_ISSUER || '').replace(/\/+$/, '');
  const url = new URL(`${issuer}/api/oauth/logout`);
  url.searchParams.set('client_id', clientId());
  url.searchParams.set('post_logout_redirect_uri', origin);
  return NextResponse.redirect(url.toString());
}
