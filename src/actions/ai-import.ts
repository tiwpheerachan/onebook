'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext, can } from '@/lib/session';
import { extractDocument, mapToDocument, isAicomConfigured } from '@/lib/aicom';

export interface Res {
  ok: boolean;
  error?: string;
  id?: string;
  notConfigured?: boolean;
  job?: any;
}

/** อัปโหลดเอกสารให้ AICOM อ่านและดึงข้อมูล แล้วเก็บเป็นงานรอตรวจ */
export async function uploadForExtraction(formData: FormData): Promise<Res> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'documents.ai_import', 'create')) return { ok: false, error: 'คุณไม่มีสิทธิ์นำเข้าเอกสารด้วย AI' };

  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) return { ok: false, error: 'กรุณาเลือกไฟล์' };
  if (file.size > 20 * 1024 * 1024) return { ok: false, error: 'ไฟล์ใหญ่เกิน 20 MB' };

  const supabase = createClient();
  const { data: job, error } = await supabase
    .from('ai_import_jobs')
    .insert({
      company_id: ctx.company.id,
      file_name: file.name,
      file_size: file.size,
      source: 'upload',
      status: isAicomConfigured() ? 'processing' : 'queued',
      created_by: ctx.userId,
    })
    .select('id')
    .maybeSingle();

  if (error || !job) return { ok: false, error: error?.message || 'สร้างงานไม่สำเร็จ' };

  if (!isAicomConfigured()) {
    await supabase
      .from('ai_import_jobs')
      .update({
        status: 'queued',
        error_message: 'ยังไม่ได้ตั้งค่า AICOM_API_URL — งานจะค้างอยู่ในคิวจนกว่าจะเชื่อมบริการ',
      })
      .eq('id', job.id);
    revalidatePath('/documents/ai-import');
    return {
      ok: false,
      id: job.id,
      notConfigured: true,
      error:
        'ยังไม่ได้เชื่อมบริการ AICOM — รัน AICOM (docker compose up) แล้วตั้งค่า AICOM_API_URL ใน .env.local ' +
        'ฝั่ง AICOM ต้องมี OPENAI_API_KEY ด้วย',
    };
  }

  const res = await extractDocument(file);

  if (!res.ok) {
    await supabase
      .from('ai_import_jobs')
      .update({ status: 'failed', error_message: res.error, processed_at: new Date().toISOString() })
      .eq('id', job.id);
    revalidatePath('/documents/ai-import');
    return { ok: false, id: job.id, error: res.error };
  }

  await supabase
    .from('ai_import_jobs')
    .update({
      status: 'review',
      detected_kind: res.detected_kind,
      confidence: res.confidence ?? null,
      extracted: res.extracted ?? null,
      mapped: mapToDocument(res.extracted),
      processed_at: new Date().toISOString(),
      error_message: null,
    })
    .eq('id', job.id);

  revalidatePath('/documents/ai-import');
  return { ok: true, id: job.id };
}

/** สร้างเอกสารจริงจากข้อมูลที่ตรวจแล้ว */
export async function createDocumentFromJob(jobId: string): Promise<Res> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'documents', 'create')) return { ok: false, error: 'คุณไม่มีสิทธิ์สร้างเอกสาร' };

  const supabase = createClient();
  const { data: job } = await supabase
    .from('ai_import_jobs')
    .select('id, mapped, status, document_id')
    .eq('id', jobId)
    .eq('company_id', ctx.company.id)
    .maybeSingle();

  if (!job) return { ok: false, error: 'ไม่พบงานนำเข้า' };
  if (job.document_id) return { ok: false, error: 'งานนี้สร้างเอกสารไปแล้ว' };
  const m = (job.mapped || {}) as any;
  if (!m.doc_date) return { ok: false, error: 'ข้อมูลที่ดึงมายังไม่มีวันที่เอกสาร กรุณาแก้ไขก่อน' };

  const { data: doc, error } = await supabase
    .from('documents')
    .insert({
      company_id: ctx.company.id,
      kind: m.kind || 'expense',
      doc_number: m.doc_number || `AI-${Date.now()}`,
      doc_date: m.doc_date,
      subtotal: m.subtotal || 0,
      vat_base: m.subtotal || 0,
      vat_amount: m.vat_amount || 0,
      grand_total: m.grand_total || 0,
      net_payable: m.grand_total || 0,
      status: 'draft',
      notes: 'สร้างจากการอ่านเอกสารด้วย AI — กรุณาตรวจก่อนอนุมัติ',
    })
    .select('id')
    .maybeSingle();

  if (error || !doc) return { ok: false, error: error?.message || 'สร้างเอกสารไม่สำเร็จ' };

  const lines = (m.lines || []).map((l: any, i: number) => ({
    document_id: doc.id,
    company_id: ctx.company.id,
    line_no: i + 1,
    description: l.description || '',
    quantity: l.quantity || 1,
    unit_price: l.unit_price || 0,
    line_amount: l.line_amount || 0,
  }));
  if (lines.length) await supabase.from('document_lines').insert(lines);

  await supabase
    .from('ai_import_jobs')
    .update({ status: 'imported', document_id: doc.id })
    .eq('id', jobId);

  revalidatePath('/documents/ai-import');
  return { ok: true, id: doc.id };
}

/** ทิ้งงานที่ไม่ต้องการ */
export async function discardJob(jobId: string): Promise<Res> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'documents.ai_import', 'edit')) return { ok: false, error: 'คุณไม่มีสิทธิ์ดำเนินการนี้' };

  const supabase = createClient();
  const { error } = await supabase
    .from('ai_import_jobs')
    .update({ status: 'discarded' })
    .eq('id', jobId)
    .eq('company_id', ctx.company.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/documents/ai-import');
  return { ok: true };
}
