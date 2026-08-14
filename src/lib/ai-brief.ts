import 'server-only';
import { askJson, isAiConfigured as aiReady } from './ai-client';

/**
 * สรุปงานประจำวัน
 *
 * ตัวเลขทั้งหมดคำนวณจากฐานข้อมูลเสมอ (rpt_task_summary) ไม่ว่าจะเปิดใช้ AI หรือไม่
 * ถ้าตั้งค่า AI ไว้ จะให้ AI เรียบเรียงเป็นข้อความอ่านง่ายจากตัวเลขชุดเดียวกันนี้
 * ทำแบบนี้เพื่อไม่ให้ AI แต่งตัวเลขขึ้นเอง ซึ่งเป็นเรื่องใหญ่มากในระบบบัญชี
 */

export interface TaskSummary {
  counts: { todo: number; in_progress: number; blocked: number; review: number; done: number; total: number };
  overdue_count: number;
  overdue: { id: string; code: string; title: string; due_at: string; priority: string; kind: string; days_late: number }[];
  due_today: number;
  due_week: number;
  unassigned: number;
  done_last_7_days: number;
  workload: { id: string; name: string; open_tasks: number; overdue_tasks: number; done_tasks: number }[];
  upcoming: { id: string; code: string; title: string; due_at: string; priority: string; kind: string }[];
}

export interface Brief {
  /** ข้อความสรุป 3–5 บรรทัด */
  lines: string[];
  /** สิ่งที่ควรลงมือทำต่อ */
  actions: string[];
  /** true = เรียบเรียงโดย AI, false = สรุปด้วยกฎที่เขียนไว้ */
  byAi: boolean;
  /** เหตุผลที่ยังไม่ได้ใช้ AI (แสดงในหน้าจอ) */
  note?: string;
}

export function isAiConfigured(): boolean {
  return aiReady();
}

const nf = (n: number) => n.toLocaleString('th-TH');

/** สรุปด้วยกฎ — ใช้งานได้ทันทีโดยไม่ต้องตั้งค่าอะไร และเป็นตัวสำรองเมื่อ AI ล่ม */
export function ruleBrief(s: TaskSummary): Brief {
  const lines: string[] = [];
  const actions: string[] = [];

  const open = s.counts.todo + s.counts.in_progress + s.counts.blocked + s.counts.review;

  if (open === 0 && s.counts.total > 0) {
    lines.push('งานทั้งหมดปิดครบแล้ว ไม่มีงานค้างในระบบ');
  } else if (s.counts.total === 0) {
    lines.push('ยังไม่มีงานในระบบ เริ่มจากสร้างงานแรกหรือดึงปฏิทินภาษีของเดือนนี้เข้ามา');
  } else {
    lines.push(
      `มีงานค้างอยู่ ${nf(open)} รายการ — กำลังทำ ${nf(s.counts.in_progress)} · ` +
      `รอตรวจ ${nf(s.counts.review)} · ยังไม่เริ่ม ${nf(s.counts.todo)}`
    );
  }

  if (s.overdue_count > 0) {
    const worst = s.overdue[0];
    lines.push(
      `⚠ เลยกำหนดแล้ว ${nf(s.overdue_count)} รายการ` +
      (worst ? ` งานที่ค้างนานที่สุดคือ “${worst.title}” เลยมา ${nf(worst.days_late)} วัน` : '')
    );
    actions.push(`สะสางงานที่เลยกำหนด ${nf(s.overdue_count)} รายการก่อนเป็นอันดับแรก`);
  } else if (open > 0) {
    lines.push('ยังไม่มีงานเลยกำหนด รักษาจังหวะนี้ไว้');
  }

  if (s.due_today > 0) {
    lines.push(`ครบกำหนดวันนี้ ${nf(s.due_today)} รายการ และภายใน 7 วันอีก ${nf(s.due_week)} รายการ`);
    actions.push(`ปิดงานที่ครบกำหนดวันนี้ให้ได้ ${nf(s.due_today)} รายการ`);
  } else if (s.due_week > 0) {
    lines.push(`ภายใน 7 วันข้างหน้ามีงานครบกำหนด ${nf(s.due_week)} รายการ`);
  }

  if (s.counts.blocked > 0) {
    actions.push(`ตามเคลียร์งานที่ติดปัญหา ${nf(s.counts.blocked)} รายการ เพราะจะฉุดงานอื่นตามไปด้วย`);
  }
  if (s.unassigned > 0) {
    actions.push(`มอบหมายผู้รับผิดชอบให้งานที่ยังไม่มีเจ้าภาพ ${nf(s.unassigned)} รายการ`);
  }

  // เตือนเรื่องภาระงานกระจุกตัว
  const busiest = s.workload[0];
  if (busiest && s.workload.length > 1 && busiest.open_tasks >= 5) {
    const rest = s.workload.slice(1).reduce((a, w) => a + w.open_tasks, 0);
    if (busiest.open_tasks > rest) {
      actions.push(`งานกระจุกที่ ${busiest.name} (${nf(busiest.open_tasks)} รายการ) ควรกระจายให้คนอื่นช่วย`);
    }
  }
  if (busiest && busiest.overdue_tasks >= 3) {
    actions.push(`${busiest.name} มีงานเลยกำหนด ${nf(busiest.overdue_tasks)} รายการ ควรเข้าไปช่วยดู`);
  }

  if (s.done_last_7_days > 0) {
    lines.push(`ปิดงานไปแล้ว ${nf(s.done_last_7_days)} รายการใน 7 วันที่ผ่านมา`);
  }

  if (actions.length === 0 && open > 0) {
    actions.push('ไม่มีงานเร่งด่วนค้าง เดินตามแผนเดิมได้เลย');
  }

  return { lines, actions, byAi: false };
}

