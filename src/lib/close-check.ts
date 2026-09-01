import 'server-only';
import { askJson } from './ai-client';
import { closeBriefPrompt } from './ai-prompts';
import type { Dictionary } from '@/i18n';

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

/** ชื่อระดับความรุนแรงอยู่ในพจนานุกรม (ui.closeCheck.sev) ที่นี่เก็บแต่สีและลำดับ */
export const SEVERITY = {
  error:   { chip: 'bg-rose-50 text-rose-700 ring-rose-200',     bar: 'bg-rose-500',  rank: 0 },
  warning: { chip: 'bg-amber-50 text-amber-800 ring-amber-200',  bar: 'bg-amber-500', rank: 1 },
  info:    { chip: 'bg-sky-50 text-sky-700 ring-sky-200',        bar: 'bg-sky-500',   rank: 2 },
} as const;

/** เรียงให้เรื่องที่ต้องแก้ขึ้นก่อนเสมอ */
export function sortFindings(f: Finding[]): Finding[] {
  return [...f].sort((a, b) => SEVERITY[a.severity].rank - SEVERITY[b.severity].rank || b.count - a.count);
}

export interface CloseBrief {
  lines: string[];
  actions: string[];
  byAi: boolean;
  note?: string;
}

/** สรุปด้วยกฎ ใช้ได้ทันทีและเป็นตัวสำรองเมื่อ AI ใช้ไม่ได้ */
export function ruleCloseBrief(c: CloseCheck, d: Dictionary): CloseBrief {
  const L = d.ui.closeBrief;
  const lines: string[] = [];
  const actions: string[] = [];
  const sorted = sortFindings(c.findings);

  if (c.findings.length === 0) {
    lines.push(L.allClear);
    actions.push(L.lockPeriod);
    return { lines, actions, byAi: false };
  }

  if (c.errors > 0) {
    lines.push(L.hasErrors.replace('{n}', String(c.errors)));
  } else {
    lines.push(L.noErrors);
  }
  if (c.warnings > 0) {
    lines.push(L.warnLine.replace('{warn}', String(c.warnings)).replace('{info}', String(c.infos)));
  }

  for (const f of sorted.filter((x) => x.severity === 'error').slice(0, 3)) {
    actions.push(f.title);
  }
  if (actions.length < 3) {
    for (const f of sorted.filter((x) => x.severity === 'warning').slice(0, 3 - actions.length)) {
      actions.push(f.title);
    }
  }
  if (c.errors === 0 && c.warnings === 0) actions.push(L.lockPeriod);

  return { lines, actions, byAi: false };
}

/** ให้ AI เรียบเรียงจากผลตรวจชุดเดียวกัน ตัวเลขยังมาจากฐานข้อมูลเสมอ */
export async function aiCloseBrief(c: CloseCheck, d: Dictionary, locale: string): Promise<CloseBrief> {
  const fallback = ruleCloseBrief(c, d);

  const res = await askJson(
    closeBriefPrompt(locale),
    JSON.stringify({
      period: c.period,
      errors: c.errors, warnings: c.warnings, infos: c.infos,
      findings: c.findings.map((f) => ({
        severity: f.severity, category: f.category, title: f.title, count: f.count, amount: f.amount,
      })),
    })
  );

  if (!res.ok) return { ...fallback, note: res.note };

  const lines = Array.isArray(res.data?.lines) ? res.data.lines.filter((x: any) => typeof x === 'string') : [];
  const actions = Array.isArray(res.data?.actions) ? res.data.actions.filter((x: any) => typeof x === 'string') : [];
  if (!lines.length) return { ...fallback, note: d.ui.closeBrief.aiIncomplete };

  return { lines, actions, byAi: true };
}
