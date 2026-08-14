import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { askJson, isAiConfigured } from '@/lib/ai-client';
import { docHref, DOC_KIND_TH, type SearchResult } from '@/lib/search-meta';
import { EMPTY_RESULT } from '@/lib/search-meta';

export const dynamic = 'force-dynamic';

/**
 * ผู้ช่วย AI แบบ "อ่านอย่างเดียว"
 *
 * ออกแบบให้แก้ข้อมูลไม่ได้เลยโดยโครงสร้าง ไม่ใช่แค่สั่งในพรอมต์
 *   - route นี้เป็น POST ก็จริง แต่ไม่มีการเขียนฐานข้อมูลสักบรรทัด
 *   - ใช้ client ของผู้ใช้ (ไม่ใช่ service role) ทุกอย่างจึงผ่าน RLS
 *   - AI ไม่มีเครื่องมือใด ๆ ให้เรียก ได้แค่ข้อความสรุปกับรายการอ้างอิงกลับมา
 *
 * ต่อให้มีคนพยายามหลอกให้ AI "แก้เอกสาร" ก็ทำไม่ได้ เพราะไม่มีทางให้เขียน
 */

const SYSTEM = `คุณคือผู้ช่วยในระบบบัญชี ONEBOOK ของบริษัทไทย

หน้าที่ของคุณคือช่วย "หาและอธิบาย" ข้อมูลที่ผู้ใช้ถาม จากข้อมูลที่ให้มาเท่านั้น
คุณไม่มีสิทธิ์และไม่มีความสามารถในการสร้าง แก้ไข อนุมัติ หรือลบเอกสารใด ๆ
ถ้าผู้ใช้ขอให้แก้ไขข้อมูล ให้บอกว่าทำให้ไม่ได้ แล้วชี้ทางว่าต้องไปทำที่หน้าไหนเอง

กติกา
- ตอบเป็นภาษาไทย กระชับ ตรงประเด็น
- ใช้ได้เฉพาะข้อมูลใน CONTEXT ห้ามเดาตัวเลขหรือแต่งเอกสารที่ไม่มีอยู่
- ถ้าข้อมูลไม่พอ ให้บอกตรง ๆ ว่าไม่พบ แล้วแนะนำคำค้นที่น่าจะได้ผลกว่า
- ยอดเงินให้ใส่เครื่องหมายคั่นหลักพันและระบุสกุลเมื่อไม่ใช่บาท

ตอบเป็น JSON เท่านั้น รูปแบบ
{
  "answer": "คำตอบแบบข้อความ ไม่เกิน 5 บรรทัด",
  "refs": [{"label":"ชื่อที่แสดง","id":"uuid ของรายการใน CONTEXT","type":"document|contact|product|task"}],
  "followups": ["คำถามต่อที่น่าสนใจ ไม่เกิน 3 ข้อ"]
}`;

