/**
 * POST /api/help/ask — ผู้ช่วย AI "วิธีใช้งาน + นำทาง" ของ ONEBOOK (อ่านอย่างเดียว)
 * body: { question, path?, lang? }  →  { answer, links:[{label,href}], followups:[], source }
 *
 * grounding: ใช้คู่มือเดิม HELP (src/lib/help/content.ts) + รายการหน้า HELP_PAGES (catalog.ts)
 * ถ้า DeepSeek ใช้ไม่ได้ จะ fallback เป็นการค้นแบบ keyword · ตอบได้ 3 ภาษาตาม lang
 */
import { NextResponse } from 'next/server';
import { HELP_PAGES, pageByPath } from '@/lib/help/catalog';
import { HELP } from '@/lib/help/content';
import { tx } from '@/lib/help/types';
import { getSessionContext } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

const DOC_STATUS_TH: Record<string, string> = {
  draft: 'ฉบับร่าง', awaiting_approval: 'รออนุมัติ', approved: 'ผ่านรายการแล้ว',
  partial: 'ชำระบางส่วน', paid: 'ชำระครบ', overdue: 'เกินกำหนด', void: 'ยกเลิก', closed: 'ปิด',
};

/** สรุปสถานะสดของบริษัทที่กำลังใช้งาน (คำนวณฝั่ง server ผ่าน RLS ของผู้ใช้) */
async function buildOnebookSnapshot(): Promise<string | undefined> {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return undefined;
    const supabase = createClient();
    const cid = ctx.company.id;
    const count = async (status: string) => {
      const { count } = await supabase
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', cid)
        .eq('status', status);
      return count ?? 0;
    };
    const [draft, awaiting, overdue, partial] = await Promise.all([
      count('draft'), count('awaiting_approval'), count('overdue'), count('partial'),
    ]);
    const lines = [
      `บริษัทที่ใช้งาน: ${ctx.company.name_th || ctx.company.code || cid}`,
      `เอกสารฉบับร่าง (ยังไม่ผ่านรายการ): ${draft}`,
      `เอกสารรออนุมัติ: ${awaiting}`,
      `เอกสารเกินกำหนดชำระ: ${overdue}`,
      `เอกสารชำระบางส่วน: ${partial}`,
      ctx.lockedThrough ? `ปิดงวดถึงวันที่: ${ctx.lockedThrough}` : `ยังไม่มีการปิดงวด`,
    ];
    return lines.join('\n');
  } catch {
    return undefined;
  }
}

const LANG: Record<string, string> = { th: 'ภาษาไทย', en: 'English', zh: '简体中文' };

type Link = { label: string; href: string };
interface Flat { title: string; body: string; href?: string; keywords: string[] }

/** รวมหน้าในระบบ + href ของบทความ เป็นชุด path ที่อนุญาตให้ลิงก์ */
function validHrefs(): Set<string> {
  const s = new Set(HELP_PAGES.map((p) => p.path));
  for (const c of HELP) for (const a of c.articles) if (a.href) s.add(a.href);
  return s;
}

/** แปลงบทความคู่มือเป็นชุดข้อความตามภาษา สำหรับ AI และการค้น */
function flatten(locale: string): Flat[] {
  const out: Flat[] = [];
  for (const c of HELP) {
    for (const a of c.articles) {
      const steps = a.steps.map((s) => tx(s, locale)).join(' ');
      const tips = (a.tips || []).map((s) => tx(s, locale)).join(' ');
      const title = tx(a.title, locale);
      out.push({
        title,
        body: `${tx(a.summary, locale)} ${steps} ${tips}`.trim(),
        href: a.href,
        keywords: `${tx(c.title, locale)} ${title}`.toLowerCase().split(/\s+/).filter((w) => w.length > 1),
      });
    }
  }
  return out;
}

function tokenize(s: string): string[] {
  return (s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 1);
}

function labelFor(href: string): string {
  const pg = HELP_PAGES.find((p) => p.path === href);
  if (pg) return pg.title;
  for (const c of HELP) for (const a of c.articles) if (a.href === href) return a.title.th;
  return href;
}

function fallback(question: string, locale: string) {
  const qt = tokenize(question);
  const ql = question.toLowerCase();
  const arts = flatten(locale);
  const score = (hay: string, kw: string[], title: string) => {
    let s = 0;
    const text = hay.toLowerCase();
    for (const k of kw) if (ql.includes(k)) s += 2;
    for (const w of qt) { if (title.toLowerCase().includes(w)) s += 2; if (text.includes(w)) s += 1; }
    return s;
  };
  const aScored = arts.map((a) => ({ a, s: score(a.body + ' ' + a.title, a.keywords, a.title) })).filter((r) => r.s > 0).sort((x, y) => y.s - x.s);
  const pScored = HELP_PAGES.map((p) => ({ p, s: score([p.title, p.purpose, ...p.keywords].join(' '), p.keywords, p.title) })).filter((r) => r.s > 0).sort((x, y) => y.s - x.s);

  if (aScored.length === 0 && pScored.length === 0) {
    return {
      answer: 'ยังไม่พบหัวข้อที่ตรงกับคำถามนี้ ลองพิมพ์คำสั้น ๆ เช่น "ออกใบแจ้งหนี้" "บันทึกค่าใช้จ่าย" "ปิดงวด" "ภ.พ.30" หรือเลือกจากรายการหน้าทั้งหมด',
      links: HELP_PAGES.slice(0, 6).map((p) => ({ label: p.title, href: p.path })),
      followups: ['ออกใบแจ้งหนี้ทำยังไง', 'บันทึกบิลซื้อทำยังไง', 'ดูงบกำไรขาดทุนที่ไหน'],
      source: 'fallback' as const,
    };
  }
  const links: Link[] = [];
  const top = aScored[0];
  if (top?.a.href) links.push({ label: labelFor(top.a.href), href: top.a.href });
  for (const { p } of pScored.slice(0, 3)) if (!links.some((l) => l.href === p.path)) links.push({ label: p.title, href: p.path });
  return {
    answer: top ? `${top.a.title}\n\n${top.a.body}`.slice(0, 600) : pScored[0].p.purpose,
    links: links.slice(0, 5),
    followups: aScored.slice(1, 4).map((r) => r.a.title),
    source: 'fallback' as const,
  };
}

