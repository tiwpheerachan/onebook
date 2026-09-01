'use server';
import { revalidatePath } from 'next/cache';
import { getSessionContext, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';

export interface BudgetForm {
  id?: string;
  account_id: string;
  dimension_id?: string | null;
  fiscal_year: number;
  month?: number | null;
  amount: number;
  note?: string | null;
}

/**
 * ตั้งหรือแก้งบประมาณหนึ่งช่อง
 *
 * ไม่รับ company_id จากเบราว์เซอร์ ใช้บริษัทที่อยู่ในเซสชันเสมอ
 * และ RLS ของตาราง budgets ตรวจสิทธิ์ซ้ำอีกชั้นที่ฐานข้อมูล
 */
export async function saveBudget(form: BudgetForm) {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: t().ui.act.noSession };
  const action = form.id ? 'edit' : 'create';
  if (!can(ctx, 'accounting.budget', action)) {
    return { ok: false, error: t().ui.budget.noPermission };
  }
  if (!form.account_id) return { ok: false, error: t().ui.budget.needAccount };

  const amount = Number(form.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: t().ui.budget.needAmount };
  }

  const supabase = createClient();
  const row = {
    company_id: ctx.company.id,
    account_id: form.account_id,
    dimension_id: form.dimension_id || null,
    fiscal_year: Number(form.fiscal_year),
    month: form.month ? Number(form.month) : null,
    amount,
    note: form.note || null,
  };

  const { error } = form.id
    ? await supabase.from('budgets').update(row).eq('id', form.id)
    : await supabase.from('budgets').insert({ ...row, created_by: ctx.userId });

  // 23505 = ตั้งงบช่องนี้ไว้แล้ว ให้ไปแก้รายการเดิมแทนการสร้างซ้ำ
  if (error) {
    if (error.code === '23505') return { ok: false, error: t().ui.budget.duplicate };
    return { ok: false, error: error.message };
  }
  revalidatePath('/accounting/budget');
  return { ok: true };
}

export async function deleteBudget(id: string) {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: t().ui.act.noSession };
  if (!can(ctx, 'accounting.budget', 'delete')) {
    return { ok: false, error: t().ui.budget.noPermission };
  }
  const supabase = createClient();
  const { error } = await supabase.from('budgets').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/accounting/budget');
  return { ok: true };
}
