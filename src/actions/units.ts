'use server';
import { revalidatePath } from 'next/cache';
import { getSessionContext, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';

export interface UnitForm {
  id?: string;
  product_id: string;
  code: string;
  factor: number;
  barcode?: string | null;
  sale_price?: number | null;
  is_active?: boolean;
}

/** เพิ่มหรือแก้หน่วยบรรจุของสินค้า — หน่วยฐานแก้ที่หน้าสินค้า ไม่ใช่ที่นี่ */
export async function saveProductUnit(form: UnitForm) {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: t().ui.act.noSession };
  if (!can(ctx, 'products', 'edit')) return { ok: false, error: t().ui.unitMgr.noPermission };

  const L = t().ui.unitMgr;
  const code = String(form.code || '').trim();
  if (!code) return { ok: false, error: L.needCode };
  const factor = Number(form.factor);
  if (!Number.isFinite(factor) || factor <= 0) return { ok: false, error: L.needFactor };

  const supabase = createClient();
  const row = {
    company_id: ctx.company.id,
    product_id: form.product_id,
    code,
    factor,
    barcode: form.barcode || null,
    sale_price: form.sale_price == null || (form.sale_price as any) === '' ? null : Number(form.sale_price),
    is_active: form.is_active !== false,
  };

  const { error } = form.id
    ? await supabase.from('product_units').update(row).eq('id', form.id)
    : await supabase.from('product_units').insert(row);
  if (error) {
    if (error.code === '23505') return { ok: false, error: L.duplicate };
    return { ok: false, error: error.message };
  }
  revalidatePath(`/inventory/${form.product_id}`);
  revalidatePath('/products');
  return { ok: true };
}

export async function deleteProductUnit(id: string, productId: string) {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: t().ui.act.noSession };
  if (!can(ctx, 'products', 'edit')) return { ok: false, error: t().ui.unitMgr.noPermission };
  const supabase = createClient();
  // หน่วยฐานลบไม่ได้ เพราะทุกอย่างอ้างอิงจากมัน
  const { error } = await supabase.from('product_units').delete().eq('id', id).eq('is_base', false);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/inventory/${productId}`);
  return { ok: true };
}
