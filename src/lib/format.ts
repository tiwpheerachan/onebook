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

/**
 * วันที่รูปแบบ YYYY-MM-DD ตามเวลาท้องถิ่น
 *
 * ห้ามใช้ toISOString() ตรงนี้เด็ดขาด เพราะมันแปลงเป็น UTC ก่อน
 * ประเทศไทยเป็น UTC+7 วันที่ที่สร้างจากเที่ยงคืนท้องถิ่น เช่น
 * new Date(2026, 7, 1) จะกลายเป็น 2026-07-31T17:00Z แล้วได้ '2026-07-31'
 * ซึ่งเลื่อนไปหนึ่งวันเต็ม ทำให้ช่วงวันตั้งต้นของรายงานทุกตัวคลาดไปหนึ่งวันทั้งสองด้าน
 */
export function toDateStr(d: Date | string | null | undefined): string {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
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

/** ชื่อวันในสัปดาห์แบบสั้น เรียงอาทิตย์→เสาร์ ใช้เป็นหัวคอลัมน์ปฏิทิน */
export function weekdayShort(locale: string): string[] {
  const tag = locale === 'th' ? 'th-TH' : locale === 'zh' ? 'zh-CN' : 'en-GB';
  const fmt = new Intl.DateTimeFormat(tag, { weekday: 'short' });
  // 2023-01-01 เป็นวันอาทิตย์ ใช้เป็นจุดตั้งต้นให้ลำดับวันตรงกับ getDay()
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2023, 0, 1 + i))));
}

/** วันที่แบบสั้น วัน+เดือน ไม่มีปี ใช้ในป้ายกำกับที่พื้นที่จำกัด */
export function dayMonth(d: string | Date | null | undefined, locale: string): string {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return '';
  if (locale === 'th') return `${dt.getDate()} ${THAI_MONTHS[dt.getMonth()]}`;
  return dt.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-GB', { day: 'numeric', month: 'short' });
}

/** ปีที่แสดงตามภาษา — ภาษาไทยใช้ พ.ศ. อีกสองภาษาใช้ ค.ศ. */
export function localeYear(year: number, locale: string): number {
  return locale === 'th' ? year + 543 : year;
}

/**
 * วันที่ตามเวลาประเทศไทย
 *
 * ใช้บนเซิร์ฟเวอร์ซึ่งมักตั้งเขตเวลาเป็น UTC — ถ้าใช้ toDateStr ตรง ๆ
 * ช่วงเที่ยงคืนถึงเจ็ดโมงเช้าบ้านเราจะได้วันที่ของเมื่อวาน
 * ซึ่งทำให้ไปถามอัตราแลกเปลี่ยนผิดวัน
 */
export function bangkokToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
}
