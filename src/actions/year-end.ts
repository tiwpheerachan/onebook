'use server';
import { revalidatePath } from 'next/cache';
import { getSessionContext, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';

/** ปิดบัญชีสิ้นปี — ตัวตรวจจริงอยู่ในฟังก์ชันฐานข้อมูล ที่นี่กันหน้าจอเรียกเปล่า ๆ */
export async function closeFiscalYear(year: number, note?: string) {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: t().ui.act.noSession };
  if (!can(ctx, 'period', 'lock')) return { ok: false, error: t().ui.yearEnd.noPermission };

  const supabase = createClient();
  const { data, error } = await supabase.rpc('close_fiscal_year', {
    p_company: ctx.company.id, p_year: year, p_note: note || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/accounting/year-end');
  revalidatePath('/reports/balance-sheet');
  return { ok: true, netProfit: Number((data as any)?.net_profit || 0) };
}

export async function reopenFiscalYear(year: number, reason: string) {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: t().ui.act.noSession };
  if (!can(ctx, 'period', 'unlock')) return { ok: false, error: t().ui.yearEnd.noPermission };
  if (!reason?.trim()) return { ok: false, error: t().ui.yearEnd.needReason };

  const supabase = createClient();
  const { error } = await supabase.rpc('reopen_fiscal_year', {
    p_company: ctx.company.id, p_year: year, p_reason: reason.trim(),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/accounting/year-end');
  revalidatePath('/reports/balance-sheet');
  return { ok: true };
}
