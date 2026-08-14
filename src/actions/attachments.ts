'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext, can } from '@/lib/session';

const BUCKET = 'attachments';
const MAX_BYTES = 25 * 1024 * 1024;

/** ชนิดไฟล์ที่ยอมรับ — เอกสารทางบัญชีและรูปถ่ายสลิปเท่านั้น กันไฟล์รันได้หลุดเข้าระบบ */
const ALLOWED = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
]);

export interface AttachResult { ok: boolean; error?: string; id?: string }

/** ทำชื่อไฟล์ให้ปลอดภัยกับ storage แต่ยังอ่านออก (เก็บชื่อจริงไว้ในฐานข้อมูลแยกต่างหาก) */
function safeName(name: string): string {
  return name
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}._-]+/gu, '_')
    .replace(/_+/g, '_')
    .slice(-80);
}

export async function uploadAttachment(fd: FormData): Promise<AttachResult> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'documents', 'edit')) return { ok: false, error: 'คุณไม่มีสิทธิ์แนบไฟล์' };

  const documentId = String(fd.get('document_id') || '');
  const file = fd.get('file');
  if (!documentId) return { ok: false, error: 'ไม่พบเอกสารที่ต้องการแนบไฟล์' };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'กรุณาเลือกไฟล์' };
  if (file.size > MAX_BYTES) return { ok: false, error: 'ไฟล์ใหญ่เกิน 25 MB' };
  if (file.type && !ALLOWED.has(file.type)) {
    return { ok: false, error: 'รองรับเฉพาะ PDF รูปภาพ Excel และ CSV' };
  }

  const supabase = createClient();

  // ยืนยันว่าเอกสารอยู่ในบริษัทที่ผู้ใช้กำลังทำงานอยู่ ป้องกันการแนบข้ามบริษัท
  const { data: doc } = await supabase
    .from('documents')
    .select('id, company_id')
    .eq('id', documentId)
    .maybeSingle();
  if (!doc || doc.company_id !== ctx.company.id) return { ok: false, error: 'ไม่พบเอกสาร' };

  const path = `${ctx.company.id}/${documentId}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (upErr) return { ok: false, error: `อัปโหลดไม่สำเร็จ : ${upErr.message}` };

  const { data, error } = await supabase
    .from('attachments')
    .insert({
      company_id: ctx.company.id,
      document_id: documentId,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: ctx.userId,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    // บันทึกฐานข้อมูลไม่ผ่าน ต้องลบไฟล์ทิ้ง ไม่งั้นจะเหลือไฟล์ค้างที่ไม่มีใครอ้างถึง
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: error.message };
  }

  revalidatePath('/sales');
  revalidatePath('/purchase');
  return { ok: true, id: data?.id };
}

/** สร้างลิงก์ชั่วคราวสำหรับเปิดไฟล์ (bucket เป็นแบบปิด เข้าถึงตรงไม่ได้) */
export async function attachmentUrl(id: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน' };
  if (!can(ctx, 'documents', 'view')) return { ok: false, error: 'ไม่มีสิทธิ์เปิดไฟล์' };

  const supabase = createClient();
  const { data: row } = await supabase
    .from('attachments')
    .select('storage_path, company_id')
    .eq('id', id)
    .maybeSingle();
  if (!row) return { ok: false, error: 'ไม่พบไฟล์' };

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(row.storage_path, 300);
  if (error) return { ok: false, error: error.message };
  return { ok: true, url: data.signedUrl };
}

export async function deleteAttachment(id: string): Promise<AttachResult> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน' };
  if (!can(ctx, 'documents', 'delete')) return { ok: false, error: 'คุณไม่มีสิทธิ์ลบไฟล์แนบ' };

  const supabase = createClient();
  const { data: row } = await supabase
    .from('attachments')
    .select('storage_path')
    .eq('id', id)
    .maybeSingle();
  if (!row) return { ok: false, error: 'ไม่พบไฟล์' };

  const { error: rmErr } = await supabase.storage.from(BUCKET).remove([row.storage_path]);
  if (rmErr) return { ok: false, error: rmErr.message };

  const { error } = await supabase.from('attachments').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/sales');
  revalidatePath('/purchase');
  return { ok: true };
}
