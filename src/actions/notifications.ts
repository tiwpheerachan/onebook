'use server';
import { revalidatePath } from 'next/cache';
import { getSessionContext } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';

/** สแกนหาสิ่งที่ควรเตือน — กดซ้ำได้ ฐานข้อมูลกันสร้างซ้ำให้เอง */
export async function refreshNotifications() {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: t().ui.act.noSession };
  const supabase = createClient();
  const { data, error } = await supabase.rpc('generate_notifications', { p_company: ctx.company.id });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/notifications');
  return { ok: true, created: Number((data as any)?.created || 0) };
}

/** ทำเครื่องหมายอ่านแล้ว ไม่ส่ง ids = ทั้งหมดที่ตัวเองเห็น */
export async function markNotificationsRead(ids?: string[]) {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: t().ui.act.noSession };
  const supabase = createClient();
  const { error } = await supabase.rpc('mark_notifications_read', {
    p_company: ctx.company.id, p_ids: ids && ids.length ? ids : null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/notifications');
  return { ok: true };
}
