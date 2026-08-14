/**
 * สร้าง XML ใบกำกับภาษีอิเล็กทรอนิกส์ตามมาตรฐาน ETDA (ขมธอ. 3-2560 / UN-CEFACT CII)
 *
 * ข้อจำกัดสำคัญที่ต้องรู้
 *   ไฟล์ที่ได้จากที่นี่คือ "เอกสารก่อนลงลายมือชื่อ" เท่านั้น
 *   การส่งกรมสรรพากรต้องลงลายมือชื่อดิจิทัลด้วยใบรับรองจาก CA ที่ได้รับการรับรอง
 *   และส่งผ่านผู้ให้บริการที่ ETDA รับรอง — ดู signEtaxDocument() ใน src/lib/etax-provider.ts
 */

export interface EtaxSeller {
  name: string;
  tax_id: string;
  branch_code: string;
  address: string;
  postcode?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface EtaxBuyer {
  name: string;
  tax_id?: string | null;
  branch_code?: string | null;
  address?: string | null;
  postcode?: string | null;
  email?: string | null;
}

export interface EtaxLine {
  line_no: number;
  description: string;
  quantity: number;
  unit?: string | null;
  unit_price: number;
  line_amount: number;
  vat_rate: number;
  vat_amount: number;
}

export interface EtaxInput {
  doc_type_code: string;   // 388 ใบกำกับภาษี, 80 ใบเพิ่มหนี้, 81 ใบลดหนี้, T02 ใบเสร็จรับเงิน
  doc_number: string;
  doc_date: string;        // YYYY-MM-DD
  purpose_code?: string | null;  // เหตุผลของใบเพิ่ม/ลดหนี้
  reference_number?: string | null;
  reference_date?: string | null;
  seller: EtaxSeller;
  buyer: EtaxBuyer;
  lines: EtaxLine[];
  subtotal: number;
  vat_amount: number;
  grand_total: number;
  currency?: string;
}

/** รหัสประเภทเอกสาร ETDA ตามชนิดเอกสารของ ONEBOOK */
export const ETAX_TYPE_BY_KIND: Record<string, string> = {
  tax_invoice: '388',
  invoice: '388',
  receipt: 'T02',
  debit_note: '80',
  credit_note: '81',
};

export function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const d2 = (n: number) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
const dt = (s: string) => String(s || '').replace(/-/g, '');

/** ตรวจข้อมูลที่กรมสรรพากรบังคับ ก่อนสร้างไฟล์ */
export function validateEtax(input: EtaxInput): string[] {
  const errs: string[] = [];
  if (!/^\d{13}$/.test(input.seller.tax_id || '')) errs.push('เลขประจำตัวผู้เสียภาษีของผู้ขายต้องมี 13 หลัก');
  if (!input.seller.name) errs.push('ต้องระบุชื่อผู้ขาย');
  if (!input.seller.address) errs.push('ต้องระบุที่อยู่ผู้ขาย');
  if (!/^\d{5}$/.test(input.seller.branch_code || '')) errs.push('รหัสสาขาผู้ขายต้องมี 5 หลัก (สำนักงานใหญ่ = 00000)');
  if (!input.doc_number) errs.push('ต้องระบุเลขที่เอกสาร');
  if (!input.doc_date) errs.push('ต้องระบุวันที่เอกสาร');
  if (!input.buyer.name) errs.push('ต้องระบุชื่อผู้ซื้อ');
  if (input.buyer.tax_id && !/^\d{13}$/.test(input.buyer.tax_id)) errs.push('เลขประจำตัวผู้เสียภาษีของผู้ซื้อต้องมี 13 หลัก');
  if (!input.lines?.length) errs.push('ต้องมีรายการสินค้า/บริการอย่างน้อย 1 รายการ');
  if ((input.doc_type_code === '80' || input.doc_type_code === '81') && !input.reference_number) {
    errs.push('ใบเพิ่มหนี้/ใบลดหนี้ต้องอ้างอิงเลขที่ใบกำกับภาษีเดิม');
  }
  const sum = (input.lines || []).reduce((s, l) => s + Number(l.line_amount || 0), 0);
  if (Math.abs(sum - Number(input.subtotal || 0)) > 0.05) {
    errs.push('ผลรวมรายการไม่ตรงกับยอดก่อนภาษี');
  }
  return errs;
}

/** สร้าง XML (CrossIndustryInvoice) พร้อมส่งต่อให้ผู้ให้บริการลงลายมือชื่อ */
export function buildEtaxXml(input: EtaxInput): string {
  const cur = input.currency || 'THB';
  const lines = input.lines
    .map(
      (l) => `    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>${esc(l.line_no)}</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        <ram:Name>${esc(l.description)}</ram:Name>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>
          <ram:ChargeAmount currencyID="${cur}">${d2(l.unit_price)}</ram:ChargeAmount>
        </ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="${esc(l.unit || 'C62')}">${Number(l.quantity)}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>${l.vat_rate > 0 ? 'S' : 'Z'}</ram:CategoryCode>
          <ram:RateApplicablePercent>${d2(l.vat_rate)}</ram:RateApplicablePercent>
          <ram:CalculatedAmount currencyID="${cur}">${d2(l.vat_amount)}</ram:CalculatedAmount>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount currencyID="${cur}">${d2(l.line_amount)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`
    )
    .join('\n');

  const ref =
    input.reference_number
      ? `      <ram:InvoiceReferencedDocument>
        <ram:IssuerAssignedID>${esc(input.reference_number)}</ram:IssuerAssignedID>
        <ram:FormattedIssueDateTime>
          <udt:DateTimeString format="102">${dt(input.reference_date || input.doc_date)}</udt:DateTimeString>
        </ram:FormattedIssueDateTime>
      </ram:InvoiceReferencedDocument>\n`
      : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocument>
    <ram:ID>${esc(input.doc_number)}</ram:ID>
    <ram:TypeCode>${esc(input.doc_type_code)}</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${dt(input.doc_date)}</udt:DateTimeString>
    </ram:IssueDateTime>${input.purpose_code ? `\n    <ram:PurposeCode>${esc(input.purpose_code)}</ram:PurposeCode>` : ''}
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
${lines}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${esc(input.seller.name)}</ram:Name>
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="TXID">${esc(input.seller.tax_id)}</ram:ID>
        </ram:SpecifiedTaxRegistration>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(input.seller.postcode || '')}</ram:PostcodeCode>
          <ram:LineOne>${esc(input.seller.address)}</ram:LineOne>
          <ram:CountryID>TH</ram:CountryID>
        </ram:PostalTradeAddress>
        <ram:DefinedTradeContact>
          <ram:EmailURIUniversalCommunication>
            <ram:URIID>${esc(input.seller.email || '')}</ram:URIID>
          </ram:EmailURIUniversalCommunication>
        </ram:DefinedTradeContact>
        <ram:ID schemeID="BRN">${esc(input.seller.branch_code)}</ram:ID>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${esc(input.buyer.name)}</ram:Name>${
    input.buyer.tax_id
      ? `\n        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="TXID">${esc(input.buyer.tax_id)}</ram:ID>
        </ram:SpecifiedTaxRegistration>`
      : ''
  }
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(input.buyer.postcode || '')}</ram:PostcodeCode>
          <ram:LineOne>${esc(input.buyer.address || '')}</ram:LineOne>
          <ram:CountryID>TH</ram:CountryID>
        </ram:PostalTradeAddress>${
          input.buyer.branch_code ? `\n        <ram:ID schemeID="BRN">${esc(input.buyer.branch_code)}</ram:ID>` : ''
        }
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${cur}</ram:InvoiceCurrencyCode>
${ref}      <ram:ApplicableTradeTax>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:CalculatedAmount currencyID="${cur}">${d2(input.vat_amount)}</ram:CalculatedAmount>
        <ram:BasisAmount currencyID="${cur}">${d2(input.subtotal)}</ram:BasisAmount>
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount currencyID="${cur}">${d2(input.subtotal)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount currencyID="${cur}">${d2(input.subtotal)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${cur}">${d2(input.vat_amount)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount currencyID="${cur}">${d2(input.grand_total)}</ram:GrandTotalAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}

/** SHA-256 ของ payload ไว้ยืนยันว่าไฟล์ที่ส่งกับที่เก็บเป็นชุดเดียวกัน */
export async function hashXml(xml: string): Promise<string> {
  const buf = new TextEncoder().encode(xml);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
