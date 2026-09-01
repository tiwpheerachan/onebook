'use server';
import { revalidatePath } from 'next/cache';
import { getSessionContext, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';

type Res = { ok: boolean; error?: string };
type Kind = 'rep' | 'zone';

const TABLE: Record<Kind, string> = { rep: 'sales_reps', zone: 'sales_zones' };

export async function saveSalesRef(kind: Kind, form: {
  id?: string;
  code: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  commission_rate?: number;
  is_active?: boolean;
}): Promise<Res> {
  const ctx = await getSessionContext();
  const L = t().ui.salesRep;
  if (!ctx || !can(ctx, 'contacts', form.id ? 'edit' : 'create')) return { ok: false, error: L.noPermission };

  const code = (form.code || '').trim().toUpperCase();
  const name = (form.name || '').trim();
  if (!code || !name) return { ok: false, error: L.codeRequired };

  const rate = Number(form.commission_rate) || 0;
  if (kind === 'rep' && (rate < 0 || rate > 100)) return { ok: false, error: L.rateRange };

  const row: Record<string, any> = {
    company_id: ctx.company.id, code, name,
    is_active: form.is_active !== false,
  };
  // เขตการขายไม่มีช่องติดต่อและค่าคอม ส่งไปจะโดนปฏิเสธเพราะคอลัมน์ไม่มี
  if (kind === 'rep') {
    row.phone = form.phone || null;
    row.email = form.email || null;
    row.commission_rate = rate;
  }

  const supabase = createClient();
  const { error } = form.id
    ? await supabase.from(TABLE[kind]).update(row).eq('id', form.id).eq('company_id', ctx.company.id)
    : await supabase.from(TABLE[kind]).insert(row);

  if (error) {
    if (error.code === '23505') return { ok: false, error: L.duplicate };
    return { ok: false, error: error.message };
  }

  revalidatePath('/settings/sales-reps');
  revalidatePath('/reports/by-sales-rep');
  return { ok: true };
}

export async function deleteSalesRef(kind: Kind, id: string): Promise<Res> {
  const ctx = await getSessionContext();
  const L = t().ui.salesRep;
  if (!ctx || !can(ctx, 'contacts', 'delete')) return { ok: false, error: L.noPermission };

  const supabase = createClient();
  const { error } = await supabase
    .from(TABLE[kind]).delete().eq('id', id).eq('company_id', ctx.company.id);

  // foreign key จากลูกค้าหรือเอกสารจะปฏิเสธเอง แปลให้ผู้ใช้อ่านออกและบอกทางออก
  if (error) {
    if (error.code === '23503') return { ok: false, error: L.inUse };
    return { ok: false, error: error.message };
  }

  revalidatePath('/settings/sales-reps');
  return { ok: true };
}
