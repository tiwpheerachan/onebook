'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/session';
import { setLocaleAction } from './session';
import type { Locale } from '@/i18n/config';
import { LOCALES } from '@/i18n/config';

/**
 * แก้โปรไฟล์ของตัวเอง
 *
 * ไม่ต้องเช็คสิทธิ์เพิ่ม เพราะ RLS ของ profiles ยอมให้แก้ได้เฉพาะแถวของตัวเองอยู่แล้ว
 * และตั้งใจไม่ให้แก้ email / role / is_group_admin จากหน้านี้ —
 * สามอย่างนั้นเป็นเรื่องของสิทธิ์ ต้องให้ผู้ดูแลเปลี่ยนที่หน้าผู้ใช้และสิทธิ์
 */
export async function updateMyProfile(form: {
  full_name: string;
  phone?: string;
  locale?: string;
}) {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ยังไม่ได้เข้าสู่ระบบ' };

  const name = (form.full_name || '').trim();
  if (name.length < 2) return { ok: false, error: 'กรุณากรอกชื่อ-นามสกุลอย่างน้อย 2 ตัวอักษร' };
  if (name.length > 120) return { ok: false, error: 'ชื่อยาวเกินไป' };

  const phone = (form.phone || '').trim();
  if (phone && !/^[0-9+\-() ]{6,25}$/.test(phone)) {
    return { ok: false, error: 'รูปแบบเบอร์โทรไม่ถูกต้อง' };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: name, phone: phone || null, updated_at: new Date().toISOString() })
    .eq('id', ctx.userId);

  if (error) return { ok: false, error: error.message };

  if (form.locale && LOCALES.includes(form.locale as Locale)) {
    await setLocaleAction(form.locale as Locale);
  }

  revalidatePath('/settings/profile');
  revalidatePath('/', 'layout');
  return { ok: true };
}
