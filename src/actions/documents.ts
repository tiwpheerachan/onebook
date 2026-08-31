'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext, can } from '@/lib/session';
import { t } from '@/i18n/server';
import { calcDocument, type VatTreatment } from '@/lib/tax';
import { canConvert, NEEDS_DUE_DATE } from '@/lib/doc-flow';
import type { DocKind } from '@/lib/constants';

export interface LinePayload {
  product_id?: string | null;
  description: string;
  quantity: number;
  unit?: string | null;
  unit_price: number;
  discount_pct?: number;
  vat_treatment: VatTreatment;
  vat_rate?: number;
  wht_code?: string | null;
  wht_rate?: number;
  account_id?: string | null;
}

export interface DocPayload {
  id?: string | null;
  kind: string;
  doc_number?: string;
  doc_date: string;
  due_date?: string | null;
  contact_id?: string | null;
  reference?: string | null;
  notes?: string | null;
  discount_amount?: number;
  /** แผนก — ระบุที่หัวเอกสาร ทริกเกอร์ใน 0046 ส่งต่อลงบรรทัดให้เอง */
  dimension_id?: string | null;
  /** เอกสารต้นทางที่แปลงมา ใช้ตรวจสอบย้อนกลับ */
  ref_document_id?: string | null;
  lines: LinePayload[];
}

export interface ActionResult { ok: boolean; id?: string; doc_number?: string; error?: string }

export async function saveDocument(payload: DocPayload): Promise<ActionResult> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  const action = payload.id ? 'edit' : 'create';
  if (!can(ctx, 'documents', action)) return { ok: false, error: 'คุณไม่มีสิทธิ์ดำเนินการนี้' };

  if (ctx.lockedThrough && payload.doc_date <= ctx.lockedThrough) {
    return { ok: false, error: `งวดบัญชีถูกปิด (freeze) ถึงวันที่ ${ctx.lockedThrough}` };
  }
  if (!payload.lines || payload.lines.length === 0) {
    return { ok: false, error: 'ต้องมีรายการอย่างน้อย 1 บรรทัด' };
  }

  const supabase = createClient();
  const totals = calcDocument(payload.lines as any, payload.discount_amount || 0);

  let docNumber = payload.doc_number;
  if (!payload.id && !docNumber) {
    const { data, error } = await supabase.rpc('next_doc_number', {
      p_company: ctx.company.id, p_kind: payload.kind,
    });
    if (error) return { ok: false, error: error.message };
    docNumber = data as string;
  }

  let contactSnapshot: any = null;
  if (payload.contact_id) {
    const { data: c } = await supabase
      .from('contacts')
      .select('name, tax_id, branch_code, branch_name, address, district, province, postcode, phone')
      .eq('id', payload.contact_id)
      .maybeSingle();
    contactSnapshot = c;
  }

  const header = {
    company_id: ctx.company.id,
    kind: payload.kind,
    doc_number: docNumber,
    doc_date: payload.doc_date,
    due_date: payload.due_date || null,
    contact_id: payload.contact_id || null,
    contact_snapshot: contactSnapshot,
    reference: payload.reference || null,
    ref_document_id: payload.ref_document_id || null,
    notes: payload.notes || null,
    dimension_id: payload.dimension_id || null,
    subtotal: totals.subtotal,
    discount_amount: totals.discount_amount,
    vat_base: totals.vat_base,
    vat_amount: totals.vat_amount,
    wht_amount: totals.wht_amount,
    grand_total: totals.grand_total,
    net_payable: totals.net_payable,
  };

  let docId = payload.id || '';
  if (payload.id) {
    const { error } = await supabase.from('documents').update(header).eq('id', payload.id);
    if (error) return { ok: false, error: translate(error.message) };
    await supabase.from('document_lines').delete().eq('document_id', payload.id);
  } else {
    const { data, error } = await supabase
      .from('documents')
      .insert({ ...header, status: 'draft', created_by: ctx.userId })
      .select('id')
      .single();
    if (error) return { ok: false, error: translate(error.message) };
    docId = data.id;
  }

  const lineRows = payload.lines.map((l, i) => {
    const calc = calcDocument([l as any]);
    return {
      document_id: docId,
      company_id: ctx.company.id,
      line_no: i + 1,
      product_id: l.product_id || null,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit || null,
      unit_price: l.unit_price,
      discount_pct: l.discount_pct || 0,
      vat_treatment: l.vat_treatment,
      vat_rate: l.vat_rate ?? 7,
      wht_code: l.wht_code || null,
      wht_rate: l.wht_rate || 0,
      line_amount: calc.vat_base,
      vat_amount: calc.vat_amount,
      wht_amount: calc.wht_amount,
      account_id: l.account_id || null,
    };
  });

  const { error: lineErr } = await supabase.from('document_lines').insert(lineRows);
  if (lineErr) return { ok: false, error: translate(lineErr.message) };

  revalidatePath('/sales');
  revalidatePath('/purchase');
  return { ok: true, id: docId, doc_number: docNumber };
}

