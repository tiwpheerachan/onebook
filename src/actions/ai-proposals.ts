'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext, can } from '@/lib/session';
import { t } from '@/i18n/server';
import { approveDocument, voidDocument } from './documents';
import { EDITABLE_FIELDS, PERM_FOR, type Proposal, type EditableField } from '@/lib/ai-actions';

/**
 * ลงมือทำตามข้อเสนอของ AI หลังคนกดยืนยัน
 *
 * จุดสำคัญ : ไม่เชื่อ payload ที่ส่งมาจากหน้าจอแม้แต่ค่าเดียว
 * เพราะมันเดินทางผ่านเบราว์เซอร์มา ใครแก้ระหว่างทางก็ได้
 * ทุกอย่างถูกตรวจใหม่จากฐานข้อมูลตรงนี้อีกรอบ
 *   1) ผู้ใช้มีสิทธิ์ทำสิ่งนี้กับบริษัทนี้จริงไหม
 *   2) เอกสารอยู่ในบริษัทที่ผู้ใช้เลือกอยู่จริงไหม
 *   3) เอกสารถูกคนอื่นแก้ไประหว่างที่ยังไม่กดยืนยันหรือเปล่า
 *   4) ฟิลด์ที่จะแก้อยู่ในบัญชีขาวหรือเปล่า
 * ส่วนงวดที่ปิดแล้วกับ RLS ฐานข้อมูลกันให้อีกชั้นอยู่แล้ว
 */
export async function confirmProposal(p: Proposal): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getSessionContext();
  const d = t();
  const L = d.ui.propose;
  if (!ctx) return { ok: false, error: L.noPermission };

  const perm = PERM_FOR[p.action];
  if (!perm || !can(ctx, perm.resource, perm.action)) return { ok: false, error: L.noPermission };

  const supabase = createClient();

  // อ่านเอกสารของจริงมาเทียบ — กันทั้งการยิงข้ามบริษัทและเอกสารที่เปลี่ยนไปแล้ว
  const { data: doc } = await supabase
    .from('documents')
    .select('id, company_id, status, updated_at')
    .eq('id', p.document_id)
    .eq('company_id', ctx.company.id)
    .maybeSingle();

  if (!doc) return { ok: false, error: L.noDocument };

  // เอกสารถูกแก้หลังจาก AI เสนอ ให้ยกเลิกแล้วเสนอใหม่ ปลอดภัยกว่าทับของใหม่
  if (p.expected_updated_at && doc.updated_at !== p.expected_updated_at) {
    return { ok: false, error: L.changedSince };
  }

  let result: { ok: boolean; error?: string };

  if (p.action === 'approve') {
    result = await approveDocument(p.document_id);
  } else if (p.action === 'void') {
    const reason = (p.reason || '').trim();
    if (reason.length < 3) return { ok: false, error: L.needReason };
    result = await voidDocument(p.document_id, reason);
  } else if (p.action === 'update_fields') {
    // กรองซ้ำที่ฝั่งเซิร์ฟเวอร์ ไม่ใช้บัญชีขาวที่ส่งมาจากหน้าจอ
    const patch: Record<string, unknown> = {};
    for (const c of p.changes || []) {
      if (!EDITABLE_FIELDS.includes(c.field as EditableField)) continue;
      patch[c.field] = c.to === '' ? null : c.to;
    }
    if (Object.keys(patch).length === 0) return { ok: false, error: L.noChange };

    patch.updated_at = new Date().toISOString();
    const { error } = await supabase
      .from('documents')
      .update(patch)
      .eq('id', p.document_id)
      .eq('company_id', ctx.company.id);

    result = error ? { ok: false, error: error.message } : { ok: true };
  } else {
    return { ok: false, error: L.unsupported };
  }

  if (!result.ok) return result;

  // บันทึกไว้ว่ารายการนี้มาจากข้อเสนอของ AI ไม่ใช่คนกดเองตั้งแต่ต้น
  // ตอนตรวจสอบย้อนหลังจะแยกออกได้ว่าอะไรเกิดจากทางไหน
  await supabase.from('audit_logs').insert({
    company_id: ctx.company.id,
    user_id: ctx.userId,
    user_email: ctx.email,
    action: 'update',
    resource: `documents.ai_${p.action}`,
    record_id: p.document_id,
    after_data: {
      via: 'ai_proposal',
      confirmed_by: ctx.email,
      rationale: p.rationale,
      reason: p.reason ?? null,
      changes: p.changes ?? null,
    },
  });

  revalidatePath('/sales');
  revalidatePath('/purchase');
  revalidatePath(`/documents/trace/${p.document_id}`);
  return { ok: true };
}
