import { SALES_KINDS, SLUG_BY_KIND, type DocKind } from './constants';

/** ผลค้นหาจาก rpt_global_search — ใช้ร่วมกันทั้งฝั่ง server และ client */
export interface SearchDoc {
  id: string; kind: DocKind; doc_number: string; doc_date: string;
  status: string; grand_total: number; currency: string; contact: string | null;
}
export interface SearchContact {
  id: string; code: string; name: string; kind: string;
  tax_id: string | null; phone: string | null; email: string | null;
}
export interface SearchProduct {
  id: string; sku: string; name: string; unit: string; sale_price: number; is_active: boolean;
}
export interface SearchTask {
  id: string; title: string; status: string; priority: string; due_at: string | null;
}
export interface SearchResult {
  documents: SearchDoc[]; contacts: SearchContact[];
  products: SearchProduct[]; tasks: SearchTask[];
}

export const EMPTY_RESULT: SearchResult = { documents: [], contacts: [], products: [], tasks: [] };

/** เอกสารขายกับเอกสารซื้ออยู่คนละสาขาของ URL */
export function docHref(kind: DocKind, id: string): string {
  const base = SALES_KINDS.includes(kind) ? 'sales' : 'purchase';
  return `/${base}/${SLUG_BY_KIND[kind]}/${id}`;
}

export const DOC_KIND_TH: Record<string, string> = {
  quotation: 'ใบเสนอราคา', billing_note: 'ใบวางบิล', invoice: 'ใบแจ้งหนี้',
  tax_invoice: 'ใบกำกับภาษี', receipt: 'ใบเสร็จรับเงิน', credit_note: 'ใบลดหนี้',
  debit_note: 'ใบเพิ่มหนี้', deposit_receipt: 'ใบรับมัดจำ',
  purchase_request: 'ใบขอซื้อ', purchase_order: 'ใบสั่งซื้อ', goods_receipt: 'ใบรับของ',
  bill: 'ใบรับวางบิล', expense: 'ค่าใช้จ่าย', purchase_credit_note: 'ใบลดหนี้ซื้อ',
  purchase_debit_note: 'ใบเพิ่มหนี้ซื้อ', deposit_payment: 'จ่ายมัดจำ',
};

export const CONTACT_KIND_TH: Record<string, string> = {
  customer: 'ลูกค้า', vendor: 'ผู้ขาย', both: 'ลูกค้า/ผู้ขาย', employee: 'พนักงาน', other: 'อื่น ๆ',
};

export const TASK_STATUS_TH: Record<string, string> = {
  todo: 'รอเริ่ม', in_progress: 'กำลังทำ', blocked: 'ติดปัญหา',
  done: 'เสร็จแล้ว', cancelled: 'ยกเลิก',
};

export function countResults(r: SearchResult): number {
  return r.documents.length + r.contacts.length + r.products.length + r.tasks.length;
}
