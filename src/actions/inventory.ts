'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext, can } from '@/lib/session';

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