export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { question } = await req.json().catch(() => ({ question: '' }));
  const q = String(question || '').trim().slice(0, 500);
  if (q.length < 2) return NextResponse.json({ error: 'คำถามสั้นเกินไป' }, { status: 400 });

  // ── หาข้อมูลประกอบด้วยสิทธิ์ของผู้ใช้เอง ──
  const supabase = createClient();
  const { data } = await supabase.rpc('rpt_global_search', {
    p_company: ctx.company.id, p_q: q, p_limit: 10,
  });
  const found = (data || EMPTY_RESULT) as SearchResult;

  const hits =
    found.documents.length + found.contacts.length + found.products.length + found.tasks.length;

  if (!isAiConfigured()) {
    return NextResponse.json({
      answer: hits
        ? `ยังไม่ได้ตั้งค่า AI จึงสรุปให้ไม่ได้ แต่ค้นเจอ ${hits} รายการที่เกี่ยวข้อง ดูรายการด้านล่างได้เลย`
        : 'ยังไม่ได้ตั้งค่า AI และไม่พบข้อมูลที่ตรงกับคำถามนี้',
      refs: refsFrom(found),
      followups: [],
      note: 'ตั้ง AI_API_URL และ AI_API_KEY เพื่อให้ AI ช่วยสรุป',
    });
  }

  const context = {
    บริษัท: ctx.company.name_th,
    ปิดงวดถึง: ctx.lockedThrough,
    เอกสารที่ค้นเจอ: found.documents.map((d) => ({
      id: d.id, ประเภท: DOC_KIND_TH[d.kind] || d.kind, เลขที่: d.doc_number,
      วันที่: d.doc_date, สถานะ: d.status, ยอดรวม: d.grand_total,
      สกุล: d.currency, คู่ค้า: d.contact,
    })),
    ผู้ติดต่อ: found.contacts.map((c) => ({
      id: c.id, ชื่อ: c.name, รหัส: c.code, ประเภท: c.kind,
      เลขผู้เสียภาษี: c.tax_id, โทร: c.phone,
    })),
    สินค้า: found.products.map((p) => ({
      id: p.id, ชื่อ: p.name, รหัส: p.sku, หน่วย: p.unit, ราคาขาย: p.sale_price,
    })),
    งาน: found.tasks.map((t) => ({
      id: t.id, เรื่อง: t.title, สถานะ: t.status, ความสำคัญ: t.priority, ครบกำหนด: t.due_at,
    })),
  };

  const r = await askJson(
    SYSTEM,
    `คำถามจากผู้ใช้ : ${q}\n\nCONTEXT (ข้อมูลที่ผู้ใช้คนนี้มีสิทธิ์เห็น) :\n${JSON.stringify(context)}`,
    { maxTokens: 900, timeoutMs: 25_000 }
  );

  if (!r.ok || !r.data?.answer) {
    return NextResponse.json({
      answer: hits
        ? `AI ตอบไม่สำเร็จ แต่ค้นเจอ ${hits} รายการที่เกี่ยวข้อง`
        : 'ไม่พบข้อมูลที่ตรงกับคำถามนี้',
      refs: refsFrom(found),
      followups: [],
      note: r.note,
    });
  }

  // เชื่อม id ที่ AI อ้างกลับไปเป็นลิงก์จริง — ตัดทิ้งถ้า id นั้นไม่มีอยู่ใน CONTEXT
  const byId = new Map(refsFrom(found).map((x) => [x.id, x]));
  const refs = Array.isArray(r.data.refs)
    ? r.data.refs.map((x: any) => byId.get(String(x?.id))).filter(Boolean).slice(0, 8)
    : [];

  return NextResponse.json({
    answer: String(r.data.answer).slice(0, 2000),
    refs: refs.length ? refs : refsFrom(found).slice(0, 6),
    followups: Array.isArray(r.data.followups) ? r.data.followups.slice(0, 3).map(String) : [],
  });
}

/** แปลงผลค้นหาเป็นลิงก์ที่กดได้ */
function refsFrom(f: SearchResult) {
  return [
    ...f.documents.map((d) => ({
      id: d.id, type: 'document',
      label: `${d.doc_number} · ${DOC_KIND_TH[d.kind] || d.kind}`,
      sub: d.contact || '', href: docHref(d.kind, d.id),
    })),
    ...f.contacts.map((c) => ({
      id: c.id, type: 'contact', label: c.name, sub: c.code,
      href: `/contacts?q=${encodeURIComponent(c.code)}`,
    })),
    ...f.products.map((p) => ({
      id: p.id, type: 'product', label: p.name, sub: p.sku,
      href: `/products?q=${encodeURIComponent(p.sku)}`,
    })),
    ...f.tasks.map((t) => ({
      id: t.id, type: 'task', label: t.title, sub: '',
      href: `/tasks?q=${encodeURIComponent(t.title)}`,
    })),
  ];
}
