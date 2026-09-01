import { round2 } from './format';

export const VAT_RATE = 7; // อัตราภาษีมูลค่าเพิ่มปัจจุบันของประเทศไทย

export { WHT_PRESETS } from './wht-form';

export type VatTreatment = 'exclusive' | 'inclusive' | 'zero_rated' | 'exempt' | 'none';

export interface LineInput {
  quantity: number;
  unit_price: number;
  discount_pct?: number;
  discount_amt?: number;
  vat_treatment: VatTreatment;
  vat_rate?: number;
  wht_rate?: number;
}

export interface LineResult {
  gross: number;
  discount: number;
  line_amount: number;  // ฐานก่อน VAT
  vat_amount: number;
  wht_amount: number;
  total: number;        // line_amount + vat
}

export function calcLine(l: LineInput): LineResult {
  const rate = l.vat_rate ?? VAT_RATE;
  const gross = round2((Number(l.quantity) || 0) * (Number(l.unit_price) || 0));
  const discount = round2(
    (l.discount_amt ? Number(l.discount_amt) : 0) + gross * ((Number(l.discount_pct) || 0) / 100)
  );
  const afterDiscount = round2(gross - discount);

  let base = afterDiscount;
  let vat = 0;

  switch (l.vat_treatment) {
    case 'exclusive':
      vat = round2(base * (rate / 100));
      break;
    case 'inclusive':
      base = round2(afterDiscount / (1 + rate / 100));
      vat = round2(afterDiscount - base);
      break;
    case 'zero_rated':
    case 'exempt':
    case 'none':
    default:
      vat = 0;
  }

  const wht = round2(base * ((Number(l.wht_rate) || 0) / 100));
  return { gross, discount, line_amount: base, vat_amount: vat, wht_amount: wht, total: round2(base + vat) };
}

export interface DocTotals {
  subtotal: number;
  discount_amount: number;
  vat_base: number;
  vat_amount: number;
  wht_amount: number;
  grand_total: number;
  net_payable: number;
}

export function calcDocument(lines: LineInput[], headerDiscount = 0): DocTotals {
  let subtotal = 0, discount = 0, vatBase = 0, vat = 0, wht = 0;
  for (const l of lines) {
    const r = calcLine(l);
    subtotal += r.gross;
    discount += r.discount;
    vatBase += r.line_amount;
    vat += r.vat_amount;
    wht += r.wht_amount;
  }
  const hd = Number(headerDiscount) || 0;
  if (hd > 0 && vatBase > 0) {
    const ratio = (vatBase - hd) / vatBase;
    vatBase = round2(vatBase - hd);
    vat = round2(vat * ratio);
    wht = round2(wht * ratio);
    discount = round2(discount + hd);
  }
  const grand = round2(vatBase + vat);
  return {
    subtotal: round2(subtotal),
    discount_amount: round2(discount),
    vat_base: round2(vatBase),
    vat_amount: round2(vat),
    wht_amount: round2(wht),
    grand_total: grand,
    net_payable: round2(grand - wht),
  };
}

/** ภ.พ.30 : ภาษีที่ต้องชำระ (ขาย - ซื้อ) */
export function calcPP30(outputVat: number, inputVat: number) {
  const diff = round2(outputVat - inputVat);
  return {
    output_vat: round2(outputVat),
    input_vat: round2(inputVat),
    payable: diff > 0 ? diff : 0,
    carry_forward: diff < 0 ? Math.abs(diff) : 0,
  };
}
