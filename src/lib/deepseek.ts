import 'server-only';

// ตัวเชื่อม DeepSeek (ฝั่ง server เท่านั้น — คีย์ไม่หลุดไป browser)
// ใช้สร้าง "คลังความรู้" บัญชี/ภาษีทรัพย์สิน พร้อมแหล่งอ้างอิงให้บัญชีตรวจทานได้

export interface KnowledgeSource { title: string; url?: string; date?: string }
export interface KnowledgeArticle {
  title: string;
  summary: string;
  content: string;       // markdown
  sources: KnowledgeSource[];
}

// prompt ส่งให้โมเดล AI — ยกเว้นให้เป็นไทยได้ (ไม่ใช่ UI ตามกติกาโปรเจกต์)
const SYSTEM = `คุณเป็นผู้ช่วยด้านบัญชีและภาษีไทยสำหรับทีมบัญชีทรัพย์สินถาวร
ตอบเป็นภาษาไทย อ้างอิงกฎหมายและแหล่งทางการของไทย (ประมวลรัษฎากร, พ.ร.ฎ.ที่เกี่ยวข้อง เช่น ฉบับ 145, ประกาศกรมสรรพากร, มาตรฐานการบัญชี)
ตอบกลับเป็น JSON object เท่านั้น รูปแบบ:
{"title": "...", "summary": "สรุปสั้น 1-2 ประโยค", "content": "เนื้อหาแบบ markdown อธิบายละเอียด ใช้หัวข้อและรายการ", "sources": [{"title":"ชื่อแหล่งอ้างอิง","url":"ลิงก์ถ้ามี","date":"ปี/วันที่ของแหล่ง"}]}
ระบุวันที่/ปีของแหล่งอ้างอิงเสมอ และเตือนให้ผู้ใช้ตรวจสอบกับต้นฉบับทางการอีกครั้ง`;

function mapError(status: number, body: string): Error {
  const lower = body.toLowerCase();
  if (status === 402 || lower.includes('insufficient')) {
    return new Error('ยอดเครดิต DeepSeek ไม่พอ — เติมเครดิตก่อนจึงจะสร้างบทความใหม่ได้ (บทความเดิมยังอ่านได้)');
  }
  if (status === 401) return new Error('คีย์ DeepSeek ไม่ถูกต้องหรือถูกเพิกถอน');
  if (status === 429) return new Error('เรียกถี่เกินไป ลองใหม่อีกครั้งในอีกสักครู่');
  return new Error(`DeepSeek ${status}: ${body.slice(0, 200)}`);
}

export async function generateKnowledge(topic: string): Promise<KnowledgeArticle> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_NOT_CONFIGURED');
  const base = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `หัวข้อ: ${topic}` },
      ],
    }),
    cache: 'no-store',
  });

  if (!res.ok) throw mapError(res.status, await res.text().catch(() => res.statusText));

  const data = (await res.json()) as any;
  const raw = data?.choices?.[0]?.message?.content;
  if (!raw) throw new Error('DeepSeek: ไม่ได้รับเนื้อหากลับมา');

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('DeepSeek: รูปแบบคำตอบไม่ถูกต้อง (ไม่ใช่ JSON)');
  }

  return {
    title: String(parsed.title || topic),
    summary: String(parsed.summary || ''),
    content: String(parsed.content || ''),
    sources: Array.isArray(parsed.sources)
      ? parsed.sources.map((s: any) => ({ title: String(s.title || ''), url: s.url ? String(s.url) : undefined, date: s.date ? String(s.date) : undefined }))
      : [],
  };
}
