import { round2 } from './format';

export const VAT_RATE = 7; // อัตราภาษีมูลค่าเพิ่มปัจจุบันของประเทศไทย

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

/** อัตราภาษีหัก ณ ที่จ่ายมาตรฐาน (ใช้เป็นค่าตั้งต้นก่อนดึงจากฐานข้อมูล) */
export const WHT_PRESETS = [
  { code: 'NONE', label: 'ไม่หักภาษี ณ ที่จ่าย', rate: 0, pnd: '-' },
  { code: '40(8)SVC', label: 'ค่าจ้างทำของ / ค่าบริการ', rate: 3, pnd: 'ภ.ง.ด.53' },
  { code: '40(6)', label: 'ค่าวิชาชีพอิสระ', rate: 3, pnd: 'ภ.ง.ด.53' },
  { code: '40(5)', label: 'ค่าเช่าทรัพย์สิน', rate: 5, pnd: 'ภ.ง.ด.53' },
  { code: '40(8)ADV', label: 'ค่าโฆษณา', rate: 2, pnd: 'ภ.ง.ด.53' },
  { code: '40(8)TRN', label: 'ค่าขนส่ง', rate: 1, pnd: 'ภ.ง.ด.53' },
  { code: '40(8)INS', label: 'เบี้ยประกันวินาศภัย', rate: 1, pnd: 'ภ.ง.ด.53' },
  { code: '40(8)PRZ', label: 'รางวัล/ส่งเสริมการขาย', rate: 3, pnd: 'ภ.ง.ด.53' },
  { code: '40(2)J', label: 'ค่านายหน้า/ค่าธรรมเนียม', rate: 3, pnd: 'ภ.ง.ด.53' },
  { code: '40(4)B', label: 'เงินปันผล', rate: 10, pnd: 'ภ.ง.ด.2' },
  { code: '40(4)AJ', label: 'ดอกเบี้ย (นิติบุคคล)', rate: 1, pnd: 'ภ.ง.ด.53' },
];

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

/** แปลงจำนวนเงินเป็นตัวอักษรภาษาไทย (ใช้ในเอกสารทางการ) */
export function bahtText(amount: number): string {
  const num = ['ศูนย์','หนึ่ง','สอง','สาม','สี่','ห้า','หก','เจ็ด','แปด','เก้า'];
  const pos = ['','สิบ','ร้อย','พัน','หมื่น','แสน','ล้าน'];
  const readInt = (s: string): string => {
    if (s === '0') return '';
    let out = '';
    const len = s.length;
    for (let i = 0; i < len; i++) {
      const d = Number(s[i]);
      const p = len - i - 1;
      if (d === 0) continue;
      if (p === 1 && d === 1) out += 'สิบ';
      else if (p === 1 && d === 2) out += 'ยี่สิบ';
      else if (p === 0 && d === 1 && len > 1) out += 'เอ็ด';
      else out += num[d] + pos[p % 7];
    }
    return out;
  };
  const neg = amount < 0;
  const fixed = Math.abs(Number(amount) || 0).toFixed(2);
  const [i, f] = fixed.split('.');
  let text = '';
  if (i.length > 6) {
    text = readInt(i.slice(0, i.length - 6)) + 'ล้าน' + readInt(i.slice(-6));
  } else {
    text = readInt(i);
  }
  if (!text) text = 'ศูนย์';
  text += 'บาท';
  text += f === '00' ? 'ถ้วน' : readInt(f.replace(/^0/, '')) + 'สตางค์';
  return (neg ? 'ลบ' : '') + text;
}
