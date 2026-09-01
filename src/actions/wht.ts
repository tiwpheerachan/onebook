'use server';
import { revalidatePath } from 'next/cache';
import { t } from '@/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext, can } from '@/lib/session';

export interface WhtResult { ok: boolean; id?: string; error?: string }

function translate(msg: string): string {
  if (msg.includes('NO_WHT')) return t().ui.act.whtNone;
  if (msg.includes('ALREADY_ISSUED')) return t().ui.act.whtAlreadyIssued;
  if (msg.includes('DOC_VOID')) return t().ui.act.docVoided;
  if (msg.includes('FORBIDDEN')) return t().ui.act.noPermission;
  if (msg.includes('DOCUMENT_NOT_FOUND')) return t().ui.act.docNotFound;
  return msg;
}

/** ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) จากเอกสารฝั่งซื้อ */
export async function issueWhtCertificate(documentId: string, condition = 1): Promise<WhtResult> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: t().ui.act.noSession };
  if (!can(ctx, 'tax', 'create')) return { ok: false, error: t().ui.act.whtNoIssue };

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
  if (!ctx) return { ok: false, error: t().ui.act.noSession };
  if (!can(ctx, 'tax', 'edit')) return { ok: false, error: t().ui.act.whtNoCancel };

  const supabase = createClient();
  const { error } = await supabase.rpc('cancel_wht_certificate', { p_cert: certId });
  if (error) return { ok: false, error: translate(error.message) };

  revalidatePath('/tax/wht');
  return { ok: true };
}
