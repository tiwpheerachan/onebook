import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { isIpAllowed, clientIpFromHeaders } from '@/lib/ip-guard';
import { frameAncestors } from '@/lib/frame-policy';

const PUBLIC_PATHS = ['/login', '/blocked', '/_next', '/favicon.ico', '/api/health'];

/**
 * ใครฝังหน้าจอนี้ได้บ้าง
 *
 * ตั้งที่นี่แทน next.config เพราะ headers() ใน next.config ผูกค่าไว้ตอน build
 * ตั้งที่ middleware อ่านค่าตอน request จึงเพิ่มโดเมนพอร์ทัลได้โดยไม่ต้อง build ใหม่
 * ต้องแปะทุกทางออกของ middleware ไม่งั้น response ที่ redirect หรือ 403 จะไม่มี header
 */
function withFramePolicy(res: NextResponse): NextResponse {
  res.headers.set('Content-Security-Policy',
    `frame-ancestors ${frameAncestors(process.env.FRAME_ANCESTORS)}`);
  // ลบของเดิมทิ้งให้แน่ใจ ถ้าเหลืออยู่มันจะบล็อกทับ CSP
  res.headers.delete('X-Frame-Options');
  return res;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ---------- 1) ปิดกั้นการเข้าถึงจากภายนอกด้วย IP allowlist ----------
  const allowlist = process.env.ALLOWED_IPS || '';
  const enforce = (process.env.ENFORCE_IP_ALLOWLIST ?? 'true') !== 'false';
  if (enforce && allowlist.trim() && !pathname.startsWith('/_next')) {
    const ip = clientIpFromHeaders(request.headers);
    if (!isIpAllowed(ip, allowlist)) {
      return withFramePolicy(new NextResponse(
        JSON.stringify({ error: 'ACCESS_DENIED', message: 'ไม่อนุญาตให้เข้าใช้งานจากเครือข่ายนี้' }),
        { status: 403, headers: { 'content-type': 'application/json; charset=utf-8' } }
      ));
    }
  }

  // ---------- 2) ป้องกัน CSRF ข้ามโดเมนสำหรับ mutation ----------
  if (request.method === 'POST') {
    const origin = request.headers.get('origin');
    const expected = process.env.APP_ORIGIN;
    if (origin && expected && !origin.startsWith(expected)) {
      return withFramePolicy(new NextResponse('Cross-origin request blocked', { status: 403 }));
    }
  }

  // ---------- 3) ตรวจสอบเซสชัน ----------
  const { response, user } = await updateSession(request);

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return withFramePolicy(NextResponse.redirect(url));
  }
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return withFramePolicy(NextResponse.redirect(url));
  }

  return withFramePolicy(response);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
