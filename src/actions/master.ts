'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext, can } from '@/lib/session';

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
