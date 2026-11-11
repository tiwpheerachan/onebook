// ดึงเอกสารจาก PEAK (อ่านอย่างเดียว) → dedup เข้าตาราง peak_documents ของ ONEBOOK
// ⚠️ GET เท่านั้น — ไม่มีการเขียน/อนุมัติ/ลบกลับไป PEAK
import { createAdminClient } from '@/lib/supabase/server';
import { peakGet, peakConfigured, peakMissingEnv } from './client';

interface DocTypeCfg {
  doc_type: string;   // ค่าที่เก็บในคอลัมน์ doc_type (ตรงกับที่ /peak/documents ใช้)
  path: string;       // endpoint รายการ
  wrapper: string;    // key ชั้นนอกของ response
  arr: string;        // key ของ array รายการ
}

// เรียงให้เอกสารที่มีมากอยู่ก่อน · เผื่อ endpoint บางชนิดไม่มี /list จะข้าม (ไม่ล้มทั้งงาน)
const DOC_TYPES: DocTypeCfg[] = [
  { doc_type: 'receipt', path: 'receipts/list', wrapper: 'PeakReceipts', arr: 'receipts' },
  { doc_type: 'invoice', path: 'invoices/list', wrapper: 'PeakInvoices', arr: 'invoices' },
  { doc_type: 'expense', path: 'expenses/list', wrapper: 'PeakExpenses', arr: 'expenses' },
  { doc_type: 'credit_note', path: 'creditnotes/list', wrapper: 'PeakCreditNotes', arr: 'creditNotes' },
  { doc_type: 'billing_note', path: 'billingnotes/list', wrapper: 'PeakBillingNotes', arr: 'billingNotes' },
  { doc_type: 'quotation', path: 'quotations/list', wrapper: 'PeakQuotations', arr: 'quotations' },
  { doc_type: 'credit_note_expense', path: 'creditnotesExpenses/list', wrapper: 'PeakCreditNotesExpenses', arr: 'creditNotesExpenses' },
  { doc_type: 'billing_note_expense', path: 'billingnotesexpenses/list', wrapper: 'PeakBillingNotesExpenses', arr: 'billingNotesExpenses' },
];

function parseDate(s: any): string | null {
  if (!s) return null;
  const str = String(s);
  if (/^\d{8}$/.test(str)) return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;
  const d = new Date(str);
  return Number.isNaN(+d) ? null : d.toISOString().slice(0, 10);
}
function num(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapRow(doc_type: string, it: any) {
  const status = it.status;
  const isVoid = it.isVoid === 1 || String(status).toLowerCase() === 'void';
  return {
    doc_type,
    code: String(it.code),
    issued_date: parseDate(it.issuedDate),
    due_date: parseDate(it.dueDate),
    contact_code: it.contactCode ?? null,
    contact_id: it.contactId ?? null,
    net_amount: num(it.netAmount),
    remain_amount: num(it.remainAmount ?? it.remainingAmount ?? it.outstandingAmount),
    pre_tax_amount: num(it.preTaxAmount),
    vat_amount: num(it.vatAmount ?? it.vat),
    wht_amount: num(it.withholdingTaxAmount ?? it.whtAmount),
    is_void: isVoid ? 1 : 0,
    status_id: typeof it.statusId === 'number' ? it.statusId
      : (typeof it.status === 'number' ? it.status : null),
    is_tax_invoice: (it.isTaxInvoice === 1 || it.istaxInvoice === 1) ? 1 : 0,
    document_link: it.documentLink ?? it.link ?? null,
    synced_at: new Date().toISOString(),
  };
}

export interface SyncResult {
  ok: boolean;
  error?: string;
  total: number;
  perType: Record<string, { fetched: number; upserted: number; error?: string }>;
  ms: number;
}

/**
 * ซิงก์เอกสารจาก PEAK เข้า peak_documents
 * @param maxPages จำกัดจำนวนหน้าต่อชนิด (สำหรับ cron รอบถี่ ดึงเฉพาะหน้าแรก ๆ) · undefined = ดึงทั้งหมด
 * @param limit ขนาดต่อหน้า (ค่าปลอดภัย 100)
 */
export async function syncPeakDocuments(opts: { maxPages?: number; limit?: number } = {}): Promise<SyncResult> {
  const started = Date.now();
  const perType: SyncResult['perType'] = {};
  if (!peakConfigured()) {
    return { ok: false, error: `PEAK ยังตั้งค่าไม่ครบ: ${peakMissingEnv().join(', ')}`, total: 0, perType, ms: 0 };
  }
  const sb = createAdminClient();
  const limit = opts.limit ?? 100;
  const maxPages = opts.maxPages ?? 10_000;
  let total = 0;

  for (const cfg of DOC_TYPES) {
    perType[cfg.doc_type] = { fetched: 0, upserted: 0 };
    try {
      for (let page = 1; page <= maxPages; page++) {
        const body: any = await peakGet(cfg.path, { limit, page });
        const items: any[] = body?.[cfg.wrapper]?.[cfg.arr] ?? [];
        if (!Array.isArray(items) || items.length === 0) break;

        const rows = items.filter((it) => it && it.code != null).map((it) => mapRow(cfg.doc_type, it));
        if (rows.length) {
          // upsert — PK (doc_type, code) จึงกันซ้ำได้เอง
          const { error } = await sb.from('peak_documents').upsert(rows, { onConflict: 'doc_type,code' });
          if (error) throw new Error(error.message);
          perType[cfg.doc_type].upserted += rows.length;
        }
        perType[cfg.doc_type].fetched += items.length;
        total += rows.length;
        if (items.length < limit) break; // หน้าสุดท้าย
      }
    } catch (e: any) {
      // ชนิดนี้พัง (เช่น endpoint ไม่มี /list) → บันทึกไว้แล้วไปชนิดถัดไป
      perType[cfg.doc_type].error = e?.message || String(e);
    }
  }

  return { ok: true, total, perType, ms: Date.now() - started };
}
