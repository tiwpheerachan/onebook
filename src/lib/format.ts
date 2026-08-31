export const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

export function money(n: number | string | null | undefined, digits = 2): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return '0.00';
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function compact(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return (v / 1_000_000).toFixed(2) + 'M';
  if (abs >= 1_000) return (v / 1_000).toFixed(1) + 'K';
  return money(v, 0);
}

export function toDateStr(d: Date | string | null | undefined): string {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
}

/** วันที่แบบไทย พ.ศ. เช่น 11 ส.ค. 2569 */
export function thaiDate(d: string | Date | null | undefined): string {
  if (!d) return '-';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return '-';
  return `${dt.getDate()} ${THAI_MONTHS[dt.getMonth()]} ${dt.getFullYear() + 543}`;
}

export function localeDate(d: string | Date | null | undefined, locale: string): string {
  if (!d) return '-';
  if (locale === 'th') return thaiDate(d);
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export function firstDayOfMonth(d = new Date()): string {
  return toDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
}
export function lastDayOfMonth(d = new Date()): string {
  return toDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}
export function firstDayOfYear(d = new Date()): string {
  return toDateStr(new Date(d.getFullYear(), 0, 1));
}

/** ตรวจเลขประจำตัวผู้เสียภาษี 13 หลัก (checksum กรมสรรพากร) */
export function isValidThaiTaxId(id: string): boolean {
  if (!/^\d{13}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(id[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(id[12]);
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * ชื่อสกุลเงินที่ผู้ใช้อ่านออก เช่น THB → "บาท (THB)" / "Baht (THB)" / "泰铢 (THB)"
 * ใช้กำกับยอดรวมบนหัวรายงาน ส่วนในช่องตารางยังเป็นตัวเลขล้วนเพื่อให้อ่านคอลัมน์ง่าย
 */
export function currencyLabel(code: string | null | undefined, locale: string): string {
  const c = (code || 'THB').toUpperCase();
  try {
    const tag = locale === 'th' ? 'th-TH' : locale === 'zh' ? 'zh-CN' : 'en-GB';
    const name = new Intl.DisplayNames([tag], { type: 'currency' }).of(c);
    return name && name !== c ? `${name} (${c})` : c;
  } catch {
    return c;
  }
}

/** จำนวนเงินพร้อมสัญลักษณ์สกุลเงิน ใช้กับยอดเดี่ยว ๆ ที่ไม่ได้อยู่ในคอลัมน์ */
export function moneyIn(
  n: number | string | null | undefined,
  code: string | null | undefined,
  locale: string,
): string {
  const v = Number(n ?? 0);
  const c = (code || 'THB').toUpperCase();
  const tag = locale === 'th' ? 'th-TH' : locale === 'zh' ? 'zh-CN' : 'en-GB';
  try {
    return new Intl.NumberFormat(tag, {
      style: 'currency', currency: c,
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(Number.isFinite(v) ? v : 0);
  } catch {
    return `${money(v)} ${c}`;
  }
}

/** ชื่อเดือนแบบเต็มตามภาษาที่เลือก ใช้แทนการเก็บชื่อเดือนซ้ำในโค้ดหลายที่ */
export function monthName(month: number, locale: string): string {
  const tag = locale === 'th' ? 'th-TH' : locale === 'zh' ? 'zh-CN' : 'en-GB';
  return new Intl.DateTimeFormat(tag, { month: 'long' })
    .format(new Date(Date.UTC(2000, Math.max(0, Math.min(11, month - 1)), 1)));
}

/** ปีที่แสดงตามภาษา — ภาษาไทยใช้ พ.ศ. อีกสองภาษาใช้ ค.ศ. */
export function localeYear(year: number, locale: string): number {
  return locale === 'th' ? year + 543 : year;
}