async function askAI(question: string, path: string | undefined, locale: string, snapshot?: string) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return null;
  const base = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const answerLang = LANG[locale] || LANG.th;
  const here = path ? pageByPath(path) : undefined;
  const arts = flatten(locale);

  const pagesCtx = HELP_PAGES.map((p) => `- ${p.title} | path:${p.path} | ${p.purpose}`).join('\n');
  const howCtx = arts.map((a) => `### ${a.title}${a.href ? ` (หน้า:${a.href})` : ''}\n${a.body}`).join('\n\n').slice(0, 9000);

  const system = `คุณคือผู้ช่วยอัจฉริยะของระบบบัญชี "ONEBOOK" ของบริษัทไทย
หน้าที่มี 2 อย่าง: (1) ช่วย "หาวิธีใช้งาน" และนำทางไปหน้าที่ถูกต้อง (2) ตอบ "สถานะ/ตัวเลขจริงตอนนี้" จากข้อมูลสดใน DATA
คุณแก้ไข/อนุมัติ/ลงบัญชีแทนผู้ใช้ไม่ได้ ทำได้แค่บอกวิธีและชี้หน้า

กติกา
- ตอบด้วย ${answerLang} เสมอ กระชับ ตรงประเด็น เป็นขั้นตอนเมื่อเหมาะสม ไม่เกิน 6 บรรทัด
- คำถาม "วิธีใช้" ให้ตอบจาก PAGES/HOWTO · คำถาม "ตอนนี้มีกี่/สถานะ/ค้างอะไร" ให้ตอบจากตัวเลขใน DATA เท่านั้น ห้ามเดาตัวเลข
- ถ้า DATA ไม่มีตัวเลขที่ถาม ให้บอกตรง ๆ แล้วชี้หน้าที่ดูเองได้ (เช่น ค้นเอกสารเชิงลึกใช้ปุ่มถาม AI ข้อมูลของระบบ)
- links ต้องเลือกจาก path/หน้า ที่ปรากฏใน PAGES หรือ HOWTO เท่านั้น (1-4 อันที่เกี่ยวข้องจริง)
- ตอบเป็น JSON เท่านั้น: {"answer":string,"links":[{"label":string,"href":string}],"followups":[string]}

PAGES
${pagesCtx}

HOWTO
${howCtx}
${snapshot ? `\nDATA (สถานะสดของบริษัทตอนนี้)\n${snapshot}` : ''}`;

  const user = `${here ? `ผู้ใช้กำลังอยู่ที่หน้า: ${here.title} (${here.path})\n` : ''}คำถาม: ${question}`;
  const valid = validHrefs();

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 700,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? '{}');
    const links: Link[] = Array.isArray(parsed.links)
      ? parsed.links.filter((l: any) => l && valid.has(l.href)).map((l: any) => ({ label: String(l.label || labelFor(l.href)), href: String(l.href) })).slice(0, 4)
      : [];
    const followups: string[] = Array.isArray(parsed.followups) ? parsed.followups.map(String).slice(0, 3) : [];
    const answer = String(parsed.answer || '').trim();
    if (!answer) return null;
    return { answer, links, followups, source: 'ai' as const };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const question = String(body?.question ?? '').trim();
  if (!question) return NextResponse.json({ error: 'กรุณาพิมพ์คำถาม' }, { status: 400 });
  const locale = String(body?.lang ?? 'th');
  const path = body?.path ? String(body.path) : undefined;
  const snapshot = await buildOnebookSnapshot();

  const ai = await askAI(question, path, locale, snapshot);
  if (ai) return NextResponse.json(ai, { headers: { 'Cache-Control': 'no-store' } });

  const ql = question.toLowerCase();
  const DATA_HINTS = ['กี่', 'เท่าไร', 'เท่าไหร่', 'เหลือ', 'ค้าง', 'สถานะ', 'ตอนนี้', 'จำนวน', 'ร่าง', 'รออนุมัติ', 'เกินกำหนด', 'how many', 'status', 'count', 'overdue'];
  if (snapshot && DATA_HINTS.some((h) => ql.includes(h))) {
    return NextResponse.json(
      { answer: `สรุปสถานะบริษัทตอนนี้\n\n${snapshot}`, links: [{ label: 'แดชบอร์ด', href: '/dashboard' }, { label: 'คิวอนุมัติ', href: '/approvals' }], followups: ['ออกใบแจ้งหนี้ทำยังไง', 'บันทึกบิลซื้อทำยังไง', 'ปิดงวดทำยังไง'], source: 'snapshot' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return NextResponse.json(fallback(question, locale), { headers: { 'Cache-Control': 'no-store' } });
}
