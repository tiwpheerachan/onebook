// ท่อรับข้อมูล PEAK จากตัวช่วยภายนอก (เช่น Claude routine ที่ดึงผ่าน MCP)
// routine ส่งรายการ "ดิบ" เข้ามา → ที่นี่ map + dedup upsert เข้า peak_documents
// (DB service key อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น — ตัว routine ไม่ต้องรู้)
import { NextResponse } from 'next/server';
import { upsertPeakItems } from '@/lib/peak-api/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ALLOWED = new Set([
  'receipt', 'invoice', 'expense', 'credit_note', 'billing_note',
  'quotation', 'credit_note_expense', 'billing_note_expense', 'purchase_order',
]);

function authorized(req: Request): boolean {
  // trim กัน whitespace/newline ที่อาจติดมาตอนตั้งค่า env
  const secret = (process.env.PEAK_SYNC_SECRET || '').trim();
  if (!secret) return false;
  const url = new URL(req.url);
  const key = (url.searchParams.get('key') || req.headers.get('x-peak-sync-key') || '').trim();
  return key === secret;
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let payload: any;
  try { payload = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 }); }

  // รับได้ทั้งแบบเดี่ยว {doc_type, items} และแบบหลายชุด [{doc_type, items}, ...]
  const groups: Array<{ doc_type: string; items: any[] }> = Array.isArray(payload)
    ? payload
    : (payload?.doc_type ? [payload] : (payload?.groups || []));

  const result: Record<string, { upserted: number; skipped: number; error?: string }> = {};
  let total = 0;
  for (const g of groups) {
    const dt = String(g?.doc_type || '');
    if (!ALLOWED.has(dt)) { result[dt || '?'] = { upserted: 0, skipped: 0, error: 'invalid doc_type' }; continue; }
    try {
      const r = await upsertPeakItems(dt, Array.isArray(g.items) ? g.items : []);
      result[dt] = r; total += r.upserted;
    } catch (e: any) {
      result[dt] = { upserted: 0, skipped: 0, error: e?.message || String(e) };
    }
  }
  return NextResponse.json({ ok: true, total, result });
}
