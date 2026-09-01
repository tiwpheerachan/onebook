import type { DocKind } from '@/lib/constants';

export interface PrintForm {
  /** ชื่อเอกสารภาษาไทยที่ต้องปรากฏบนกระดาษ */
  th: string;
  /** ชื่อภาษาอังกฤษ (พิมพ์ตัวเล็กใต้ชื่อไทย) */
  en: string;
  /** เอกสารทางภาษี ต้องพิมพ์ "ต้นฉบับ / สำเนา" และแสดงเลขผู้เสียภาษีทั้งสองฝ่าย */
  isTaxDoc: boolean;
  /** ฝั่งขาย = ส่งให้ลูกค้า, ฝั่งซื้อ = ส่งให้ผู้ขาย */
  side: 'sales' | 'purchase';
  /** ข้อความช่องลงนามฝั่งซ้าย (ผู้รับ) */
  signLeft: string;
  /** แสดง QR พร้อมเพย์ให้ลูกค้าสแกนจ่าย */
  showPayment: boolean;
}

/**
 * ชื่อเอกสารตามที่ใช้จริงในไทย
 * ใบกำกับภาษีนิยมพิมพ์รวมกับใบส่งของในใบเดียว จึงใช้ชื่อ "ใบกำกับภาษี/ใบส่งของ"
 */
export const PRINT_FORM: Record<DocKind, PrintForm> = {
  quotation:            { th: 'ใบเสนอราคา',              en: 'QUOTATION',        isTaxDoc: false, side: 'sales',    signLeft: 'ผู้อนุมัติสั่งซื้อ',  showPayment: false },
  sales_order:          { th: 'ใบสั่งขาย',              en: 'SALES ORDER',      isTaxDoc: false, side: 'sales',    signLeft: 'ผู้สั่งซื้อ',        showPayment: false },
  delivery_order:       { th: 'ใบส่งของ',                en: 'DELIVERY ORDER',   isTaxDoc: false, side: 'sales',    signLeft: 'ผู้รับสินค้า',      showPayment: false },
  billing_note:         { th: 'ใบวางบิล',                en: 'BILLING NOTE',     isTaxDoc: false, side: 'sales',    signLeft: 'ผู้รับวางบิล',      showPayment: true },
  invoice:              { th: 'ใบแจ้งหนี้',              en: 'INVOICE',          isTaxDoc: false, side: 'sales',    signLeft: 'ผู้รับเอกสาร',      showPayment: true },
  tax_invoice:          { th: 'ใบกำกับภาษี/ใบส่งของ',    en: 'TAX INVOICE',      isTaxDoc: true,  side: 'sales',    signLeft: 'ผู้รับสินค้า',      showPayment: true },
  receipt:              { th: 'ใบเสร็จรับเงิน',          en: 'RECEIPT',          isTaxDoc: true,  side: 'sales',    signLeft: 'ผู้จ่ายเงิน',       showPayment: false },
  credit_note:          { th: 'ใบลดหนี้/ใบกำกับภาษี',    en: 'CREDIT NOTE',      isTaxDoc: true,  side: 'sales',    signLeft: 'ผู้รับเอกสาร',      showPayment: false },
  debit_note:           { th: 'ใบเพิ่มหนี้/ใบกำกับภาษี', en: 'DEBIT NOTE',       isTaxDoc: true,  side: 'sales',    signLeft: 'ผู้รับเอกสาร',      showPayment: true },
  deposit_receipt:      { th: 'ใบรับเงินมัดจำ',          en: 'DEPOSIT RECEIPT',  isTaxDoc: true,  side: 'sales',    signLeft: 'ผู้จ่ายเงิน',       showPayment: false },

  purchase_request:     { th: 'ใบขอซื้อ',                en: 'PURCHASE REQUEST', isTaxDoc: false, side: 'purchase', signLeft: 'ผู้ขอซื้อ',         showPayment: false },
  purchase_order:       { th: 'ใบสั่งซื้อ',              en: 'PURCHASE ORDER',   isTaxDoc: false, side: 'purchase', signLeft: 'ผู้ขาย',            showPayment: false },
  goods_receipt:        { th: 'ใบรับสินค้า',             en: 'GOODS RECEIPT',    isTaxDoc: false, side: 'purchase', signLeft: 'ผู้ส่งสินค้า',      showPayment: false },
  bill:                 { th: 'ใบรับวางบิล',             en: 'BILL',             isTaxDoc: false, side: 'purchase', signLeft: 'ผู้วางบิล',         showPayment: false },
  expense:              { th: 'ใบสำคัญจ่าย',             en: 'PAYMENT VOUCHER',  isTaxDoc: false, side: 'purchase', signLeft: 'ผู้รับเงิน',        showPayment: false },
  purchase_credit_note: { th: 'ใบลดหนี้ (รับ)',          en: 'CREDIT NOTE',      isTaxDoc: false, side: 'purchase', signLeft: 'ผู้ออกเอกสาร',      showPayment: false },
  purchase_debit_note:  { th: 'ใบเพิ่มหนี้ (รับ)',       en: 'DEBIT NOTE',       isTaxDoc: false, side: 'purchase', signLeft: 'ผู้ออกเอกสาร',      showPayment: false },
  deposit_payment:      { th: 'ใบจ่ายเงินมัดจำ',         en: 'DEPOSIT PAYMENT',  isTaxDoc: false, side: 'purchase', signLeft: 'ผู้รับเงิน',        showPayment: false },
};

/** ป้ายกำกับฉบับที่พิมพ์ : ฉบับแรกเป็นต้นฉบับ ที่เหลือต้องระบุว่าเป็นสำเนา */
export function copyLabel(copyNo: number): string {
  return copyNo <= 1 ? 'ต้นฉบับ (ORIGINAL)' : `สำเนา (COPY ${copyNo - 1})`;
}
