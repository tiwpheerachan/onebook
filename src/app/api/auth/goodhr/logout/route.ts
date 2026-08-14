import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isGoodhrConfigured, clientId, discover, appOrigin } from '@/lib/goodhr';

export const dynamic = 'force-dynamic';

/** ออกจากระบบ ONEBOOK แล้วออกจาก GoodHR ต่อ (ไม่งั้นกดเข้าใหม่จะเข้าได้เลยโดยไม่ถามรหัส) */
export async function GET(req: Request) {
  const supabase = createClient();
  await supabase.auth.signOut();

  const origin = appOrigin(req);
  if (!isGoodhrConfigured()) return NextResponse.redirect(`${origin}/login`);

  // ใช้ end_session_endpoint จาก discovery เผื่อ GoodHR ย้าย path ในอนาคต
  const { end_session_endpoint } = await discover();
  const url = new URL(end_session_endpoint!);
  url.searchParams.set('client_id', clientId());
  // ต้องตรงกับ post_logout_redirect_uris ที่ลงทะเบียนไว้เป๊ะ (ไม่มี / ปิดท้าย)
  url.searchParams.set('post_logout_redirect_uri', origin);
  return NextResponse.redirect(url.toString());
}
