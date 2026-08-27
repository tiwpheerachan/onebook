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

/* ─────────────────────────── ตรวจนับสินค้า ─────────────────────────── */

export async function openStockCount(form: { warehouse_id: string; date: string; note?: string }) {
  const ctx = await getSessionContext();
  const L = t().ui.count;
  if (!ctx || !can(ctx, 'products.inventory', 'edit')) return { ok: false, error: L.noPermission };

  const supabase = createClient();
  const { data, error } = await supabase.rpc('open_stock_count', {
    p_company: ctx.company.id,
    p_warehouse: form.warehouse_id,
    p_date: form.date,
    p_note: form.note || null,
  });

  if (error) {
    if (error.message.includes('COUNT_OPEN')) return { ok: false, error: L.alreadyOpen };
    if (error.message.includes('FORBIDDEN')) return { ok: false, error: L.noPermission };
    return { ok: false, error: error.message };
  }
  revalidatePath('/inventory/counts');
  return { ok: true, id: (data as any)?.id as string };
}

/** บันทึกยอดที่นับได้ — trigger ที่ฐานข้อมูลกันไม่ให้แก้ใบที่ยืนยันแล้วอีกชั้น */
export async function saveCountedQty(countId: string, lines: { id: string; counted_qty: number | null }[]) {
  const ctx = await getSessionContext();
  const L = t().ui.count;
  if (!ctx || !can(ctx, 'products.inventory', 'edit')) return { ok: false, error: L.noPermission };

  const supabase = createClient();
  for (const l of lines) {
    const { error } = await supabase
      .from('stock_count_lines')
      .update({ counted_qty: l.counted_qty })
      .eq('id', l.id)
      .eq('count_id', countId)
      .eq('company_id', ctx.company.id);
    if (error) {
      if (error.message.includes('COUNT_CONFIRMED')) return { ok: false, error: L.locked };
      return { ok: false, error: error.message };
    }
  }
  revalidatePath(`/inventory/counts/${countId}`);
  return { ok: true };
}

export async function confirmStockCount(countId: string) {
  const ctx = await getSessionContext();
  const L = t().ui.count;
  if (!ctx || !can(ctx, 'products.inventory', 'edit')) return { ok: false, error: L.noPermission };

  const supabase = createClient();
  const { data, error } = await supabase.rpc('confirm_stock_count', { p_count: countId });

  if (error) {
    if (error.message.includes('COUNT_NOT_OPEN') || error.message.includes('COUNT_RACE'))
      return { ok: false, error: L.notOpen };
    if (error.message.includes('PERIOD_LOCKED')) return { ok: false, error: L.periodLocked };
    if (error.message.includes('FORBIDDEN')) return { ok: false, error: L.noPermission };
    return { ok: false, error: error.message };
  }
  revalidatePath(`/inventory/counts/${countId}`);
  revalidatePath('/inventory');
  return { ok: true, result: data };
}

/* ─────────────────────────── ต้นทุนแฝง ─────────────────────────── */

