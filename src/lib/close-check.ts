import 'server-only';
import { askJson } from './ai-client';

/** ผลตรวจหนึ่งข้อจาก rpt_close_check */
export interface Finding {
  key: string;
  severity: 'error' | 'warning' | 'info';
  category: string;
  title: string;
  detail: string;
  count: number;
  amount: number;
  samples: { id: string; label: string; kind: string }[] | null;
}

export interface CloseCheck {
  generated_at: string;
  period: { from: string; to: string };
  findings: Finding[];
  errors: number;
  warnings: number;
  infos: number;
}

export const SEVERITY = {
  error:   { label: 'ต้องแก้ก่อนปิดงบ', chip: 'bg-rose-50 text-rose-700 ring-rose-200',       bar: 'bg-rose-500',   rank: 0 },
  warning: { label: 'ควรตรวจสอบ',       chip: 'bg-amber-50 text-amber-800 ring-amber-200',   bar: 'bg-amber-500',  rank: 1 },
  info:    { label: 'ข้อเสนอแนะ',        chip: 'bg-sky-50 text-sky-700 ring-sky-200',        bar: 'bg-sky-500',    rank: 2 },
} as const;

/** เรียงให้เรื่องที่ต้องแก้ขึ้นก่อนเสมอ */
export function sortFindings(f: Finding[]): Finding[] {
  return [...f].sort((a, b) => SEVERITY[a.severity].rank - SEVERITY[b.severity].rank || b.count - a.count);
}

const SYSTEM_PROMPT = `คุณเป็นผู้สอบทานบัญชีในประเทศไทย
สรุปผลตรวจก่อนปิดงบให้หัวหน้าทีมบัญชีอ่าน โดยใช้ "เฉพาะข้อมูลที่ให้มา" ห้ามคิดตัวเลขหรือปัญหาขึ้นเอง
ตอบเป็น JSON เท่านั้น รูปแบบ {"lines":["..."],"actions":["..."]}
- lines : 2-3 บรรทัด บอกภาพรวมว่าพร้อมปิดงบไหม และอะไรคือความเสี่ยงหลัก
- actions : 2-4 ข้อ ลำดับงานที่ควรลงมือ เรียงตามผลกระทบต่องบการเงิน
ใช้ภาษาไทยกระชับ ตรงประเด็น`;

export interface CloseBrief {
  lines: string[];
  actions: string[];
  byAi: boolean;
  note?: string;
}

/** สรุปด้วยกฎ ใช้ได้ทันทีและเป็นตัวสำรองเมื่อ AI ใช้ไม่ได้ */
export function ruleCloseBrief(c: CloseCheck): CloseBrief {
  const lines: string[] = [];
  const actions: string[] = [];
  const sorted = sortFindings(c.findings);

  if (c.findings.length === 0) {
    lines.push('ตรวจครบทุกข้อแล้วไม่พบปัญหา งวดนี้พร้อมปิดงบ');
    actions.push('ปิดงวดบัญชีเพื่อล็อกไม่ให้แก้ย้อนหลัง');
    return { lines, actions, byAi: false };
  }

  if (c.errors > 0) {
    lines.push(`พบเรื่องที่ต้องแก้ก่อนปิดงบ ${c.errors} เรื่อง — ปิดงบตอนนี้ตัวเลขจะยังไม่ถูกต้อง`);
  } else {
    lines.push('ไม่พบเรื่องที่ต้องแก้ก่อนปิดงบ เหลือเพียงข้อที่ควรตรวจทาน');
  }
  if (c.warnings > 0) lines.push(`มีเรื่องที่ควรตรวจสอบอีก ${c.warnings} เรื่อง และข้อเสนอแนะ ${c.infos} เรื่อง`);

  for (const f of sorted.filter((x) => x.severity === 'error').slice(0, 3)) {
    actions.push(f.title);
  }
  if (actions.length < 3) {
    for (const f of sorted.filter((x) => x.severity === 'warning').slice(0, 3 - actions.length)) {
      actions.push(f.title);
    }
  }
  if (c.errors === 0 && c.warnings === 0) actions.push('ปิดงวดบัญชีเพื่อล็อกไม่ให้แก้ย้อนหลัง');

  return { lines, actions, byAi: false };
}

/** ให้ AI เรียบเรียงจากผลตรวจชุดเดียวกัน ตัวเลขยังมาจากฐานข้อมูลเสมอ */
export async function aiCloseBrief(c: CloseCheck): Promise<CloseBrief> {
  const fallback = ruleCloseBrief(c);

  const res = await askJson(
    SYSTEM_PROMPT,
    JSON.stringify({
      งวด: c.period,
      ต้องแก้: c.errors, ควรตรวจ: c.warnings, ข้อเสนอแนะ: c.infos,
      รายการที่พบ: c.findings.map((f) => ({
        ระดับ: f.severity, หมวด: f.category, เรื่อง: f.title, จำนวน: f.count, มูลค่า: f.amount,
      })),
    })
  );

  if (!res.ok) return { ...fallback, note: res.note };

  const lines = Array.isArray(res.data?.lines) ? res.data.lines.filter((x: any) => typeof x === 'string') : [];
  const actions = Array.isArray(res.data?.actions) ? res.data.actions.filter((x: any) => typeof x === 'string') : [];
  if (!lines.length) return { ...fallback, note: 'AI ตอบไม่ครบ จึงใช้สรุปอัตโนมัติแทน' };

  return { lines, actions, byAi: true };
}
