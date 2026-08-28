'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext, can } from '@/lib/session';
import { t } from '@/i18n/server';

type Res = { ok: boolean; error?: string; id?: string };

export async function saveContact(form: any): Promise<Res> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน' };
  if (!can(ctx, 'contacts', form.id ? 'edit' : 'create')) return { ok: false, error: 'ไม่มีสิทธิ์' };
  const supabase = createClient();
  const row = {
    company_id: ctx.company.id,
    code: form.code,
    kind: form.kind,
    name: form.name,
    name_en: form.name_en || null,
    tax_id: form.tax_id || null,
    branch_code: form.branch_code || '00000',
    branch_name: form.branch_name || 'สำนักงานใหญ่',
    is_juristic: form.is_juristic ?? true,
    address: form.address || null,
    district: form.district || null,
    province: form.province || null,
    postcode: form.postcode || null,
    phone: form.phone || null,
    email: form.email || null,
    contact_person: form.contact_person || null,
    credit_days: Number(form.credit_days) || 0,
    credit_limit: Number(form.credit_limit) || 0,
    is_active: form.is_active ?? true,
  };
  const q = form.id
    ? await supabase.from('contacts').update(row).eq('id', form.id).select('id').single()
    : await supabase.from('contacts').insert({ ...row, created_by: ctx.userId }).select('id').single();
  if (q.error) return { ok: false, error: q.error.message };
  revalidatePath('/contacts');
  return { ok: true, id: q.data.id };
}

export async function saveProduct(form: any): Promise<Res> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน' };
  if (!can(ctx, 'products', form.id ? 'edit' : 'create')) return { ok: false, error: 'ไม่มีสิทธิ์' };
  const supabase = createClient();
  const row = {
    company_id: ctx.company.id,
    sku: form.sku,
    name: form.name,
    name_en: form.name_en || null,
    name_zh: form.name_zh || null,
    kind: form.kind || 'good',
    unit: form.unit || 'ชิ้น',
    category: form.category || null,
    sale_price: Number(form.sale_price) || 0,
    purchase_price: Number(form.purchase_price) || 0,
    vat_treatment: form.vat_treatment || 'exclusive',
    track_inventory: form.track_inventory ?? true,
    income_account_id: form.income_account_id || null,
    expense_account_id: form.expense_account_id || null,
    is_active: form.is_active ?? true,
  };
  // ผู้ใช้ที่มองไม่เห็นค่า ต้องไม่ทำให้ค่านั้นหายไปด้วย
  // หน้าจอส่งค่าว่างกลับมาเพราะไม่เคยได้รับค่าจริง ถ้าเขียนทับตรง ๆ ข้อมูลเดิมจะหาย
  if (form.id) {
    const { data: masked } = await supabase.rpc('rpt_masked_fields', {
      p_company: ctx.company.id, p_resource: 'products',
    });
    for (const f of (masked || []) as string[]) delete (row as any)[f];
  }

  const q = form.id
    ? await supabase.from('products').update(row).eq('id', form.id).select('id').single()
    : await supabase.from('products').insert(row).select('id').single();
  if (q.error) return { ok: false, error: q.error.message };
  revalidatePath('/products');
  return { ok: true, id: q.data.id };
}

export async function saveChannel(form: any): Promise<Res> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน' };
  if (!can(ctx, 'finance.channels', form.id ? 'edit' : 'create')) return { ok: false, error: 'ไม่มีสิทธิ์' };
  const supabase = createClient();
  const row = {
    company_id: ctx.company.id,
    code: form.code, name: form.name, kind: form.kind || 'bank',
    bank_name: form.bank_name || null, account_no: form.account_no || null,
    account_id: form.account_id || null,
    opening_balance: Number(form.opening_balance) || 0,
    is_active: form.is_active ?? true,
  };
  const q = form.id
    ? await supabase.from('financial_channels').update(row).eq('id', form.id).select('id').single()
    : await supabase.from('financial_channels').insert(row).select('id').single();
  if (q.error) return { ok: false, error: q.error.message };
  revalidatePath('/finance/channels');
  return { ok: true, id: q.data.id };
}

export async function saveAccount(form: any): Promise<Res> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน' };
  if (!can(ctx, 'accounting.coa', form.id ? 'edit' : 'create')) return { ok: false, error: 'ไม่มีสิทธิ์' };
  const supabase = createClient();
  const row = {
    company_id: ctx.company.id,
    code: form.code, name_th: form.name_th, name_en: form.name_en || null, name_zh: form.name_zh || null,
    type: form.type, parent_code: form.parent_code || null,
    is_header: form.is_header ?? false, normal_side: form.normal_side || 'D',
    is_active: form.is_active ?? true,
  };
  const q = form.id
    ? await supabase.from('accounts').update(row).eq('id', form.id).select('id').single()
    : await supabase.from('accounts').insert(row).select('id').single();
  if (q.error) return { ok: false, error: q.error.message };
  revalidatePath('/accounting/coa');
  return { ok: true, id: q.data.id };
}

/* ─────────────────────── กลุ่มผู้ติดต่อกำหนดเอง ─────────────────────── */