const SYSTEM_PROMPT = `คุณเป็นผู้ช่วยหัวหน้าทีมบัญชีในประเทศไทย
สรุปสถานะงานให้หัวหน้าทีมอ่านตอนเช้า โดยใช้ "เฉพาะตัวเลขที่ให้มา" ห้ามคิดตัวเลขขึ้นเอง
ตอบเป็น JSON เท่านั้น รูปแบบ {"lines":["..."],"actions":["..."]}
- lines : 3-4 บรรทัด สรุปภาพรวมเป็นภาษาไทยแบบกระชับ เป็นกันเองแต่ไม่เล่น
- actions : 2-4 ข้อ สิ่งที่ควรลงมือทำวันนี้ เรียงตามความสำคัญ
ถ้ามีงานเลยกำหนดให้พูดถึงก่อนเสมอ`;

/** ให้ AI เรียบเรียงจากตัวเลขชุดเดียวกัน — ถ้าล้มเหลวจะคืนสรุปแบบกฎแทน */
export async function aiBrief(s: TaskSummary): Promise<Brief> {
  const fallback = ruleBrief(s);

  const res = await askJson(
    SYSTEM_PROMPT,
    JSON.stringify({
      งานค้าง: s.counts,
      เลยกำหนด: s.overdue_count,
      งานเลยกำหนด5รายการแรก: s.overdue.slice(0, 5).map((o) => ({
        ชื่องาน: o.title, เลยมากี่วัน: o.days_late, ความสำคัญ: o.priority,
      })),
      ครบกำหนดวันนี้: s.due_today,
      ครบกำหนดใน7วัน: s.due_week,
      ยังไม่มอบหมาย: s.unassigned,
      ปิดไปใน7วัน: s.done_last_7_days,
      ภาระงานรายคน: s.workload.slice(0, 6),
    })
  );

  if (!res.ok) return { ...fallback, note: res.note };

  const lines = Array.isArray(res.data?.lines) ? res.data.lines.filter((x: any) => typeof x === 'string') : [];
  const actions = Array.isArray(res.data?.actions) ? res.data.actions.filter((x: any) => typeof x === 'string') : [];
  if (!lines.length) return { ...fallback, note: 'AI ตอบไม่ครบ จึงใช้สรุปอัตโนมัติแทน' };

  return { lines, actions, byAi: true };
}
