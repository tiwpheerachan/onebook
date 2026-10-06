'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext, can } from '@/lib/session';
import { t } from '@/i18n/server';
import { fetchApprovedPurchaseRequests } from '@/lib/oa';
import { saveDocument } from './documents';

export interface OaImportResult {
  ok: boolean;
  error?: string;
  imported?: number;
  skipped?: number;
}

/**
 * นำเข้าคำขอซื้อที่อนุมัติแล้วจาก OA → สร้าง "ใบขอซื้อ" ฉบับร่างใน ONEBOOK
 * สร้างเป็นร่างเสมอ เพื่อให้เข้าสู่กระบวนการปกติ (ร่าง → อนุมัติ → PO → รับของ → ตั้งหนี้)
 * กันซ้ำด้วย reference = เลขที่เอกสาร OA
 */
export async function importPurchaseRequestsFromOA(): Promise<OaImportResult> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: t().ui.act.noSession };
  if (!can(ctx, 'documents', 'create')) return { ok: false, error: t().ui.act.noPermission };

  let reqs;
  try {
    reqs = await fetchApprovedPurchaseRequests();
  } catch (e: any) {
    const msg = e?.message === 'OA_NOT_CONFIGURED' ? t().ui.oaImport.notConfigured : String(e?.message || e);
    return { ok: false, error: msg };
  }

  const supabase = createClient();
  let imported = 0;
  let skipped = 0;

  for (const r of reqs) {
    // เคยนำเข้าแล้วหรือยัง (อ้างด้วยเลขที่ OA ในช่อง reference)
    const { data: dup } = await supabase
      .from('documents')
      .select('id')
      .eq('company_id', ctx.company.id)
      .eq('kind', 'purchase_request')
      .eq('reference', r.docNo)
      .maybeSingle();
    if (dup) { skipped++; continue; }

    // จับคู่ผู้ขายจากชื่อ ถ้าไม่เจอปล่อยว่างให้ผู้ใช้เลือกตอนตรวจ (ไม่สร้าง contact อัตโนมัติ)
    let contactId: string | null = null;
    if (r.vendor) {
      const { data: c } = await supabase
        .from('contacts')
        .select('id')
        .eq('company_id', ctx.company.id)
        .ilike('name', r.vendor)
        .limit(1)
        .maybeSingle();
      contactId = c?.id ?? null;
    }

    const noteParts = [`[OA ${r.docNo}]`, r.title];
    if (r.vendor && !contactId) noteParts.push(r.vendor);
    if (r.requester) noteParts.push(r.requester);

    const res = await saveDocument({
      kind: 'purchase_request',
      doc_date: r.date,
      contact_id: contactId,
      reference: r.docNo,
      notes: noteParts.filter(Boolean).join(' · '),
      lines: r.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price,
        vat_treatment: 'exclusive' as const,
      })),
    });
    if (res.ok) imported++; else skipped++;
  }

  revalidatePath('/purchase/purchase-requests');
  return { ok: true, imported, skipped };
}
