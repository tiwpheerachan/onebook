'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext, can } from '@/lib/session';
import { t } from '@/i18n/server';

export interface Res {
  ok: boolean;
  error?: string;
}

/** ปรับปรุงสต๊อก (นับสต๊อก / ของเสีย / ยอดยกมา) — บวกคือรับเข้า ลบคือตัดออก */
export async function adjustStock(form: {
  product_id: string;
  move_date: string;
  qty_delta: number;
  unit_cost?: number | null;
  note?: string | null;
}): Promise<Res> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'products.inventory', 'edit')) return { ok: false, error: 'คุณไม่มีสิทธิ์ปรับปรุงสต๊อก' };

  const qty = Number(form.qty_delta);
  if (!form.product_id) return { ok: false, error: 'กรุณาเลือกสินค้า' };
  if (!qty || Number.isNaN(qty)) return { ok: false, error: 'กรุณาระบุจำนวนที่ต้องการปรับ (บวก = รับเข้า, ลบ = ตัดออก)' };
  if (ctx.lockedThrough && form.move_date <= ctx.lockedThrough) {
    return { ok: false, error: `งวดบัญชีถูกปิด (freeze) ถึงวันที่ ${ctx.lockedThrough}` };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc('inv_adjust', {
    p_company: ctx.company.id,
    p_product: form.product_id,
    p_date: form.move_date,
    p_qty_delta: qty,
    p_unit_cost: form.unit_cost != null && form.unit_cost !== ('' as any) ? Number(form.unit_cost) : null,
    p_note: form.note || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/inventory');
  return { ok: true };
}

/* ─────────────────────────── คลังสินค้า ─────────────────────────── */

/** สร้างหรือแก้ไขคลัง — ตั้งเป็นคลังหลักได้ทีละหนึ่งแห่ง */
export async function saveWarehouse(form: {
  id?: string;
  code: string;
  name: string;
  address?: string;
  is_default?: boolean;
  is_active?: boolean;
}) {
  const ctx = await getSessionContext();
  const L = t().ui.warehouse;
  if (!ctx || !can(ctx, 'products.inventory', 'edit')) return { ok: false, error: L.noPermission };

  const code = (form.code || '').trim().toUpperCase();
  const name = (form.name || '').trim();
  if (!code || !name) return { ok: false, error: L.codeRequired };

  const supabase = createClient();

  // ปิดใช้คลังหลักไม่ได้ ไม่งั้นการรับของโดยไม่ระบุคลังจะไม่มีที่ลง
  if (form.id && form.is_active === false) {
    const { data: cur } = await supabase
      .from('warehouses').select('is_default').eq('id', form.id).maybeSingle();
    if (cur?.is_default) return { ok: false, error: L.cannotDeactivateDefault };
  }

  // ดัชนีบังคับให้มีคลังหลักได้แห่งเดียว จึงต้องปลดของเดิมก่อน
  if (form.is_default) {
    await supabase
      .from('warehouses')
      .update({ is_default: false })
      .eq('company_id', ctx.company.id)
      .eq('is_default', true);
  }

  const row = {
    company_id: ctx.company.id,
    code,
    name,
    address: form.address?.trim() || null,
    is_default: !!form.is_default,
    is_active: form.is_active !== false,
    updated_at: new Date().toISOString(),
  };

  const { error } = form.id
    ? await supabase.from('warehouses').update(row).eq('id', form.id).eq('company_id', ctx.company.id)
    : await supabase.from('warehouses').insert(row);

  if (error) {
    if (error.message.includes('duplicate key')) return { ok: false, error: L.duplicate };
    return { ok: false, error: error.message };
  }

  revalidatePath('/inventory');
  revalidatePath('/inventory/warehouses');
  return { ok: true };
}

/** โอนสินค้าระหว่างคลัง ต้นทุนยกตามไปด้วยตามวิธีเข้าก่อนออกก่อน */
export async function transferStock(form: {
  product_id: string;
  qty: number;
  from_id: string;
  to_id: string;
  date: string;
  note?: string;
}) {
  const ctx = await getSessionContext();
  const L = t().ui.warehouse;
  if (!ctx || !can(ctx, 'products.inventory', 'edit')) return { ok: false, error: L.noPermission };

  if (!(Number(form.qty) > 0)) return { ok: false, error: L.invalidQty };
  if (form.from_id === form.to_id) return { ok: false, error: L.sameWarehouse };

  const supabase = createClient();
  const { error } = await supabase.rpc('inv_transfer', {
    p_company: ctx.company.id,
    p_product: form.product_id,
    p_date: form.date,
    p_qty: Number(form.qty),
    p_from: form.from_id,
    p_to: form.to_id,
    p_note: form.note || null,
  });

  if (error) {
    if (error.message.includes('SAME_WAREHOUSE')) return { ok: false, error: L.sameWarehouse };
    if (error.message.includes('INVALID_QTY')) return { ok: false, error: L.invalidQty };
    if (error.message.includes('FORBIDDEN')) return { ok: false, error: L.noPermission };
    if (error.message.includes('PERIOD_LOCKED'))
      return { ok: false, error: 'งวดบัญชีถูกปิดแล้ว บันทึกรายการวันที่นี้ไม่ได้' };
    return { ok: false, error: error.message };
  }

  revalidatePath('/inventory');
  return { ok: true };
}
