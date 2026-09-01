import type { Dictionary } from '@/i18n';
import { moneyIn } from './format';
import type { TaskKind, TaskPriority } from './task-meta';

/**
 * งานที่ระบบเสนอให้เพิ่มเข้าตาราง
 *
 * ทุกข้อต้องมี "ที่มา" จากข้อมูลจริงในระบบเสมอ (บิลค้างชำระ งานที่ติดปัญหา ปฏิทินภาษี)
 * ไม่ใช่ข้อความที่คิดขึ้นลอย ๆ ผู้ใช้จึงตรวจสอบย้อนกลับได้ว่าทำไมถึงถูกเสนอ
 */
export interface Suggestion {
  /** ใช้เป็น auto_key ในฐานข้อมูล กันเสนอ/สร้างซ้ำ */
  key: string;
  title: string;
  reason: string;
  kind: TaskKind;
  priority: TaskPriority;
  /** ครบกำหนดในอีกกี่วันนับจากวันนี้ */
  dueInDays: number;
  documentId?: string | null;
  contactId?: string | null;
  /** ติ๊กไว้ให้ล่วงหน้าไหม (เรื่องเร่งด่วนติ๊กให้เลย) */
  preselect: boolean;
}

export interface OverdueDoc {
  id: string;
  doc_number: string;
  contact_name: string;
  contact_id: string | null;
  days_late: number;
  outstanding: number;
}

export interface SuggestFacts {
  overdueDocs: OverdueDoc[];
  blocked: number;
  unassigned: number;
  overdueTasks: number;
  /** auto_key ที่มีอยู่แล้วในระบบ ใช้กรองข้อเสนอที่เพิ่มไปแล้วออก */
  existingKeys: string[];
  /** งวดภาษีที่ต้องยื่นเดือนนี้ เช่น 202607 */
  taxPeriod: string;
  taxPeriodLabel: string;
  hasTaxTasks: boolean;
}

/**
 * สร้างข้อเสนอจากข้อมูลจริง
 * เรียงตามความเร่งด่วน : เก็บเงินเข้าก่อน แล้วค่อยงานภายใน
 *
 * ข้อความที่ได้จะถูกบันทึกลงฐานข้อมูลตอนผู้ใช้กดเพิ่ม จึงใช้ภาษาที่ผู้ใช้กำลังใช้อยู่
 */
export function buildSuggestions(f: SuggestFacts, d: Dictionary, currency: string, locale: string): Suggestion[] {
  const L = d.ui.taskSuggest;
  const out: Suggestion[] = [];
  // ใช้สกุลเงินของบริษัท ไม่ฝัง ฿ ไว้ตรง ๆ เพราะบริษัทในกลุ่มอาจตั้งสกุลอื่น
  const money = (n: number) => moneyIn(n, currency, locale);

  // 1) ตามเก็บเงินจากบิลที่เลยกำหนดชำระ — กระทบกระแสเงินสดโดยตรง จึงมาก่อน
  for (const d of f.overdueDocs.slice(0, 5)) {
    out.push({
      key: `ar-${d.id}`,
      title: L.collect.replace('{doc}', d.doc_number).replace('{contact}', d.contact_name),
      reason: L.collectWhy.replace('{days}', String(d.days_late)).replace('{amount}', money(d.outstanding)),
      kind: 'task',
      priority: d.days_late > 30 ? 'urgent' : 'high',
      dueInDays: 0,
      documentId: d.id,
      contactId: d.contact_id,
      preselect: d.days_late > 30,
    });
  }

  // 2) เตรียมเอกสารยื่นภาษี — ตั้งล่วงหน้า 3 วันก่อนวันสุดท้าย
  if (!f.hasTaxTasks) {
    out.push({
      key: `prep-vat-${f.taxPeriod}`,
      title: L.prepVat.replace('{period}', f.taxPeriodLabel),
      reason: L.prepVatWhy,
      kind: 'deadline',
      priority: 'high',
      dueInDays: 12 - new Date().getDate() > 0 ? 12 - new Date().getDate() : 2,
      preselect: true,
    });
  }

  // 3) งานที่ติดปัญหาจะฉุดงานอื่นตามไปด้วย ควรนัดเคลียร์
  if (f.blocked > 0) {
    out.push({
      key: `unblock-${f.taxPeriod}`,
      title: L.unblock.replace('{n}', String(f.blocked)),
      reason: L.unblockWhy.replace('{n}', String(f.blocked)),
      kind: 'meeting',
      priority: 'high',
      dueInDays: 1,
      preselect: f.blocked >= 3,
    });
  }

  // 4) งานที่ไม่มีเจ้าภาพมักกลายเป็นงานตกหล่น
  if (f.unassigned >= 3) {
    out.push({
      key: `assign-${f.taxPeriod}`,
      title: L.assign.replace('{n}', String(f.unassigned)),
      reason: L.assignWhy,
      kind: 'task',
      priority: 'normal',
      dueInDays: 1,
      preselect: false,
    });
  }

  // 5) งานเลยกำหนดจำนวนมาก ควรกันเวลาไว้สะสางโดยเฉพาะ
  if (f.overdueTasks >= 5) {
    out.push({
      key: `catchup-${f.taxPeriod}`,
      title: L.catchup.replace('{n}', String(f.overdueTasks)),
      reason: L.catchupWhy.replace('{n}', String(f.overdueTasks)),
      kind: 'task',
      priority: 'urgent',
      dueInDays: 0,
      preselect: true,
    });
  }

  const taken = new Set(f.existingKeys);
  return out.filter((s) => !taken.has(s.key));
}
