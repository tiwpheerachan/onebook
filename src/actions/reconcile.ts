'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext, can } from '@/lib/session';
import type { BankLine } from '@/lib/bank-csv';

export interface Res {
  ok: boolean;
  error?: string;
  id?: string;
  matched?: number;
  summary?: any;
}

/** นำเข้ารายการเดินบัญชีจากไฟล์ statement แล้วจับคู่อัตโนมัติทันที */
export async function importStatement(form: {
  channel_id: string;
  file_name?: string;
  lines: BankLine[];
  auto_match?: boolean;
}): Promise<Res> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'finance.reconcile', 'edit')) return { ok: false, error: 'คุณไม่มีสิทธิ์กระทบยอดธนาคาร' };
  if (!form.channel_id) return { ok: false, error: 'กรุณาเลือกช่องทางการเงิน' };
  if (!form.lines?.length) return { ok: false, error: 'ไม่พบรายการในไฟล์' };

  const supabase = createClient();
  const dates = form.lines.map((l) => l.txn_date).sort();
  const last = form.lines[form.lines.length - 1];

  const { data: stmt, error: e1 } = await supabase
    .from('bank_statements')
    .insert({
      company_id: ctx.company.id,
      channel_id: form.channel_id,
      file_name: form.file_name || null,
      period_from: dates[0],
      period_to: dates[dates.length - 1],
      closing_balance: last?.balance ?? null,
      line_count: form.lines.length,
      imported_by: ctx.userId,
    })
    .select('id')
    .maybeSingle();

  if (e1 || !stmt) return { ok: false, error: e1?.message || 'บันทึก statement ไม่สำเร็จ' };

  const rows = form.lines.map((l, i) => ({
    company_id: ctx.company.id,
    statement_id: stmt.id,
    channel_id: form.channel_id,
    line_no: i + 1,
    txn_date: l.txn_date,
    description: l.description || null,
    reference: l.reference || null,
    deposit: l.deposit || 0,
    withdrawal: l.withdrawal || 0,
    balance: l.balance,
  }));

  const { error: e2 } = await supabase.from('bank_statement_lines').insert(rows);
  if (e2) {
    await supabase.from('bank_statements').delete().eq('id', stmt.id);
    return { ok: false, error: e2.message };
  }

  let matched = 0;
  if (form.auto_match !== false) {
    const { data } = await supabase.rpc('bank_auto_match', { p_statement: stmt.id, p_day_window: 5 });
    matched = Number(data || 0);
  }

  revalidatePath('/finance/reconcile');
  return { ok: true, id: stmt.id, matched };
}

/** สั่งจับคู่อัตโนมัติอีกครั้ง (เช่น หลังบันทึกรายการรับ-จ่ายเพิ่ม) */
export async function autoMatch(statementId: string, dayWindow = 5): Promise<Res> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'finance.reconcile', 'edit')) return { ok: false, error: 'คุณไม่มีสิทธิ์กระทบยอดธนาคาร' };

  const supabase = createClient();
  const { data, error } = await supabase.rpc('bank_auto_match', {
    p_statement: statementId,
    p_day_window: dayWindow,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/finance/reconcile');
  return { ok: true, matched: Number(data || 0) };
}

/** จับคู่เองทีละรายการ / ยกเลิกการจับคู่ / ทำเครื่องหมายไม่เกี่ยวข้อง */
export async function setLineMatch(form: {
  line_id: string;
  payment_id?: string | null;
  status: 'matched' | 'unmatched' | 'ignored';
  note?: string | null;
}): Promise<Res> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'finance.reconcile', 'edit')) return { ok: false, error: 'คุณไม่มีสิทธิ์กระทบยอดธนาคาร' };
  if (form.status === 'matched' && !form.payment_id) {
    return { ok: false, error: 'กรุณาเลือกรายการรับ-จ่ายเงินที่ต้องการจับคู่' };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('bank_statement_lines')
    .update({
      status: form.status,
      payment_id: form.status === 'matched' ? form.payment_id : null,
      match_score: form.status === 'matched' ? 100 : null,
      matched_by: form.status === 'unmatched' ? null : ctx.userId,
      matched_at: form.status === 'unmatched' ? null : new Date().toISOString(),
      note: form.note || null,
    })
    .eq('id', form.line_id)
    .eq('company_id', ctx.company.id);

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'รายการรับ-จ่ายเงินนี้ถูกจับคู่กับรายการอื่นแล้ว' };
    return { ok: false, error: error.message };
  }

  revalidatePath('/finance/reconcile');
  return { ok: true };
}

/** ปิดกระทบยอด ณ วันที่กำหนด (เก็บหลักฐานยอดคงเหลือทั้งสองฝั่งไว้ตรวจสอบย้อนหลัง) */
export async function closeReconciliation(form: {
  channel_id: string;
  as_of: string;
  note?: string | null;
}): Promise<Res> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'finance.reconcile', 'edit')) return { ok: false, error: 'คุณไม่มีสิทธิ์กระทบยอดธนาคาร' };

  const supabase = createClient();
  const { data: sum, error: e1 } = await supabase.rpc('rpt_bank_reconcile', {
    p_company: ctx.company.id,
    p_channel: form.channel_id,
    p_as_of: form.as_of,
  });
  if (e1) return { ok: false, error: e1.message };
  const s = (sum || {}) as any;

  const { error } = await supabase.from('bank_reconciliations').upsert(
    {
      company_id: ctx.company.id,
      channel_id: form.channel_id,
      as_of: form.as_of,
      statement_balance: s.statement_balance || 0,
      book_balance: s.book_balance || 0,
      difference: s.difference || 0,
      unmatched_bank: s.unmatched_bank_count || 0,
      unmatched_book: s.unmatched_book_count || 0,
      note: form.note || null,
      closed_by: ctx.userId,
    },
    { onConflict: 'company_id,channel_id,as_of' }
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath('/finance/reconcile');
  return { ok: true, summary: s };
}
