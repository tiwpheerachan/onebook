'use server';
import { revalidatePath } from 'next/cache';
import { getSessionContext, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';

type Res = { ok: boolean; error?: string };

/** แปลรหัสข้อผิดพลาดจากฐานข้อมูลเป็นข้อความตามภาษาที่ผู้ใช้เลือก */
function translate(msg: string): string {
  const L = t().ui.deposit;
  if (msg.includes('DEPOSIT_USED_UP')) return L.usedUp;
  if (msg.includes('OVER_DEPOSIT')) return L.overDeposit;
  if (msg.includes('OVER_PAYABLE')) return L.overPayable;
  if (msg.includes('CONTACT_MISMATCH')) return L.contactMismatch;
  if (msg.includes('WRONG_TARGET') || msg.includes('NOT_DEPOSIT')) return L.wrongTarget;
  if (msg.includes('TARGET_POSTED')) return L.targetPosted;
  if (msg.includes('FORBIDDEN')) return L.noPermission;
  return msg;
}

export async function applyDeposit(
  depositId: string, targetId: string, amount?: number | null,
): Promise<Res> {
  const ctx = await getSessionContext();
  if (!ctx || !can(ctx, 'documents', 'edit')) return { ok: false, error: t().ui.deposit.noPermission };

  const supabase = createClient();
  const { error } = await supabase.rpc('apply_deposit', {
    p_deposit: depositId, p_target: targetId,
    p_amount: amount ?? null, p_note: null,
  });
  if (error) return { ok: false, error: translate(error.message) };

  revalidatePath('/sales');
  revalidatePath('/purchase');
  return { ok: true };
}

export async function unapplyDeposit(applicationId: string): Promise<Res> {
  const ctx = await getSessionContext();
  if (!ctx || !can(ctx, 'documents', 'edit')) return { ok: false, error: t().ui.deposit.noPermission };

  const supabase = createClient();
  const { error } = await supabase.rpc('unapply_deposit', { p_application: applicationId });
  if (error) return { ok: false, error: translate(error.message) };

  revalidatePath('/sales');
  revalidatePath('/purchase');
  return { ok: true };
}
