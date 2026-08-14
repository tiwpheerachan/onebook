'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext, can } from '@/lib/session';

export interface Res {
  ok: boolean;
  error?: string;
  id?: string;
}

const num = (v: any, def = 0) => (v === '' || v == null || Number.isNaN(Number(v)) ? def : Number(v));

/** เพิ่ม / แก้ไขร้านค้าบนแพลตฟอร์ม */
export async function saveMarketplaceAccount(form: any): Promise<Res> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'settings.marketplace', form.id ? 'edit' : 'create')) {
    return { ok: false, error: 'คุณไม่มีสิทธิ์ตั้งค่าช่องทางขายออนไลน์' };
  }
  if (!form.shop_name) return { ok: false, error: 'กรุณาระบุชื่อร้าน' };

  const supabase = createClient();
  const row = {
    company_id: ctx.company.id,
    kind: form.kind || 'shopee',
    shop_name: String(form.shop_name).trim(),
    shop_ref: form.shop_ref || null,
    channel_id: form.channel_id || null,
    income_account_id: form.income_account_id || null,
    fee_account_id: form.fee_account_id || null,
    is_active: form.is_active !== false,
  };

  const q = form.id
    ? supabase.from('marketplace_accounts').update(row).eq('id', form.id).select('id').maybeSingle()
    : supabase.from('marketplace_accounts').insert(row).select('id').maybeSingle();

  const { data, error } = await q;
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'ร้านนี้ถูกเพิ่มไว้แล้ว' };
    return { ok: false, error: error.message };
  }

  revalidatePath('/settings/marketplace');
  return { ok: true, id: data?.id };
}

/**
 * บันทึกรอบโอนเงินของแพลตฟอร์ม
 * ตอนนี้กรอกเองหรือรับค่าจากงาน OCR ได้ เมื่อเชื่อม API ของแพลตฟอร์มแล้ว
 * ให้เรียกฟังก์ชันนี้จากตัวดึงข้อมูลอัตโนมัติได้เลยโดยไม่ต้องแก้ตรรกะลงบัญชี
 */
export async function saveSettlement(form: any): Promise<Res> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'documents', 'create')) return { ok: false, error: 'คุณไม่มีสิทธิ์บันทึกรอบโอนเงิน' };
  if (!form.account_id) return { ok: false, error: 'กรุณาเลือกร้าน' };

  const gross = num(form.gross_amount);
  const fee = num(form.fee_amount);
  const adj = num(form.adjustment);
  const net = form.net_amount === '' || form.net_amount == null ? gross - fee + adj : num(form.net_amount);

  const supabase = createClient();
  const { data, error } = await supabase
    .from('marketplace_settlements')
    .upsert(
      {
        company_id: ctx.company.id,
        account_id: form.account_id,
        settlement_ref: form.settlement_ref || null,
        period_from: form.period_from || null,
        period_to: form.period_to || null,
        paid_date: form.paid_date || null,
        gross_amount: gross,
        fee_amount: fee,
        adjustment: adj,
        net_amount: net,
        order_count: Math.round(num(form.order_count)),
        raw: form.raw || null,
        imported_by: ctx.userId,
      },
      { onConflict: 'company_id,account_id,settlement_ref' }
    )
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/marketplace');
  return { ok: true, id: data?.id };
}

/** ลงบัญชีรอบโอนเงิน : เดบิตเงินฝาก + ค่าธรรมเนียม / เครดิตรายได้ */
export async function postSettlement(settlementId: string): Promise<Res> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'documents', 'approve')) return { ok: false, error: 'คุณไม่มีสิทธิ์ลงบัญชี' };

  const supabase = createClient();
  const { data, error } = await supabase.rpc('post_marketplace_settlement', { p_settlement: settlementId });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/marketplace');
  return { ok: true, id: data as string };
}
