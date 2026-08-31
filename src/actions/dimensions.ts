'use server';
import { revalidatePath } from 'next/cache';
import { getSessionContext, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';

type Res = { ok: boolean; error?: string };

export async function saveDimension(form: {
  id?: string;
  group_name: string;
  code: string;
  name: string;
  is_active?: boolean;
}): Promise<Res> {
  const ctx = await getSessionContext();
  const L = t().ui.dimension;
  if (!ctx || !can(ctx, 'settings.dimensions', form.id ? 'edit' : 'create')) {
    return { ok: false, error: L.noPermission };
  }

  const group_name = (form.group_name || '').trim() || L.title;
  const code = (form.code || '').trim().toUpperCase();
  const name = (form.name || '').trim();
  if (!code || !name) return { ok: false, error: L.codeRequired };

  const supabase = createClient();
  const row = {
    company_id: ctx.company.id,
    group_name, code, name,
    is_active: form.is_active !== false,
  };

  const { error } = form.id
    ? await supabase.from('dimensions').update(row).eq('id', form.id).eq('company_id', ctx.company.id)
    : await supabase.from('dimensions').insert(row);

  // ดัชนี unique (company_id, group_name, code) เป็นตัวกันซ้ำจริง แปลข้อความให้ผู้ใช้อ่านออก
  if (error) {
    if (error.code === '23505') return { ok: false, error: L.duplicate };
    return { ok: false, error: error.message };
  }

  revalidatePath('/settings/dimensions');
  revalidatePath('/reports/by-department');
  return { ok: true };
}

export async function deleteDimension(id: string): Promise<Res> {
  const ctx = await getSessionContext();
  const L = t().ui.dimension;
  if (!ctx || !can(ctx, 'settings.dimensions', 'delete')) {
    return { ok: false, error: L.noPermission };
  }

  const supabase = createClient();

  // เอกสารที่อ้างอยู่จะทำให้ foreign key ปฏิเสธ แต่ข้อความจากฐานข้อมูลอ่านไม่รู้เรื่อง
  // เช็คเองก่อนเพื่อบอกทางออกให้ผู้ใช้ว่าให้ปิดใช้งานแทน
  const { count } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', ctx.company.id)
    .eq('dimension_id', id);
  if ((count || 0) > 0) return { ok: false, error: L.inUse };

  const { error } = await supabase
    .from('dimensions').delete().eq('id', id).eq('company_id', ctx.company.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/dimensions');
  return { ok: true };
}
