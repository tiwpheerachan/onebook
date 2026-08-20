/**
 * ข้อเสนอจาก AI ที่ต้องให้คนกดยืนยันก่อนเสมอ
 *
 * ไฟล์นี้ไม่ใส่ server-only เพราะหน้าจอยืนยันต้องใช้ชื่อฟิลด์และชนิดข้อมูลด้วย
 * ในนี้มีแต่ตรรกะตรวจรูปแบบล้วน ๆ ไม่มีคีย์หรือความลับใด ๆ
 * และการตรวจที่นี่เป็นแค่ด่านแรก ด่านจริงอยู่ที่ confirmProposal ฝั่งเซิร์ฟเวอร์
 * ซึ่งตรวจใหม่ทั้งหมดโดยไม่เชื่อค่าที่ส่งมาจากเบราว์เซอร์
 *
 * หลักที่ยึด : AI "เสนอ" ได้อย่างเดียว ไม่มีทางลงมือเอง
 *   - เส้นทางที่ AI เรียกไม่มีคำสั่งเขียนฐานข้อมูลเลยสักบรรทัด
 *   - การลงมือจริงอยู่ที่ server action ที่คนกดเท่านั้น
 *     และตรวจทุกอย่างใหม่ตั้งแต่ต้น ไม่เชื่อสิ่งที่ AI ส่งมาแม้แต่ค่าเดียว
 *   - รายการที่ทำได้เป็นบัญชีขาว ถ้า AI เสนอนอกรายการนี้จะถูกปฏิเสธ
 *
 * ทำไมไม่ให้แก้ยอดเงินหรือบรรทัดรายการ
 *   ยอดเงินเป็นตัวเลขที่ไหลต่อไปยังสมุดรายวัน ภาษี และงบการเงิน
 *   ถ้า AI อ่านคำสั่งผิดแล้วแก้ยอด ความเสียหายจะไปโผล่ที่งบตอนปิดงวด
 *   ซึ่งกว่าจะเจอก็ผ่านไปเป็นเดือน — ให้แก้ที่หน้าเอกสารเองปลอดภัยกว่า
 *   ที่เหลือไว้จึงเป็นฟิลด์ที่แก้แล้วย้อนกลับได้และไม่กระทบตัวเลข
 */

export type ProposalAction = 'approve' | 'void' | 'update_fields';

/** ฟิลด์ที่ยอมให้ AI เสนอแก้ได้ — แก้แล้วไม่กระทบยอดเงินและย้อนกลับได้ */
export const EDITABLE_FIELDS = ['due_date', 'reference', 'notes', 'internal_note'] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

export interface Proposal {
  action: ProposalAction;
  document_id: string;
  /** ใช้กันเอกสารถูกแก้โดยคนอื่นระหว่างที่ยังไม่กดยืนยัน */
  expected_updated_at: string;
  /** เฉพาะ update_fields */
  changes?: { field: EditableField; from: unknown; to: unknown }[];
  /** เฉพาะ void */
  reason?: string;
  /** คำอธิบายจาก AI ว่าทำไมถึงเสนอแบบนี้ */
  rationale: string;
  /** ข้อมูลเอกสารไว้แสดงบนหน้าจอยืนยัน */
  doc: { number: string; kind: string; date: string; total: number; status: string; contact: string | null };
  /** เหตุผลที่ทำไม่ได้ ถ้ามีแม้ข้อเดียวจะกดยืนยันไม่ได้ */
  blockers: string[];
}

export const PERM_FOR: Record<ProposalAction, { resource: string; action: string }> = {
  approve: { resource: 'documents', action: 'approve' },
  void: { resource: 'documents', action: 'void' },
  update_fields: { resource: 'documents', action: 'edit' },
};

/**
 * ตรวจสิ่งที่ AI ส่งกลับมาว่าอยู่ในรูปที่รับได้หรือไม่
 * คืน null เมื่อรูปแบบผิด — ดีกว่าปล่อยของเพี้ยนไปถึงหน้าจอยืนยัน
 */
export function parseProposal(raw: any): Omit<Proposal, 'doc' | 'blockers' | 'expected_updated_at'> | null {
  if (!raw || typeof raw !== 'object') return null;

  const action = String(raw.action || '') as ProposalAction;
  if (!['approve', 'void', 'update_fields'].includes(action)) return null;

  const document_id = String(raw.document_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(document_id)) return null;

  const rationale = String(raw.rationale || '').slice(0, 400);

  if (action === 'void') {
    const reason = String(raw.reason || '').trim().slice(0, 200);
    // บังคับให้มีเหตุผล เพราะการยกเลิกต้องตอบผู้สอบบัญชีได้ว่าทำไม
    if (reason.length < 3) return null;
    return { action, document_id, reason, rationale };
  }

  if (action === 'update_fields') {
    const list = Array.isArray(raw.changes) ? raw.changes : [];
    const changes = list
      .filter((c: any) => EDITABLE_FIELDS.includes(c?.field))
      .slice(0, 4)
      .map((c: any) => ({ field: c.field as EditableField, from: null, to: normalise(c.field, c.to) }))
      .filter((c: any) => c.to !== undefined);
    if (changes.length === 0) return null;
    return { action, document_id, changes, rationale };
  }

  return { action, document_id, rationale };
}

/** บีบค่าที่ AI ส่งมาให้อยู่ในรูปที่ฐานข้อมูลรับได้ ค่าที่ผิดรูปจะถูกทิ้ง */
function normalise(field: EditableField, v: unknown): unknown {
  if (v === null) return null;
  const s = String(v ?? '').trim();
  if (field === 'due_date') {
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
  }
  if (s.length > 1000) return undefined;
  return s;
}

export const FIELD_LABEL: Record<EditableField, { th: string; en: string; zh: string }> = {
  due_date:      { th: 'วันครบกำหนด', en: 'Due date', zh: '到期日' },
  reference:     { th: 'เลขที่อ้างอิง', en: 'Reference', zh: '参考号' },
  notes:         { th: 'หมายเหตุ (แสดงบนเอกสาร)', en: 'Notes (shown on the document)', zh: '备注（显示在单据上）' },
  internal_note: { th: 'บันทึกภายใน', en: 'Internal note', zh: '内部备注' },
};
