'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext, can } from '@/lib/session';

export interface WhtResult { ok: boolean; id?: string; error?: string }

function translate(msg: string): string {
  if (msg.includes('NO_WHT')) return 'เอกสารนี้ไม่มีการหักภาษี ณ ที่จ่าย';
  if (msg.includes('ALREADY_ISSUED')) return 'เอกสารนี้ออกหนังสือรับรองไปแล้ว';
  if (msg.includes('DOC_VOID')) return 'เอกสารถูกยกเลิกแล้ว';
  if (msg.includes('FORBIDDEN')) return 'คุณไม่มีสิทธิ์ดำเนินการนี้';
  if (msg.includes('DOCUMENT_NOT_FOUND')) return 'ไม่พบเอกสาร';
  return msg;
}

/** ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) จากเอกสารฝั่งซื้อ */
export async function issueWhtCertificate(documentId: string, condition = 1): Promise<WhtResult> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'tax', 'create')) return { ok: false, error: 'คุณไม่มีสิทธิ์ออกหนังสือรับรอง' };

  const supabase = createClient();
  const { data, error } = await supabase.rpc('issue_wht_certificate', {
    p_document: documentId,
    p_condition: condition,
  });
  if (error) return { ok: false, error: translate(error.message) };

  revalidatePath('/tax/wht');
  return { ok: true, id: data as string };
}

export async function cancelWhtCertificate(certId: string): Promise<WhtResult> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'tax', 'edit')) return { ok: false, error: 'คุณไม่มีสิทธิ์ยกเลิกหนังสือรับรอง' };

  const supabase = createClient();
  const { error } = await supabase.rpc('cancel_wht_certificate', { p_cert: certId });
  if (error) return { ok: false, error: translate(error.message) };

  revalidatePath('/tax/wht');
  return { ok: true };
}
