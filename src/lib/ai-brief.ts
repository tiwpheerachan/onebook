import 'server-only';
import { askJson, isAiConfigured as aiReady } from './ai-client';
import type { Dictionary } from '@/i18n';
import { taskBriefPrompt } from './ai-prompts';

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

/** สรุปด้วยกฎ — ใช้งานได้ทันทีโดยไม่ต้องตั้งค่าอะไร และเป็นตัวสำรองเมื่อ AI ล่ม */
export function ruleBrief(s: TaskSummary, d: Dictionary): Brief {
  const L = d.ui.taskBrief;
  const nf = (n: number) => n.toLocaleString('en-US');
  const fill = (tpl: string, vars: Record<string, string | number>) =>
    Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), tpl);

  const lines: string[] = [];
  const actions: string[] = [];

  const open = s.counts.todo + s.counts.in_progress + s.counts.blocked + s.counts.review;

  if (open === 0 && s.counts.total > 0) {
    lines.push(L.allClosed);
  } else if (s.counts.total === 0) {
    lines.push(L.noTasks);
  } else {
    lines.push(fill(L.openSummary, {
      open: nf(open), doing: nf(s.counts.in_progress),
      review: nf(s.counts.review), todo: nf(s.counts.todo),
    }));
  }

  if (s.overdue_count > 0) {
    const worst = s.overdue[0];
    lines.push(
      fill(L.overdueLine, { n: nf(s.overdue_count) }) +
      (worst ? fill(L.worstSuffix, { title: worst.title, days: nf(worst.days_late) }) : '')
    );
    actions.push(fill(L.catchUpAction, { n: nf(s.overdue_count) }));
  } else if (open > 0) {
    lines.push(L.onTrack);
  }

  if (s.due_today > 0) {
    lines.push(fill(L.dueTodayLine, { today: nf(s.due_today), week: nf(s.due_week) }));
    actions.push(fill(L.dueTodayAction, { n: nf(s.due_today) }));
  } else if (s.due_week > 0) {
    lines.push(fill(L.dueWeekLine, { n: nf(s.due_week) }));
  }

  if (s.counts.blocked > 0) {
    actions.push(fill(L.blockedAction, { n: nf(s.counts.blocked) }));
  }
  if (s.unassigned > 0) {
    actions.push(fill(L.unassignedAction, { n: nf(s.unassigned) }));
  }

  // เตือนเรื่องภาระงานกระจุกตัว
  const busiest = s.workload[0];
  if (busiest && s.workload.length > 1 && busiest.open_tasks >= 5) {
    const rest = s.workload.slice(1).reduce((a, w) => a + w.open_tasks, 0);
    if (busiest.open_tasks > rest) {
      actions.push(fill(L.concentrated, { name: busiest.name, n: nf(busiest.open_tasks) }));
    }
  }
  if (busiest && busiest.overdue_tasks >= 3) {
    actions.push(fill(L.personOverdue, { name: busiest.name, n: nf(busiest.overdue_tasks) }));
  }

  if (s.done_last_7_days > 0) {
    lines.push(fill(L.done7, { n: nf(s.done_last_7_days) }));
  }

  if (actions.length === 0 && open > 0) {
    actions.push(L.nothingUrgent);
  }

  return { lines, actions, byAi: false };
}

/** ให้ AI เรียบเรียงจากตัวเลขชุดเดียวกัน — ถ้าล้มเหลวจะคืนสรุปแบบกฎแทน */
export async function aiBrief(s: TaskSummary, d: Dictionary, locale: string): Promise<Brief> {
  const fallback = ruleBrief(s, d);

  const res = await askJson(
    taskBriefPrompt(locale),
    JSON.stringify({
      open_counts: s.counts,
      overdue_count: s.overdue_count,
      overdue_top5: s.overdue.slice(0, 5).map((o) => ({
        title: o.title, days_late: o.days_late, priority: o.priority,
      })),
      due_today: s.due_today,
      due_within_7_days: s.due_week,
      unassigned: s.unassigned,
      done_last_7_days: s.done_last_7_days,
      workload_by_person: s.workload.slice(0, 6),
    })
  );

  if (!res.ok) return { ...fallback, note: res.note };

  const lines = Array.isArray(res.data?.lines) ? res.data.lines.filter((x: any) => typeof x === 'string') : [];
  const actions = Array.isArray(res.data?.actions) ? res.data.actions.filter((x: any) => typeof x === 'string') : [];
  if (!lines.length) return { ...fallback, note: d.ui.taskBrief.aiIncomplete };

  return { lines, actions, byAi: true };
}
