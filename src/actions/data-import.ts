'use server';
import { revalidatePath } from 'next/cache';
import { t } from '@/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext, can } from '@/lib/session';
import { IMPORT_SET_BY_KEY, coerce } from '@/lib/import-map';
import { isValidThaiTaxId } from '@/lib/format';

export interface ImportRowResult {
  row: number;
  error: string;
}
export interface ImportResult {
  ok: boolean;
  error?: string;
  inserted?: number;
  failed?: ImportRowResult[];
}

/** สิทธิ์ที่ต้องมีสำหรับแต่ละชุดข้อมูล */
const RESOURCE: Record<string, string> = {
  contacts: 'contacts',
  products: 'products',
  accounts: 'accounting.coa',
};

const MAX_ROWS = 5000;

/**
 * นำเข้าข้อมูลหลักจากไฟล์ที่ผู้ใช้จับคู่คอลัมน์ไว้แล้ว
 * แถวที่ผิดจะถูกข้ามและรายงานกลับ ส่วนแถวที่ถูกต้องยังบันทึกสำเร็จตามปกติ
 */
export async function importRows(
  setKey: string,
  rows: Record<string, string>[]
): Promise<ImportResult> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: t().ui.act.noSession };

  const set = IMPORT_SET_BY_KEY[setKey];
  if (!set) return { ok: false, error: t().ui.act.importSetUnknown };

  const resource = RESOURCE[setKey];
  if (!can(ctx, resource, 'create')) return { ok: false, error: t().ui.act.importNoPerm };
  if (!rows.length) return { ok: false, error: t().ui.act.importEmpty };
  if (rows.length > MAX_ROWS) return { ok: false, error: t().ui.misc.importMax.replace('{n}', String(MAX_ROWS)) };

  const failed: ImportRowResult[] = [];
  const payload: any[] = [];
  const seen = new Set<string>();

  rows.forEach((raw, i) => {
    const rowNo = i + 1;
    const out: any = { company_id: ctx.company.id };

    for (const f of set.fields) {
      const v = coerce(raw[f.key] ?? '', f.type);
      if (f.required && (v === null || v === '')) {
        failed.push({ row: rowNo, error: t().ui.misc.importMissing.replace('{field}', f.label) });
        return;
      }
      if (v !== null) out[f.key] = v;
    }

    // ตรวจเลขผู้เสียภาษีตั้งแต่ตอนนำเข้า ดีกว่าไปพบตอนออกใบกำกับภาษี
    if (out.tax_id) {
      const digits = String(out.tax_id).replace(/\D/g, '');
      if (digits.length === 13 && !isValidThaiTaxId(digits)) {
        failed.push({ row: rowNo, error: t().ui.misc.importBadTaxId.replace('{id}', digits) });
        return;
      }
      out.tax_id = digits || null;
    }

    if (setKey === 'accounts') {
      const ok = ['asset', 'liability', 'equity', 'revenue', 'expense', 'other_income', 'other_expense'];
      if (!ok.includes(out.type)) {
        failed.push({ row: rowNo, error: t().ui.misc.importBadType.replace('{type}', String(out.type)).replace('{allowed}', ok.join(' / ')) });
        return;
      }
    }
    if (setKey === 'contacts') {
      const ok = ['customer', 'vendor', 'both'];
      out.kind = ok.includes(out.kind) ? out.kind : 'customer';
    }

    // กันข้อมูลซ้ำภายในไฟล์เดียวกัน ไม่งั้น upsert จะชนกันเองในชุดเดียว
    const key = String(out[set.fields[0].key] ?? '').toLowerCase();
    if (seen.has(key)) {
      failed.push({ row: rowNo, error: t().ui.misc.importDupKey.replace('{key}', key) });
      return;
    }
    seen.add(key);

    payload.push(out);
  });

  if (!payload.length) return { ok: false, error: t().ui.act.importNoValidRow, failed };

  const supabase = createClient();
  const { error } = await supabase.from(set.table).upsert(payload, { onConflict: set.conflict });
  if (error) return { ok: false, error: error.message, failed };

  revalidatePath('/contacts');
  revalidatePath('/products');
  revalidatePath('/accounting/coa');
  return { ok: true, inserted: payload.length, failed };
}
