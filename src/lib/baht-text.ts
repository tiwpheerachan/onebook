/**
 * แปลงจำนวนเงินเป็นตัวอักษรไทย ตามแบบที่กรมสรรพากรกำหนดให้แสดงบนใบกำกับภาษี
 *
 * กฎที่คนมักทำพลาด
 *   - หลักสิบ 1 อ่าน "สิบ" ไม่ใช่ "หนึ่งสิบ"     : 10 -> สิบบาทถ้วน
 *   - หลักสิบ 2 อ่าน "ยี่สิบ" ไม่ใช่ "สองสิบ"     : 20 -> ยี่สิบบาทถ้วน
 *   - หลักหน่วยเป็น 1 และมีหลักสิบ อ่าน "เอ็ด"    : 21 -> ยี่สิบเอ็ดบาทถ้วน
 *   - เกินล้าน วนอ่านซ้ำเป็นชุดละ 6 หลัก        : 1,000,001 -> หนึ่งล้านหนึ่งบาทถ้วน
 *   - ไม่มีเศษสตางค์ ลงท้าย "ถ้วน"
 */

const DIGIT = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const PLACE = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

/** อ่านจำนวนเต็มไม่เกิน 6 หลัก (1–999,999) */
function readGroup(n: number): string {
  let out = '';
  const s = String(n);
  const len = s.length;
  for (let i = 0; i < len; i++) {
    const digit = Number(s[i]);
    const place = len - i - 1;
    if (digit === 0) continue;
    if (place === 1 && digit === 1) out += 'สิบ';
    else if (place === 1 && digit === 2) out += 'ยี่สิบ';
    else if (place === 0 && digit === 1 && len > 1) out += 'เอ็ด';
    else out += DIGIT[digit] + PLACE[place];
  }
  return out;
}

/** อ่านจำนวนเต็มขนาดใดก็ได้ โดยตัดเป็นชุดละ 6 หลักแล้วต่อคำว่า "ล้าน" */
function readInteger(n: number): string {
  if (n === 0) return 'ศูนย์';
  const groups: number[] = [];
  let rest = n;
  while (rest > 0) {
    groups.unshift(rest % 1_000_000);
    rest = Math.floor(rest / 1_000_000);
  }
  return groups
    .map((g, i) => {
      const isLast = i === groups.length - 1;
      // ชุดที่เป็น 0 ล้วน ยังต้องนับ "ล้าน" ต่อท้ายชุดก่อนหน้า จึงคืนค่าว่างแล้วเติมล้านทีหลัง
      const word = g === 0 ? '' : readGroup(g);
      return word + (isLast ? '' : 'ล้าน');
    })
    .join('');
}

export interface BahtTextOptions {
  /** ใส่คำว่า "ถ้วน" เมื่อไม่มีเศษสตางค์ (ค่าเริ่มต้น: ใส่) */
  suffix?: boolean;
}

/**
 * แปลงตัวเลขเป็นข้อความภาษาไทย เช่น 1605.25 -> "หนึ่งพันหกร้อยห้าบาทยี่สิบห้าสตางค์"
 * ค่าติดลบจะขึ้นต้นด้วย "ลบ"
 */
export function bahtText(amount: number | string | null | undefined, opts: BahtTextOptions = {}): string {
  const raw = Number(amount);
  if (!Number.isFinite(raw)) return '';

  const negative = raw < 0;
  // ปัดเป็นสตางค์ก่อน กันปัญหาทศนิยมลอยตัว เช่น 0.1 + 0.2
  const satangTotal = Math.round(Math.abs(raw) * 100);
  const baht = Math.floor(satangTotal / 100);
  const satang = satangTotal % 100;

  let out = '';
  if (baht === 0 && satang === 0) {
    out = 'ศูนย์บาทถ้วน';
  } else {
    if (baht > 0) out += readInteger(baht) + 'บาท';
    if (satang > 0) {
      if (baht === 0) out += 'ศูนย์บาท';
      out += readGroup(satang) + 'สตางค์';
    } else if (opts.suffix !== false) {
      out += 'ถ้วน';
    }
  }
  return (negative ? 'ลบ' : '') + out;
}

/* ── ภาษาอังกฤษ สำหรับเอกสารที่ออกให้ลูกค้าต่างประเทศ ─────────────────────── */

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALE = ['', ' thousand', ' million', ' billion', ' trillion'];

function readEnUnder1000(n: number): string {
  if (n === 0) return '';
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
  return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + readEnUnder1000(n % 100) : '');
}

function readEnInteger(n: number): string {
  if (n === 0) return 'zero';
  const parts: string[] = [];
  let rest = n;
  let scale = 0;
  while (rest > 0) {
    const chunk = rest % 1000;
    if (chunk) parts.unshift(readEnUnder1000(chunk) + SCALE[scale]);
    rest = Math.floor(rest / 1000);
    scale++;
  }
  return parts.join(' ');
}

/** 1605.25 -> "One thousand six hundred five baht and twenty-five satang" */
export function bahtTextEn(amount: number | string | null | undefined): string {
  const raw = Number(amount);
  if (!Number.isFinite(raw)) return '';
  const negative = raw < 0;
  const satangTotal = Math.round(Math.abs(raw) * 100);
  const baht = Math.floor(satangTotal / 100);
  const satang = satangTotal % 100;

  let out = readEnInteger(baht) + ' baht';
  out += satang > 0 ? ` and ${readEnInteger(satang)} satang` : ' only';
  out = out.charAt(0).toUpperCase() + out.slice(1);
  return (negative ? 'Minus ' : '') + out;
}