export async function approveDocument(id: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getSessionContext();
  if (!ctx || !can(ctx, 'documents', 'approve')) return { ok: false, error: t().ui.docError.noApprove };
  const supabase = createClient();
  const { error } = await supabase.rpc('post_document', { p_document: id });
  if (error) return { ok: false, error: translate(error.message) };
  revalidatePath('/sales');
  revalidatePath('/purchase');
  return { ok: true };
}

export async function voidDocument(id: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getSessionContext();
  if (!ctx || (!can(ctx, 'documents', 'void') && !can(ctx, 'documents', 'delete')))
    return { ok: false, error: t().ui.docError.noVoid };
  const supabase = createClient();
  const { error } = await supabase.rpc('void_document', { p_document: id, p_reason: reason });
  if (error) return { ok: false, error: translate(error.message) };
  revalidatePath('/sales');
  revalidatePath('/purchase');
  return { ok: true };
}

function translate(msg: string): string {
  const d = t();
  const E = d.ui.docError;
  if (msg.includes('PERIOD_LOCKED')) return E.periodLocked;
  if (msg.includes('FORBIDDEN')) return E.forbidden;
  if (msg.includes('DOC_LOCKED')) return E.docLocked;
  // ข้อความจากฐานข้อมูลมีชื่อลูกค้าและตัวเลขติดมาด้วย ซึ่งช่วยให้ตัดสินใจได้
  // จึงเก็บส่วนนั้นไว้ แล้วเติมคำอธิบายตามภาษาที่ผู้ใช้เลือกไว้ข้างหน้า
  if (msg.includes('CREDIT_LIMIT_EXCEEDED')) {
    const detail = msg.split('CREDIT_LIMIT_EXCEEDED:')[1]?.trim() || '';
    return `${d.ui.credit.exceeded}${detail ? ' — ' + detail : ''}`;
  }
  if (msg.includes('row-level security')) return E.rls;
  if (msg.includes('duplicate key')) return E.duplicate;
  return msg;
}

/**
 * แปลงเอกสารต่อเนื่อง เช่น ใบเสนอราคา -> ใบแจ้งหนี้ -> ใบกำกับภาษี -> ใบเสร็จรับเงิน
 * คัดลอกผู้ติดต่อและรายการทั้งหมดมาให้ แล้วเปิดเป็นฉบับร่างให้ตรวจก่อนอนุมัติ
 */
export async function convertDocument(sourceId: string, targetKind: DocKind): Promise<ActionResult> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'documents', 'create')) return { ok: false, error: 'คุณไม่มีสิทธิ์สร้างเอกสาร' };

  const supabase = createClient();
  const { data: src } = await supabase
    .from('documents')
    .select('id, kind, doc_number, doc_date, contact_id, reference, notes, discount_amount, status')
    .eq('id', sourceId)
    .maybeSingle();
  if (!src) return { ok: false, error: 'ไม่พบเอกสารต้นทาง' };

  if (src.status === 'void') return { ok: false, error: 'เอกสารที่ยกเลิกแล้วนำไปแปลงต่อไม่ได้' };
  if (!canConvert(src.kind as DocKind, targetKind)) {
    return { ok: false, error: 'ไม่รองรับการแปลงเอกสารคู่นี้' };
  }

  const { data: srcLines } = await supabase
    .from('document_lines')
    .select('product_id, description, quantity, unit, unit_price, discount_pct, vat_treatment, vat_rate, wht_code, wht_rate, account_id')
    .eq('document_id', sourceId)
    .order('line_no');
  if (!srcLines || srcLines.length === 0) return { ok: false, error: 'เอกสารต้นทางไม่มีรายการ' };

  const today = new Date().toISOString().slice(0, 10);

  // วันครบกำหนดคิดจากเครดิตเทอมของลูกค้า ณ ตอนแปลง ไม่ใช่ลอกจากใบเดิม
  let dueDate: string | null = null;
  if (NEEDS_DUE_DATE.includes(targetKind)) {
    let days = 30;
    if (src.contact_id) {
      const { data: c } = await supabase.from('contacts').select('credit_days').eq('id', src.contact_id).maybeSingle();
      if (c?.credit_days != null) days = Number(c.credit_days);
    }
    const due = new Date(today);
    due.setDate(due.getDate() + days);
    dueDate = due.toISOString().slice(0, 10);
  }

  return saveDocument({
    kind: targetKind,
    doc_date: today,
    due_date: dueDate,
    contact_id: src.contact_id,
    reference: src.doc_number,          // อ้างเลขที่เอกสารต้นทางไว้บนหน้าเอกสาร
    ref_document_id: src.id,
    notes: src.notes,
    discount_amount: Number(src.discount_amount || 0),
    lines: srcLines.map((l: any) => ({
      product_id: l.product_id,
      description: l.description,
      quantity: Number(l.quantity),
      unit: l.unit,
      unit_price: Number(l.unit_price),
      discount_pct: Number(l.discount_pct || 0),
      vat_treatment: l.vat_treatment,
      vat_rate: Number(l.vat_rate ?? 7),
      wht_code: l.wht_code,
      wht_rate: Number(l.wht_rate || 0),
      account_id: l.account_id,
    })),
  });
}
