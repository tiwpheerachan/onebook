'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext, can } from '@/lib/session';
import { t } from '@/i18n/server';

/**
 * ทะเบียนเช็ค
 *
 * การลงบัญชีทั้งหมดอยู่ที่ฐานข้อมูล ที่นี่แค่ตรวจสิทธิ์ชั้นแรกและแปลข้อความ error
 * ฐานข้อมูลตรวจซ้ำอีกชั้นเสมอ ยิง API ตรงก็ข้ามไม่ได้
 */
export async function saveCheque(form: {
  direction: 'receive' | 'pay';
  cheque_number: string;
  bank_name?: string;
  cheque_date?: string;
  due_date: string;
  amount: number;
  contact_id?: string;
  channel_id?: string;
  note?: string;
}) {
  const ctx = await getSessionContext();
  const L = t().ui.cheque;
  if (!ctx || !can(ctx, 'finance.payments', 'edit')) return { ok: false, error: L.noPermission };
  if (!(Number(form.amount) > 0)) return { ok: false, error: L.amount };
  if (!form.cheque_number.trim() || !form.due_date) return { ok: false, error: L.number };

  const supabase = createClient();
  const { error } = await supabase.from('cheques').insert({
    company_id: ctx.company.id,
    direction: form.direction,
    cheque_number: form.cheque_number.trim(),
    bank_name: form.bank_name?.trim() || null,
    cheque_date: form.cheque_date || null,
    due_date: form.due_date,
    amount: Number(form.amount),
    contact_id: form.contact_id || null,
    channel_id: form.channel_id || null,
    note: form.note?.trim() || null,
    created_by: ctx.userId,
  });

  if (error) {
    if (error.message.includes('duplicate key')) return { ok: false, error: L.duplicate };
    return { ok: false, error: error.message };
  }
  revalidatePath('/finance/cheques');
  revalidatePath('/finance');
  return { ok: true };
}

export async function clearCheque(id: string, date: string, channelId?: string) {
  const ctx = await getSessionContext();
  const L = t().ui.cheque;
  if (!ctx || !can(ctx, 'finance.payments', 'edit')) return { ok: false, error: L.noPermission };

  const supabase = createClient();
  const { error } = await supabase.rpc('clear_cheque', {
    p_cheque: id, p_date: date, p_channel: channelId || null,
  });

  if (error) {
    const m = error.message;
    if (m.includes('CHEQUE_NOT_PENDING') || m.includes('CHEQUE_RACE')) return { ok: false, error: L.notPending };
    if (m.includes('NO_CHANNEL')) return { ok: false, error: L.noChannel };
    if (m.includes('PERIOD_LOCKED')) return { ok: false, error: L.periodLocked };
    if (m.includes('FORBIDDEN')) return { ok: false, error: L.noPermission };
    return { ok: false, error: m };
  }
  revalidatePath('/finance/cheques');
  revalidatePath('/finance');
  return { ok: true };
}

export async function bounceCheque(id: string, date: string, reason: string) {
  const ctx = await getSessionContext();
  const L = t().ui.cheque;
  if (!ctx || !can(ctx, 'finance.payments', 'edit')) return { ok: false, error: L.noPermission };
  if (!reason.trim()) return { ok: false, error: L.needReason };

  const supabase = createClient();
  const { error } = await supabase.rpc('bounce_cheque', {
    p_cheque: id, p_date: date, p_reason: reason.trim(),
  });

  if (error) {
    const m = error.message;
    if (m.includes('CHEQUE_NOT_PENDING') || m.includes('CHEQUE_RACE')) return { ok: false, error: L.notPending };
    if (m.includes('NEED_REASON')) return { ok: false, error: L.needReason };
    if (m.includes('PERIOD_LOCKED')) return { ok: false, error: L.periodLocked };
    if (m.includes('FORBIDDEN')) return { ok: false, error: L.noPermission };
    return { ok: false, error: m };
  }
  revalidatePath('/finance/cheques');
  revalidatePath('/finance');
  return { ok: true };
}
