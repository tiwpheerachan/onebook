import { NextResponse } from 'next/server';
import { getSessionContext, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { askJson, isAiConfigured } from '@/lib/ai-client';
import { docKindLabel, type SearchResult, EMPTY_RESULT } from '@/lib/search-meta';
import { getDictionary } from '@/i18n';
import { LOCALES, type Locale } from '@/i18n/config';
import { parseProposal, PERM_FOR, EDITABLE_FIELDS, type Proposal } from '@/lib/ai-actions';

export const dynamic = 'force-dynamic';

/**
 * ให้ AI "เสนอ" การจัดการเอกสาร — ไม่ลงมือทำ
 *
 * เส้นทางนี้อ่านอย่างเดียวเหมือน /api/ai/ask ทุกประการ
 * ไม่มีคำสั่งเขียนฐานข้อมูลสักบรรทัด ผลลัพธ์คือข้อเสนอที่คนต้องกดยืนยัน
 * การลงมือจริงอยู่ที่ server action confirmProposal ซึ่งตรวจใหม่หมด
 */

const LANG: Record<string, string> = { th: 'ภาษาไทย', en: 'English', zh: '简体中文' };

const system = (lang: string) => `คุณคือผู้ช่วยในระบบบัญชี ONEBOOK

หน้าที่ : อ่านคำสั่งของผู้ใช้ แล้ว "เสนอ" การจัดการเอกสารหนึ่งรายการ
คุณลงมือทำเองไม่ได้ ทุกข้อเสนอต้องให้คนกดยืนยันก่อนเสมอ

สิ่งที่เสนอได้เท่านั้น
- approve        อนุมัติเอกสาร
- void           ยกเลิกเอกสาร (ต้องมีเหตุผลเสมอ)
- update_fields  แก้เฉพาะฟิลด์ ${EDITABLE_FIELDS.join(', ')} เท่านั้น

ห้ามเด็ดขาด
- ห้ามเสนอแก้ยอดเงิน บรรทัดรายการ ภาษี หรือคู่ค้า ถ้าผู้ใช้ขอ ให้ตอบว่าต้องแก้ที่หน้าเอกสารเอง
- ห้ามเดา document_id ต้องเลือกจากรายการใน CONTEXT เท่านั้น
- ถ้าหาเอกสารที่ตรงไม่เจอ หรือเข้าข่ายมากกว่าหนึ่งใบจนไม่แน่ใจ ให้ตอบเป็น proposal: null
  แล้วอธิบายใน message ว่าต้องระบุอะไรเพิ่ม

ตอบ ${lang} ในช่อง message และตอบเป็น JSON เท่านั้น
{
  "message": "อธิบายสั้น ๆ ว่าจะทำอะไรกับใบไหน หรือทำไมทำไม่ได้",
  "proposal": null หรือ {
    "action": "approve|void|update_fields",
    "document_id": "uuid จาก CONTEXT",
    "reason": "เหตุผล เฉพาะตอน void",
    "changes": [{"field":"due_date","to":"2026-09-30"}],
    "rationale": "เหตุผลที่เสนอแบบนี้"
  }
}`;

export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const q = String(body?.instruction || '').trim().slice(0, 500);
  const locale = (LOCALES.includes(body?.locale) ? body.locale : 'th') as Locale;
  const d = getDictionary(locale);
  const L = d.ui.propose;

  if (q.length < 2) return NextResponse.json({ error: L.tooShort }, { status: 400 });
  if (!isAiConfigured()) return NextResponse.json({ message: L.aiNotConfigured, proposal: null });

  const supabase = createClient();

  // หาเอกสารที่น่าจะเป็นเป้าหมาย ด้วยสิทธิ์ของผู้ใช้เอง
  const { data: found } = await supabase.rpc('rpt_global_search', {
    p_company: ctx.company.id, p_q: q, p_limit: 8,
  });
  const hits = ((found || EMPTY_RESULT) as SearchResult).documents;

  if (hits.length === 0) return NextResponse.json({ message: L.noDocument, proposal: null });

  const context = hits.map((x) => ({
    document_id: x.id, เลขที่: x.doc_number, ประเภท: docKindLabel(d, x.kind),
    วันที่: x.doc_date, สถานะ: x.status, ยอดรวม: x.grand_total, คู่ค้า: x.contact,
  }));

  const r = await askJson(
    system(LANG[locale] || LANG.th),
    `คำสั่งจากผู้ใช้ : ${q}\n\nCONTEXT (เอกสารที่ผู้ใช้มีสิทธิ์เห็น) :\n${JSON.stringify(context)}`,
    { maxTokens: 700, timeoutMs: 25_000 }
  );

  if (!r.ok || !r.data) return NextResponse.json({ message: L.failed, proposal: null, note: r.note });

  const message = String(r.data.message || '').slice(0, 600);
  const parsed = parseProposal(r.data.proposal);
  if (!parsed) return NextResponse.json({ message, proposal: null });

  // ── ตรวจของจริงจากฐานข้อมูล ไม่เชื่อสิ่งที่ AI ส่งมา ──
  const { data: doc } = await supabase
    .from('documents')
    .select('id, kind, doc_number, doc_date, due_date, reference, notes, internal_note, grand_total, status, updated_at, contact_id, contacts(name)')
    .eq('id', parsed.document_id)
    .eq('company_id', ctx.company.id)
    .maybeSingle();

  if (!doc) return NextResponse.json({ message: L.noDocument, proposal: null });

  const blockers: string[] = [];
  const perm = PERM_FOR[parsed.action];
  if (!can(ctx, perm.resource, perm.action)) blockers.push(L.noPermission);

  // งวดที่ปิดแล้วแก้ไม่ได้ ฐานข้อมูลกันอยู่แล้ว แต่บอกล่วงหน้าดีกว่าให้กดแล้วเด้ง error
  if (ctx.lockedThrough && doc.doc_date <= ctx.lockedThrough) blockers.push(L.periodLocked);

  if (parsed.action === 'approve' && ['approved', 'paid', 'void', 'closed'].includes(doc.status)) {
    blockers.push(L.alreadyApproved);
  }
  if (parsed.action === 'void' && doc.status === 'void') blockers.push(L.alreadyVoid);

  // เติมค่าเดิมลงในรายการเปลี่ยนแปลง เพื่อให้หน้าจอโชว์ก่อน→หลังได้
  const changes = parsed.changes?.map((c) => ({ ...c, from: (doc as any)[c.field] ?? null }))
    .filter((c) => String(c.from ?? '') !== String(c.to ?? ''));

  if (parsed.action === 'update_fields' && (!changes || changes.length === 0)) {
    return NextResponse.json({ message: L.noChange, proposal: null });
  }

  const proposal: Proposal = {
    ...parsed,
    changes,
    expected_updated_at: doc.updated_at,
    doc: {
      number: doc.doc_number, kind: doc.kind, date: doc.doc_date,
      total: Number(doc.grand_total), status: doc.status,
      contact: (doc as any).contacts?.name ?? null,
    },
    blockers,
  };

  return NextResponse.json({ message, proposal });
}