export async function saveContactGroup(form: { id?: string; name: string; color: string }): Promise<Res> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'contacts', 'edit')) return { ok: false, error: 'คุณไม่มีสิทธิ์จัดการกลุ่มผู้ติดต่อ' };
  const name = String(form.name || '').trim();
  if (!name) return { ok: false, error: 'กรุณาตั้งชื่อกลุ่ม' };

  const supabase = createClient();
  const row = { company_id: ctx.company.id, name, color: form.color || 'brand', created_by: ctx.userId };
  const q = form.id
    ? supabase.from('contact_groups').update({ name, color: row.color }).eq('id', form.id).select('id').maybeSingle()
    : supabase.from('contact_groups').insert(row).select('id').maybeSingle();

  const { data, error } = await q;
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'มีกลุ่มชื่อนี้อยู่แล้ว' };
    return { ok: false, error: error.message };
  }
  revalidatePath('/contacts');
  return { ok: true, id: data?.id };
}

export async function deleteContactGroup(id: string): Promise<Res> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'contacts', 'edit')) return { ok: false, error: 'คุณไม่มีสิทธิ์จัดการกลุ่มผู้ติดต่อ' };

  const supabase = createClient();
  const { error } = await supabase.from('contact_groups').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/contacts');
  return { ok: true };
}

/** ใส่/เอาผู้ติดต่อออกจากกลุ่มทีละหลายราย */
export async function assignContactGroup(
  groupId: string, contactIds: string[], attach: boolean
): Promise<Res & { count?: number }> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'contacts', 'edit')) return { ok: false, error: 'คุณไม่มีสิทธิ์จัดกลุ่มผู้ติดต่อ' };
  if (!contactIds.length) return { ok: false, error: 'ยังไม่ได้เลือกผู้ติดต่อ' };

  const supabase = createClient();
  const { data, error } = await supabase.rpc('set_contact_group', {
    p_group: groupId, p_contacts: contactIds, p_attach: attach,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/contacts');
  return { ok: true, count: Number(data) };
}

/**
 * ตั้งรอบการขายของลูกค้า
 *
 * ส่ง days = null คือเลิกตั้งเอง กลับไปใช้ค่าที่ระบบคำนวณจากประวัติ
 * ฝั่งฐานข้อมูลตรวจสิทธิ์ contacts.edit ให้อีกชั้นแล้ว
 */
export async function setContactCycle(form: {
  contact_id: string;
  days: number | null;
  is_regular?: boolean;
  note?: string;
}) {
  const ctx = await getSessionContext();
  if (!ctx || !can(ctx, 'contacts', 'edit')) {
    return { ok: false, error: 'ไม่มีสิทธิ์แก้ไขผู้ติดต่อ' };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc('set_contact_cycle', {
    p_contact: form.contact_id,
    p_days: form.days,
    p_regular: form.is_regular ?? null,
    p_note: form.note || null,
  });

  if (error) {
    if (error.message.includes('INVALID_CYCLE')) {
      return { ok: false, error: 'รอบการขายต้องอยู่ระหว่าง 1 ถึง 730 วัน' };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath('/contacts/cycles');
  revalidatePath('/dashboard');
  return { ok: true };
}

/* ─────────────────────────── กลุ่มสินค้า ─────────────────────────── */

export async function saveProductGroup(form: {
  id?: string;
  code: string;
  name: string;
  note?: string;
  income_account_id?: string;
  expense_account_id?: string;
  inventory_account_id?: string;
  cogs_account_id?: string;
  is_active?: boolean;
}) {
  const ctx = await getSessionContext();
  const L = t().ui.pgroup;
  if (!ctx || !can(ctx, 'products', 'edit')) return { ok: false, error: L.noPermission };

  const code = (form.code || '').trim().toUpperCase();
  const name = (form.name || '').trim();
  if (!code || !name) return { ok: false, error: L.codeRequired };

  const supabase = createClient();
  const row = {
    company_id: ctx.company.id,
    code, name,
    note: form.note?.trim() || null,
    income_account_id: form.income_account_id || null,
    expense_account_id: form.expense_account_id || null,
    inventory_account_id: form.inventory_account_id || null,
    cogs_account_id: form.cogs_account_id || null,
    is_active: form.is_active !== false,
    updated_at: new Date().toISOString(),
  };

  const { error } = form.id
    ? await supabase.from('product_groups').update(row).eq('id', form.id).eq('company_id', ctx.company.id)
    : await supabase.from('product_groups').insert(row);

  if (error) {
    if (error.message.includes('duplicate key')) return { ok: false, error: L.duplicate };
    return { ok: false, error: error.message };
  }
  revalidatePath('/products/groups');
  revalidatePath('/products');
  return { ok: true };
}

/** ใช้ผังบัญชีของกลุ่มกับสินค้าทั้งกลุ่ม — ต้องกดเอง ไม่ทำอัตโนมัติ */
export async function applyGroupAccounts(groupId: string, overwrite: boolean) {
  const ctx = await getSessionContext();
  const L = t().ui.pgroup;
  if (!ctx || !can(ctx, 'products', 'edit')) return { ok: false, error: L.noPermission };

  const supabase = createClient();
  const { data, error } = await supabase.rpc('apply_group_accounts', {
    p_group: groupId, p_overwrite: overwrite,
  });

  if (error) {
    if (error.message.includes('FORBIDDEN')) return { ok: false, error: L.noPermission };
    return { ok: false, error: error.message };
  }
  revalidatePath('/products/groups');
  revalidatePath('/products');
  return { ok: true, updated: (data as any)?.updated ?? 0 };
}
