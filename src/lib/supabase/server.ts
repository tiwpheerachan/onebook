import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Next.js App Router แทนที่ fetch ของ global แล้วแคชคำขอแบบ GET ไว้เอง
 * ซึ่งทำให้การอ่านข้อมูลผ่าน Supabase ได้ค่าเก่าค้างอยู่ แม้ข้อมูลในฐานข้อมูลจะเปลี่ยนไปแล้ว
 * (เห็นชัดเมื่อผู้ใช้อีกคนหรืออีกบริษัทแก้ข้อมูล เพราะ revalidatePath ของเราไม่ครอบถึง)
 * ระบบบัญชีต้องเห็นตัวเลขล่าสุดเสมอ จึงสั่งไม่ให้แคชทุกคำขอ
 */
const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: 'no-store' });

export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: noStoreFetch },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            /* called from a Server Component - safe to ignore */
          }
        },
      },
    }
  );
}

/** ใช้เฉพาะงานระบบ (เช่น สร้างผู้ใช้) เท่านั้น ห้ามใช้ใน route ที่ผู้ใช้ควบคุม input ได้อิสระ */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    global: { fetch: noStoreFetch },
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
