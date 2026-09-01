'use server';
import { revalidatePath } from 'next/cache';
import { getSessionContext, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';

type Res = { ok: boolean; error?: string; id?: string };

function translate(msg: string): string {
  const L = t().ui.payment;
  const E = t().ui.docError;
  if (msg.includes('NO_ALLOCATION')) return L.noAllocation;
  if (msg.includes('OVER_PAY')) return L.overPay;
  if (msg.includes('WRONG_SIDE')) return L.wrongSide;
  if (msg.includes('CONTACT_MISMATCH')) return L.contactMismatch;
  if (msg.includes('WHT_ALREADY_ON_DOC')) return L.whtOnDoc;
  if (msg.includes('CHANNEL_NOT_FOUND')) return L.channelMissing;
  if (msg.includes('ALREADY_VOID')) return L.alreadyVoid;
  if (msg.includes('PERIOD_LOCKED')) return E.periodLocked;
  if (msg.includes('FORBIDDEN')) return L.noPermission;
  if (msg.includes('duplicate key')) return E.duplicate;
  return msg;
}

export async function recordPayment(form: {
  direction: 'receive' | 'pay';
  doc_number: string;
  doc_date: string;
  contact_id: string;
  channel_id: string;
  allocations: { document_id: string; amount: number }[];
  wht?: number;
  fee?: number;
  note?: string | null;
}): Promise<Res> {
  const ctx = await getSessionContext();
  const L = t().ui.payment;
  if (!ctx || !can(ctx, 'finance.payments', 'create')) return { ok: false, error: L.noPermission };

  // กรองบรรทัดที่ยังไม่ได้กรอกจำนวนออกก่อน ไม่ให้ฐานข้อมูลปฏิเสธทั้งใบเพราะช่องว่าง
  const allocations = (form.allocations || [])
    .map((a) => ({ document_id: a.document_id, amount: Number(a.amount) || 0 }))
    .filter((a) => a.amount > 0);
  if (!allocations.length) return { ok: false, error: L.noAllocation };

  const supabase = createClient();
  const { data, error } = await supabase.rpc('record_payment', {
    p_company: ctx.company.id,
    p_direction: form.direction,
    p_doc_number: form.doc_number.trim(),
    p_doc_date: form.doc_date,
    p_contact: form.contact_id,
    p_channel: form.channel_id,
    p_allocations: allocations,
    p_wht: Number(form.wht) || 0,
    p_fee: Number(form.fee) || 0,
    p_note: form.note || null,
  });
  if (error) return { ok: false, error: translate(error.message) };

  revalidatePath('/finance/payments');
  revalidatePath('/sales');
  revalidatePath('/purchase');
  return { ok: true, id: (data as any)?.payment_id };
}

export async function voidPayment(paymentId: string, reason: string): Promise<Res> {
  const ctx = await getSessionContext();
  const L = t().ui.payment;
  if (!ctx || (!can(ctx, 'finance.payments', 'void') && !can(ctx, 'finance.payments', 'delete'))) {
    return { ok: false, error: L.noPermission };
  }
  const supabase = createClient();
  const { error } = await supabase.rpc('void_payment', { p_payment: paymentId, p_reason: reason });
  if (error) return { ok: false, error: translate(error.message) };

  revalidatePath('/finance/payments');
  return { ok: true };
}

export async function recalcPaymentBalances(): Promise<Res & { checked?: number; corrected?: number }> {
  const ctx = await getSessionContext();
  const L = t().ui.payment;
  if (!ctx || !can(ctx, 'finance.payments', 'edit')) return { ok: false, error: L.noPermission };

  const supabase = createClient();
  const { data, error } = await supabase.rpc('recalc_payment_balances', { p_company: ctx.company.id });
  if (error) return { ok: false, error: translate(error.message) };

  revalidatePath('/finance/payments');
  return { ok: true, checked: (data as any)?.checked, corrected: (data as any)?.corrected };
}
