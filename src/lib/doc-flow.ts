import type { DocKind } from './constants';

/**
 * สายงานเอกสารตามที่ใช้จริงในไทย — แปลงเอกสารต่อเนื่องโดยไม่ต้องคีย์ใหม่
 *
 * ฝั่งขาย  ใบเสนอราคา → ใบแจ้งหนี้/ใบวางบิล → ใบกำกับภาษี → ใบเสร็จรับเงิน
 * ฝั่งซื้อ  ใบขอซื้อ → ใบสั่งซื้อ → ใบรับสินค้า → ซื้อสินค้า/บริการ
 *
 * เอกสารปลายทางจะอ้างถึงเอกสารต้นทางไว้เสมอ (ref_document_id) เพื่อให้ตรวจสอบย้อนกลับได้
 */
export const DOC_FLOW: Partial<Record<DocKind, DocKind[]>> = {
  quotation: ['invoice', 'billing_note', 'tax_invoice'],
  billing_note: ['invoice', 'tax_invoice', 'receipt'],
  invoice: ['tax_invoice', 'billing_note', 'receipt'],
  tax_invoice: ['receipt', 'credit_note', 'debit_note'],
  deposit_receipt: ['tax_invoice', 'invoice'],

  purchase_request: ['purchase_order'],
  purchase_order: ['goods_receipt', 'bill'],
  goods_receipt: ['bill'],
  bill: ['expense'],
};

/** เอกสารที่แปลงต่อได้จากต้นทางนี้ */
export function nextKinds(kind: DocKind): DocKind[] {
  return DOC_FLOW[kind] || [];
}

export function canConvert(from: DocKind, to: DocKind): boolean {
  return nextKinds(from).includes(to);
}

/**
 * เอกสารที่ต้องมีวันครบกำหนดชำระ
 * เอกสารที่รับเงินแล้ว (ใบเสร็จ) ไม่ต้องมี
 */
export const NEEDS_DUE_DATE: DocKind[] = [
  'invoice', 'billing_note', 'tax_invoice', 'debit_note', 'bill', 'purchase_order',
];
