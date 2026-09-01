'use server';
import { revalidatePath } from 'next/cache';
import { getSessionContext, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';

export interface ApprovalRuleForm {
  id?: string;
  doc_kind?: string | null;
  min_amount: number;
  max_amount?: number | null;
  step_no: number;
  role_id: string;
  is_active?: boolean;
  note?: string | null;
}

/** ตั้งหรือแก้กฎการอนุมัติหนึ่งข้อ */
export async function saveApprovalRule(form: ApprovalRuleForm) {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: t().ui.act.noSession };
  if (!can(ctx, 'settings.roles', 'edit')) {
    return { ok: false, error: t().ui.approval.noPermission };
  }
  if (!form.role_id) return { ok: false, error: t().ui.approval.needRole };

  const min = Math.max(0, Number(form.min_amount) || 0);
  const max = form.max_amount == null || form.max_amount === ('' as any)
    ? null : Number(form.max_amount);
  if (max != null && !(max > min)) {
    return { ok: false, error: t().ui.approval.badRange };
  }

  const supabase = createClient();
  const row = {
    company_id: ctx.company.id,
    doc_kind: form.doc_kind || null,
    min_amount: min,
    max_amount: max,
    step_no: Math.min(10, Math.max(1, Number(form.step_no) || 1)),
    role_id: form.role_id,
    is_active: form.is_active !== false,
    note: form.note || null,
  };

  const { error } = form.id
    ? await supabase.from('approval_rules').update(row).eq('id', form.id)
    : await supabase.from('approval_rules').insert(row);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings/approval');
  return { ok: true };
}

export async function deleteApprovalRule(id: string) {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: t().ui.act.noSession };
  if (!can(ctx, 'settings.roles', 'edit')) {
    return { ok: false, error: t().ui.approval.noPermission };
  }
  const supabase = createClient();
  const { error } = await supabase.from('approval_rules').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings/approval');
  return { ok: true };
}

/** ส่งเอกสารเข้าสู่การอนุมัติตามกฎที่ใช้อยู่ */
export async function submitForApproval(documentId: string) {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: t().ui.act.noSession };
  if (!can(ctx, 'documents', 'edit')) return { ok: false, error: t().ui.act.noPermission };

  const supabase = createClient();
  const { data, error } = await supabase.rpc('submit_for_approval', { p_document: documentId });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/sales`);
  revalidatePath(`/purchase`);
  return { ok: true, steps: Number((data as any)?.steps || 0) };
}

/** อนุมัติหรือปฏิเสธขั้นที่ถึงคิวของผู้ใช้คนนี้ */
export async function decideApproval(documentId: string, approve: boolean, note?: string) {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: t().ui.act.noSession };
  if (!can(ctx, 'documents', 'approve')) return { ok: false, error: t().ui.docError.noApprove };

  const supabase = createClient();
  const { error } = await supabase.rpc('decide_approval', {
    p_document: documentId, p_approve: approve, p_note: note || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/sales`);
  revalidatePath(`/purchase`);
  return { ok: true };
}