export async function createLandedCost(form: {
  source_document_id: string;
  date: string;
  method: 'value' | 'qty' | 'weight';
  note?: string;
}) {
  const ctx = await getSessionContext();
  const L = t().ui.landed;
  if (!ctx || !can(ctx, 'products.inventory', 'edit')) return { ok: false, error: L.noPermission };
  if (!form.source_document_id) return { ok: false, error: L.noSource };

  const supabase = createClient();

  // เลขที่ใบรันตามเดือน เหมือนใบตรวจนับ
  const ym = form.date.slice(0, 7).replace('-', '');
  const { count } = await supabase
    .from('landed_costs')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', ctx.company.id)
    .gte('doc_date', `${form.date.slice(0, 7)}-01`);

  const docNumber = `LC-${ym}-${String((count || 0) + 1).padStart(3, '0')}`;

  const { data, error } = await supabase
    .from('landed_costs')
    .insert({
      company_id: ctx.company.id,
      doc_number: docNumber,
      doc_date: form.date,
      source_document_id: form.source_document_id,
      method: form.method,
      note: form.note || null,
      created_by: ctx.userId,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath('/inventory/landed-costs');
  return { ok: true, id: data.id as string };
}

export async function addLandedCharge(form: {
  landed_id: string;
  description: string;
  amount: number;
  account_id: string;
}) {
  const ctx = await getSessionContext();
  const L = t().ui.landed;
  if (!ctx || !can(ctx, 'products.inventory', 'edit')) return { ok: false, error: L.noPermission };
  if (!(Number(form.amount) > 0)) return { ok: false, error: L.amount };

  const supabase = createClient();
  const { error } = await supabase.from('landed_cost_charges').insert({
    landed_id: form.landed_id,
    company_id: ctx.company.id,
    description: form.description.trim(),
    amount: Number(form.amount),
    account_id: form.account_id,
  });

  if (error) {
    if (error.message.includes('LC_CONFIRMED')) return { ok: false, error: L.locked };
    return { ok: false, error: error.message };
  }
  revalidatePath(`/inventory/landed-costs/${form.landed_id}`);
  return { ok: true };
}

export async function removeLandedCharge(landedId: string, chargeId: string) {
  const ctx = await getSessionContext();
  const L = t().ui.landed;
  if (!ctx || !can(ctx, 'products.inventory', 'edit')) return { ok: false, error: L.noPermission };

  const supabase = createClient();
  const { error } = await supabase
    .from('landed_cost_charges').delete()
    .eq('id', chargeId).eq('landed_id', landedId).eq('company_id', ctx.company.id);

  if (error) {
    if (error.message.includes('LC_CONFIRMED')) return { ok: false, error: L.locked };
    return { ok: false, error: error.message };
  }
  revalidatePath(`/inventory/landed-costs/${landedId}`);
  return { ok: true };
}

export async function confirmLandedCost(landedId: string) {
  const ctx = await getSessionContext();
  const L = t().ui.landed;
  if (!ctx || !can(ctx, 'products.inventory', 'edit')) return { ok: false, error: L.noPermission };

  const supabase = createClient();
  const { data, error } = await supabase.rpc('confirm_landed_cost', { p_landed: landedId });

  if (error) {
    const m = error.message;
    if (m.includes('LC_NOT_DRAFT') || m.includes('LC_RACE')) return { ok: false, error: L.notDraft };
    if (m.includes('LC_NO_CHARGE')) return { ok: false, error: L.noCharge };
    if (m.includes('LC_NO_SOURCE')) return { ok: false, error: L.noSource };
    if (m.includes('LC_NO_BASIS')) return { ok: false, error: L.noBase };
    if (m.includes('PERIOD_LOCKED')) return { ok: false, error: L.periodLocked };
    if (m.includes('FORBIDDEN')) return { ok: false, error: L.noPermission };
    return { ok: false, error: m };
  }

  revalidatePath(`/inventory/landed-costs/${landedId}`);
  revalidatePath('/inventory');
  return { ok: true, result: data };
}

/* ─────────────────────────── การจองสินค้า ─────────────────────────── */

export async function reserveStock(form: {
  product_id: string;
  warehouse_id: string;
  qty: number;
  document_id?: string;
  expires_at?: string;
  note?: string;
}) {
  const ctx = await getSessionContext();
  const L = t().ui.reserve;
  if (!ctx || !can(ctx, 'products.inventory', 'edit')) return { ok: false, error: L.noPermission };
  if (!(Number(form.qty) > 0)) return { ok: false, error: L.invalidQty };

  const supabase = createClient();
  const { error } = await supabase.rpc('reserve_stock', {
    p_company: ctx.company.id,
    p_product: form.product_id,
    p_warehouse: form.warehouse_id,
    p_qty: Number(form.qty),
    p_document: form.document_id || null,
    p_expires: form.expires_at || null,
    p_note: form.note || null,
  });

  if (error) {
    const m = error.message;
    if (m.includes('NOT_ENOUGH')) return { ok: false, error: L.notEnough };
    if (m.includes('INVALID_QTY')) return { ok: false, error: L.invalidQty };
    if (m.includes('FORBIDDEN')) return { ok: false, error: L.noPermission };
    return { ok: false, error: m };
  }
  revalidatePath('/inventory');
  revalidatePath('/inventory/reservations');
  return { ok: true };
}

export async function releaseReservation(id: string, fulfilled: boolean) {
  const ctx = await getSessionContext();
  const L = t().ui.reserve;
  if (!ctx || !can(ctx, 'products.inventory', 'edit')) return { ok: false, error: L.noPermission };

  const supabase = createClient();
  const { error } = await supabase.rpc('release_reservation', {
    p_reservation: id, p_fulfilled: fulfilled,
  });

  if (error) {
    if (error.message.includes('NOT_ACTIVE')) return { ok: false, error: L.notActive };
    if (error.message.includes('FORBIDDEN')) return { ok: false, error: L.noPermission };
    return { ok: false, error: error.message };
  }
  revalidatePath('/inventory');
  revalidatePath('/inventory/reservations');
  return { ok: true };
}
