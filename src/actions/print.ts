'use server';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/session';

/**
 * บันทึกว่ามีการพิมพ์เอกสาร แล้วคืนเลขฉบับที่พิมพ์
 * ใบกำกับภาษีที่พิมพ์ซ้ำต้องระบุว่าเป็น "สำเนา" ระบบจึงต้องเก็บประวัติไว้
 */
export async function recordPrint(documentId: string): Promise<{ ok: boolean; copyNo?: number; error?: string }> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };

  const supabase = createClient();
  const { data, error } = await supabase.rpc('record_document_print', { p_document: documentId });
  if (error) return { ok: false, error: error.message };
  return { ok: true, copyNo: Number(data) };
}
