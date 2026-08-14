import 'server-only';

/**
 * จุดเชื่อมต่อบริการ AICOM (OCR + AI ดึงข้อมูลจากเอกสารบัญชี)
 *
 * AICOM เป็นบริการ FastAPI แยกต่างหาก (https://github.com/tiwpheerachan/AICOM)
 * รันด้วย docker compose up แล้วตั้งค่าใน .env.local
 *   AICOM_API_URL=http://localhost:8000
 *   AICOM_API_KEY=<ถ้าตั้งไว้ฝั่ง AICOM>
 * ฝั่ง AICOM ต้องมี OPENAI_API_KEY (และ Google Document AI ถ้าต้องอ่านไฟล์สแกน)
 */

export interface ExtractResult {
  ok: boolean;
  detected_kind?: string;
  confidence?: number;
  extracted?: any;
  error?: string;
  not_configured?: boolean;
}

export function aicomConfig() {
  return {
    url: process.env.AICOM_API_URL || '',
    key: process.env.AICOM_API_KEY || '',
  };
}

export function isAicomConfigured(): boolean {
  return !!aicomConfig().url;
}

/** ส่งไฟล์ให้ AICOM จำแนกประเภทและดึงข้อมูล */
export async function extractDocument(file: File): Promise<ExtractResult> {
  const c = aicomConfig();
  if (!isAicomConfigured()) {
    return { ok: false, not_configured: true, error: 'ยังไม่ได้ตั้งค่า AICOM_API_URL' };
  }

  try {
    const body = new FormData();
    body.append('files', file, file.name);

    const res = await fetch(`${c.url.replace(/\/$/, '')}/api/extract`, {
      method: 'POST',
      headers: c.key ? { Authorization: `Bearer ${c.key}` } : undefined,
      body,
      cache: 'no-store',
    });

    if (!res.ok) {
      return { ok: false, error: `AICOM ตอบกลับ ${res.status}: ${(await res.text()).slice(0, 300)}` };
    }

    const data = (await res.json()) as any;
    const first = Array.isArray(data?.results) ? data.results[0] : data;

    return {
      ok: true,
      detected_kind: first?.platform || first?.doc_type || first?.detected_kind || 'unknown',
      confidence: Number(first?.confidence ?? 0) * (Number(first?.confidence ?? 0) <= 1 ? 100 : 1),
      extracted: first,
    };
  } catch (e: any) {
    return { ok: false, error: `เชื่อมต่อ AICOM ไม่สำเร็จ: ${e?.message || e}` };
  }
}

/**
 * แปลงผลลัพธ์จาก AICOM ให้เป็นรูปแบบเอกสารของ ONEBOOK
 * AICOM คืนค่าเป็นคอลัมน์ A–U ของเทมเพลต PEAK — ชื่อคีย์ต่างกันตามตัวดึงข้อมูลแต่ละแบบ
 * จึงลองอ่านหลายชื่อและปล่อยให้ผู้ใช้ตรวจแก้บนหน้าจอก่อนสร้างเอกสารจริง
 */
export function mapToDocument(extracted: any): {
  kind: string;
  doc_number: string;
  doc_date: string;
  contact_name: string;
  contact_tax_id: string;
  subtotal: number;
  vat_amount: number;
  grand_total: number;
  lines: { description: string; quantity: number; unit_price: number; line_amount: number }[];
} {
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = extracted?.[k];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return '';
  };
  const num = (v: any) => {
    const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isNaN(n) ? 0 : n;
  };

  const total = num(pick('grand_total', 'total', 'amount_total', 'T', 'net_amount'));
  const vat = num(pick('vat_amount', 'vat', 'tax_amount', 'S'));
  const sub = num(pick('subtotal', 'base_amount', 'amount', 'R')) || total - vat;

  const rawLines = Array.isArray(extracted?.lines) ? extracted.lines : [];
  const lines = rawLines.length
    ? rawLines.map((l: any) => ({
        description: String(l.description || l.name || l.item || '').slice(0, 300),
        quantity: num(l.quantity ?? l.qty ?? 1) || 1,
        unit_price: num(l.unit_price ?? l.price ?? l.amount),
        line_amount: num(l.line_amount ?? l.amount ?? l.total),
      }))
    : [
        {
          description: String(pick('description', 'note', 'detail', 'merchant', 'vendor') || 'รายการจากเอกสาร').slice(0, 300),
          quantity: 1,
          unit_price: sub,
          line_amount: sub,
        },
      ];

  return {
    kind: 'expense',
    doc_number: String(pick('doc_number', 'invoice_no', 'document_number', 'C') || ''),
    doc_date: String(pick('doc_date', 'date', 'invoice_date', 'B') || '').slice(0, 10),
    contact_name: String(pick('vendor', 'merchant', 'seller_name', 'contact_name', 'E') || ''),
    contact_tax_id: String(pick('tax_id', 'vendor_tax_id', 'seller_tax_id', 'F') || ''),
    subtotal: sub,
    vat_amount: vat,
    grand_total: total || sub + vat,
    lines,
  };
}
