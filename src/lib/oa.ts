import 'server-only';

// ตัวเชื่อมฝั่ง ONEBOOK ไปยังระบบ OA (ขออนุมัติ) ผ่าน REST สาธารณะของ OA
// OA เป็นคนละระบบ/คนละฐานข้อมูล จึงคุยผ่าน HTTP + X-API-Key ไม่ได้ import ข้ามโปรเจกต์

export interface OaPurchaseLine {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface OaPurchaseRequest {
  docNo: string;
  title: string;
  vendor: string;
  date: string; // YYYY-MM-DD
  requester: string;
  lines: OaPurchaseLine[];
}

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown) => (v == null ? '' : String(v));

export function oaConfigured(): boolean {
  return !!(process.env.OA_BASE_URL && process.env.OA_API_KEY);
}

/** ดึงคำขอซื้อที่อนุมัติแล้วจากระบบ OA แล้วแปลงเป็นรูปที่สร้างใบขอซื้อได้ */
export async function fetchApprovedPurchaseRequests(): Promise<OaPurchaseRequest[]> {
  const base = process.env.OA_BASE_URL;
  const key = process.env.OA_API_KEY;
  if (!base || !key) throw new Error('OA_NOT_CONFIGURED');
  // รหัสฟอร์มที่ถือเป็น "คำขอซื้อ" ใน OA (OA มีหลายฟอร์ม จึงกรองด้วยรหัสนี้)
  const tmpl = process.env.OA_PURCHASE_TEMPLATE || 'PURCHASE';

  const res = await fetch(`${base.replace(/\/$/, '')}/api/v1/requests?status=APPROVED&limit=200`, {
    headers: { 'X-API-Key': key },
    cache: 'no-store',
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`OA ${res.status}: ${detail}`);
  }
  const body = (await res.json()) as { data?: any[] };
  const rows = Array.isArray(body.data) ? body.data : [];

  return rows
    .filter((r) => !tmpl || r?.type?.code === tmpl)
    .map((r) => {
      const items = Array.isArray(r?.fields?.items) ? r.fields.items : [];
      const lines: OaPurchaseLine[] = items.length
        ? items.map((it: any) => ({
            description: str(it.name ?? it.description ?? r.title),
            quantity: Math.max(1, num(it.qty ?? it.quantity ?? 1)),
            unit_price: num(it.unit_price ?? it.price ?? 0),
          }))
        : [{ description: str(r.title), quantity: 1, unit_price: num(r.amount) }];
      return {
        docNo: str(r.doc_no),
        title: str(r.title),
        vendor: str(r?.fields?.vendor),
        date: str(r.closed_at ?? r.doc_date).slice(0, 10) || new Date().toISOString().slice(0, 10),
        requester: str(r?.requester?.name),
        lines,
      };
    })
    .filter((r) => r.docNo);
}
