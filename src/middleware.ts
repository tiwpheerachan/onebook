import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { isIpAllowed, clientIpFromHeaders } from '@/lib/ip-guard';
import { frameAncestors } from '@/lib/frame-policy';

// เส้นทางที่ต้องเข้าถึงได้ก่อนมีเซสชัน
//
// /api/auth ทั้งกลุ่มต้องอยู่ตรงนี้ ไม่งั้นการล็อกอินด้วย GoodHR จะพังทั้งวงจร
//   · start    ยังไม่มีเซสชันอยู่แล้วโดยธรรมชาติ
//   · callback เป็นขาที่กลับมาสร้างเซสชัน ถ้าโดนเด้งไป login ก่อนก็ไม่มีวันสร้างได้
//   · logout   ต้องผ่านเพื่อไปล้างคุกกี้ให้เรียบร้อย
const PUBLIC_PATHS = ['/login', '/blocked', '/_next', '/favicon.ico', '/api/health', '/api/auth'];

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
        JSON.stringify({ error: 'ACCESS_DENIED', message: 'This network is not allowed' }),
        { status: 403, headers: { 'content-type': 'application/json; charset=utf-8' } }
      ));
    }
  }

  // ---------- 2) ป้องกัน CSRF ข้ามโดเมนสำหรับ mutation ----------
  //
  // เทียบกับ "โฮสต์ที่ผู้ใช้เปิดอยู่จริง" เป็นหลัก ไม่ใช่เทียบกับ APP_ORIGIN อย่างเดียว
  //
  // เดิมเทียบกับ APP_ORIGIN ตรง ๆ ซึ่งพังทันทีเมื่อพอร์ตหรือโดเมนไม่ตรงกับที่ตั้งไว้
  // เช่นตั้ง APP_ORIGIN เป็น 3100 แต่รัน dev ที่ 3000 ทุก server action จะโดน 403
  // แล้วฝั่งหน้าเว็บจะได้ค่า undefined กลับไป เพราะ 403 ไม่ใช่รูปแบบที่ action อ่านได้
  // อาการที่เห็นคือ "Cannot read properties of undefined" ซึ่งชี้ต้นเหตุไม่ได้เลย
  //
  // การเทียบกับโฮสต์ของ request เองยังกัน CSRF ได้เท่าเดิม เพราะเว็บอื่นปลอม Origin ไม่ได้
  // และใช้ได้ทุกพอร์ตทุกโดเมนโดยไม่ต้องตั้งค่าเพิ่ม
  if (request.method === 'POST') {
    const origin = request.headers.get('origin');
    if (origin) {
      const host = request.headers.get('x-forwarded-host')?.split(',')[0].trim()
        || request.headers.get('host');
      const proto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim()
        || (request.nextUrl.protocol.replace(':', ''));

      const allowed = new Set<string>();
      if (host) allowed.add(`${proto}://${host}`);
      if (process.env.APP_ORIGIN) allowed.add(process.env.APP_ORIGIN.replace(/\/+$/, ''));
      // พอร์ทัลที่ฝังหน้าจอเราไว้ ก็ถือเป็นต้นทางที่เชื่อถือได้
      for (const a of (process.env.FRAME_ANCESTORS || '').split(/[\s,]+/)) {
        if (/^https?:\/\//.test(a)) allowed.add(a.replace(/\/+$/, ''));
      }

      if (!allowed.has(origin.replace(/\/+$/, ''))) {
        return withFramePolicy(new NextResponse('Cross-origin request blocked', { status: 403 }));
      }
    }
  }

  // ---------- 3) ตรวจสอบเซสชัน ----------
  const { response, user } = await updateSession(request);

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (!user && !isPublic) {
    // เส้นทาง API ต้องตอบเป็น JSON ไม่ใช่เด้งไปหน้า login
    // ถ้าเด้ง ฝั่งหน้าเว็บที่เรียกด้วย fetch จะได้ HTML แล้วแตกตอนแปลงเป็น JSON
    // กลายเป็นข้อความผิดพลาดที่ไม่เกี่ยวกับสาเหตุจริงเลย
    if (pathname.startsWith('/api/')) {
      return withFramePolicy(new NextResponse(
        JSON.stringify({ error: 'unauthorized' }),
        { status: 401, headers: { 'content-type': 'application/json; charset=utf-8' } }
      ));
    }
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
