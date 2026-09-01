'use server';
import { revalidatePath } from 'next/cache';
import { getSessionContext, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';

export interface RecurringLineForm {
  account_id: string;
  description?: string | null;
  debit: number;
  credit: number;
  dimension_id?: string | null;
}
export interface RecurringForm {
  id?: string;
  name: string;
  description: string;
  book?: string;
  frequency: string;
  day_of_month: number;
  start_date: string;
  end_date?: string | null;
  auto_reverse?: boolean;
  is_active?: boolean;
  lines: RecurringLineForm[];
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** ตั้งหรือแก้แม่แบบรายการซ้ำพร้อมบรรทัด */
export async function saveRecurring(form: RecurringForm) {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: t().ui.act.noSession };
  if (!can(ctx, 'journal', 'edit')) return { ok: false, error: t().ui.recurring.noPermission };

  const L = t().ui.recurring;
  if (!form.name?.trim()) return { ok: false, error: L.needName };
  if (!form.description?.trim()) return { ok: false, error: L.needDescription };

  const lines = (form.lines || []).filter((l) => l.account_id && (Number(l.debit) || Number(l.credit)));
  if (lines.length < 2) return { ok: false, error: L.needTwoLines };

  const dr = round2(lines.reduce((a, l) => a + (Number(l.debit) || 0), 0));
  const cr = round2(lines.reduce((a, l) => a + (Number(l.credit) || 0), 0));
  if (dr !== cr) return { ok: false, error: L.needBalanced };

  const supabase = createClient();
  const head = {
    company_id: ctx.company.id,
    name: form.name.trim(),
    description: form.description.trim(),
    book: form.book === 'ADJ' ? 'ADJ' : 'GL',
    frequency: ['monthly', 'quarterly', 'yearly'].includes(form.frequency) ? form.frequency : 'monthly',
    day_of_month: Math.min(31, Math.max(1, Number(form.day_of_month) || 1)),
    start_date: form.start_date,
    end_date: form.end_date || null,
    auto_reverse: !!form.auto_reverse,
    is_active: form.is_active !== false,
  };

  let id = form.id;
  if (id) {
    const { error } = await supabase.from('recurring_journals').update(head).eq('id', id);
    if (error) return { ok: false, error: error.message };
    await supabase.from('recurring_journal_lines').delete().eq('template_id', id);
  } else {
    // งวดแรกคือวันเริ่ม ระบบจะเลื่อนเองหลังสร้างรายการงวดนั้นแล้ว
    const { data, error } = await supabase.from('recurring_journals')
      .insert({ ...head, next_date: form.start_date, created_by: ctx.userId })
      .select('id').maybeSingle();
    if (error || !data) return { ok: false, error: error?.message || '' };
    id = data.id;
  }

  const { error: lineErr } = await supabase.from('recurring_journal_lines').insert(
    lines.map((l, i) => ({
      template_id: id,
      company_id: ctx.company.id,
      line_no: i + 1,
      account_id: l.account_id,
      description: l.description || null,
      debit: round2(l.debit),
      credit: round2(l.credit),
      dimension_id: l.dimension_id || null,
    }))
  );
  if (lineErr) return { ok: false, error: lineErr.message };

  revalidatePath('/accounting/recurring');
  return { ok: true };
}

export async function deleteRecurring(id: string) {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: t().ui.act.noSession };
  if (!can(ctx, 'journal', 'edit')) return { ok: false, error: t().ui.recurring.noPermission };
  const supabase = createClient();
  const { error } = await supabase.from('recurring_journals').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/accounting/recurring');
  return { ok: true };
}

export interface AmortForm {
  id?: string;
  name: string;
  prepaid_account_id: string;
  expense_account_id: string;
  dimension_id?: string | null;
  total_amount: number;
  months: number;
  start_date: string;
  is_active?: boolean;
  note?: string | null;
}

export async function saveAmortization(form: AmortForm) {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: t().ui.act.noSession };
  if (!can(ctx, 'journal', 'edit')) return { ok: false, error: t().ui.recurring.noPermission };

  const L = t().ui.recurring;
  if (!form.name?.trim()) return { ok: false, error: L.needName };
  if (!form.prepaid_account_id || !form.expense_account_id) {
    return { ok: false, error: L.needBalanced };
  }
  const total = Number(form.total_amount);
  if (!Number.isFinite(total) || total <= 0) return { ok: false, error: t().ui.budget.needAmount };

  const supabase = createClient();
  const row = {
    company_id: ctx.company.id,
    name: form.name.trim(),
    prepaid_account_id: form.prepaid_account_id,
    expense_account_id: form.expense_account_id,
    dimension_id: form.dimension_id || null,
    total_amount: round2(total),
    months: Math.min(600, Math.max(1, Number(form.months) || 1)),
    start_date: form.start_date,
    is_active: form.is_active !== false,
    note: form.note || null,
  };

  const { error } = form.id
    ? await supabase.from('amortizations').update(row).eq('id', form.id)
    : await supabase.from('amortizations').insert({ ...row, created_by: ctx.userId });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/accounting/recurring');
  return { ok: true };
}

export async function deleteAmortization(id: string) {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: t().ui.act.noSession };
  if (!can(ctx, 'journal', 'edit')) return { ok: false, error: t().ui.recurring.noPermission };
  const supabase = createClient();
  const { error } = await supabase.from('amortizations').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/accounting/recurring');
  return { ok: true };
}

/**
 * สร้างรายการที่ถึงกำหนดทั้งสองแบบ
 * กดซ้ำได้ ฐานข้อมูลจดงวดที่สร้างแล้วไว้จึงไม่มีทางได้รายการซ้ำ
 */
export async function runRecurring() {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: t().ui.act.noSession };
  if (!can(ctx, 'journal', 'post')) return { ok: false, error: t().ui.recurring.noPermission };

  const supabase = createClient();
  const [rec, amt] = await Promise.all([
    supabase.rpc('generate_recurring', { p_company: ctx.company.id }),
    supabase.rpc('generate_amortization', { p_company: ctx.company.id }),
  ]);
  if (rec.error) return { ok: false, error: rec.error.message };
  if (amt.error) return { ok: false, error: amt.error.message };

  const created = Number((rec.data as any)?.created || 0) + Number((amt.data as any)?.created || 0);
  const skipped = Number((rec.data as any)?.skipped || 0) + Number((amt.data as any)?.skipped || 0);
  const notes = [...((rec.data as any)?.notes || []), ...((amt.data as any)?.notes || [])];

  revalidatePath('/accounting/recurring');
  revalidatePath('/accounting/journal');
  return { ok: true, created, skipped, notes };
}
