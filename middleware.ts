import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { isIpAllowed, clientIpFromHeaders } from '@/lib/ip-guard';

const PUBLIC_PATHS = ['/login', '/blocked', '/_next', '/favicon.ico', '/api/health'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ---------- 1) ปิดกั้นการเข้าถึงจากภายนอกด้วย IP allowlist ----------
  const allowlist = process.env.ALLOWED_IPS || '';
  const enforce = (process.env.ENFORCE_IP_ALLOWLIST ?? 'true') !== 'false';
  if (enforce && allowlist.trim() && !pathname.startsWith('/_next')) {
    const ip = clientIpFromHeaders(request.headers);
    if (!isIpAllowed(ip, allowlist)) {
      return new NextResponse(
        JSON.stringify({ error: 'ACCESS_DENIED', message: 'ไม่อนุญาตให้เข้าใช้งานจากเครือข่ายนี้' }),
        { status: 403, headers: { 'content-type': 'application/json; charset=utf-8' } }
      );
    }
  }

  // ---------- 2) ป้องกัน CSRF ข้ามโดเมนสำหรับ mutation ----------
  if (request.method === 'POST') {
    const origin = request.headers.get('origin');
    const expected = process.env.APP_ORIGIN;
    if (origin && expected && !origin.startsWith(expected)) {
      return new NextResponse('Cross-origin request blocked', { status: 403 });
    }
  }

  // ---------- 3) ตรวจสอบเซสชัน ----------
  const { response, user } = await updateSession(request);

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
