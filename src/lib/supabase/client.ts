'use client';
import { createBrowserClient } from '@supabase/ssr';

/**
 * ตัวเชื่อม Supabase ฝั่งเบราว์เซอร์
 *
 * ตัวนี้เขียนคุกกี้เซสชันผ่าน document.cookie จากในหน้าเว็บ
 * ซึ่งเป็นคนละทางกับคุกกี้ที่เซิร์ฟเวอร์ตั้ง จึงต้องกำหนดนโยบายให้ตรงกันเอง
 *
 * ตอนถูกฝังในพอร์ทัล (iframe ข้ามโดเมน) ถ้ายังใช้ค่าเริ่มต้น
 * เบราว์เซอร์จะไม่ยอมเก็บคุกกี้ให้ ล็อกอินจะดูเหมือนสำเร็จแต่เข้าไม่ได้จริง
 *   - SameSite=None; Secure  ทำให้คุกกี้ใช้ข้ามไซต์ได้
 *   - Partitioned (CHIPS)    จำเป็นกับเบราว์เซอร์รุ่นใหม่ที่ปิดคุกกี้บุคคลที่สาม
 *     ผลคือเซสชันจะแยกกันระหว่างเปิดในพอร์ทัลกับเปิดแท็บตรง ซึ่งถูกต้องแล้ว
 *
 * ตรวจจากหน้าต่างจริงว่าถูกฝังอยู่ไหม แทนการอ่านค่าตั้งค่า
 * เพราะแอปเดียวกันถูกเปิดได้ทั้งสองแบบพร้อมกัน
 */
export function isEmbedded(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    // เข้าถึง window.top ไม่ได้ แปลว่าถูกฝังจากคนละโดเมนแน่นอน
    return true;
  }
}

export function createClient() {
  const embedded = isEmbedded();
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    embedded
      ? { cookieOptions: { sameSite: 'none', secure: true, partitioned: true, path: '/' } as any }
      : undefined
  );
}
