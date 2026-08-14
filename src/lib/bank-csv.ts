/**
 * อ่านไฟล์ statement ธนาคาร (CSV) ให้เป็นรายการเดินบัญชี
 *
 * รองรับหัวคอลัมน์ที่ธนาคารไทยใช้บ่อย (กสิกร ไทยพาณิชย์ กรุงเทพ กรุงไทย กรุงศรี ทหารไทยธนชาต)
 * ทั้งภาษาไทยและอังกฤษ ถ้าจับคู่อัตโนมัติไม่ได้ ให้ผู้ใช้เลือกคอลัมน์เองบนหน้าจอ
 */

export interface BankLine {
  line_no: number;
  txn_date: string;
  description: string;
  reference: string;
  deposit: number;
  withdrawal: number;
  balance: number | null;
}

export interface ParseResult {
  lines: BankLine[];
  headers: string[];
  mapping: ColumnMapping;
  errors: string[];
}

export interface ColumnMapping {
  date: number;
  description: number;
  reference: number;
  deposit: number;
  withdrawal: number;
  amount: number; // คอลัมน์เดียวที่มีทั้งบวกและลบ
  balance: number;
}

const HEADER_HINTS: Record<keyof ColumnMapping, string[]> = {
  date: ['วันที่', 'วันที่ทำรายการ', 'วันที่รายการ', 'date', 'transaction date', 'txn date', 'value date', 'posting date'],
  description: ['รายละเอียด', 'รายการ', 'คำอธิบาย', 'description', 'transaction', 'details', 'narrative', 'particulars'],
  reference: ['อ้างอิง', 'เลขที่อ้างอิง', 'หมายเหตุ', 'reference', 'ref', 'cheque', 'code'],
  deposit: ['ฝาก', 'เงินเข้า', 'รับ', 'จำนวนเงินฝาก', 'deposit', 'credit', 'money in', 'received'],
  withdrawal: ['ถอน', 'เงินออก', 'จ่าย', 'จำนวนเงินถอน', 'withdrawal', 'debit', 'money out', 'paid'],
  amount: ['จำนวนเงิน', 'amount', 'transaction amount'],
  balance: ['คงเหลือ', 'ยอดคงเหลือ', 'balance', 'running balance', 'closing balance'],
};

/** แยกบรรทัด CSV โดยเคารพเครื่องหมายคำพูด */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if ((ch === ',' || ch === '\t' || ch === ';') && !inQuote) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** "1,234.56" / "(1,234.56)" / "-1,234.56" -> number */
export function parseAmount(raw: string): number {
  if (!raw) return 0;
  let s = String(raw).replace(/[฿,\s"']/g, '').replace(/THB/gi, '');
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith('-')) { neg = true; s = s.slice(1); }
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
  const n = Number(s);
  if (Number.isNaN(n)) return 0;
  return neg ? -n : n;
}

/**
 * รองรับ 31/12/2026, 31-12-2026, 2026-12-31, 31/12/69 (พ.ศ. 2 หลัก) และ 31/12/2569 (พ.ศ.)
 * คืนค่ารูปแบบ YYYY-MM-DD (ค.ศ.) หรือ '' ถ้าอ่านไม่ออก
 */
export function parseThaiDate(raw: string): string {
  if (!raw) return '';
  const s = String(raw).trim().split(/\s+/)[0];

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    let y = Number(m[1]);
    if (y > 2400) y -= 543;
    return `${y}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }

  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    const d = m[1].padStart(2, '0');
    const mo = m[2].padStart(2, '0');
    let y = Number(m[3]);
    // ปี 2 หลัก : >= 50 ถือเป็น พ.ศ. (69 -> 2569) ต่ำกว่านั้นถือเป็น ค.ศ. (26 -> 2026)
    if (y < 100) y = y >= 50 ? 2500 + y : 2000 + y;
    if (y > 2400) y -= 543;
    return `${y}-${mo}-${d}`;
  }
  return '';
}

function guessColumn(headers: string[], key: keyof ColumnMapping): number {
  const hints = HEADER_HINTS[key];
  const norm = headers.map((h) => h.toLowerCase().replace(/[\s_()."]/g, ''));
  for (const hint of hints) {
    const h = hint.toLowerCase().replace(/[\s_()."]/g, '');
    const i = norm.findIndex((x) => x === h);
    if (i >= 0) return i;
  }
  for (const hint of hints) {
    const h = hint.toLowerCase().replace(/[\s_()."]/g, '');
    const i = norm.findIndex((x) => x.includes(h));
    if (i >= 0) return i;
  }
  return -1;
}

export function detectMapping(headers: string[]): ColumnMapping {
  return {
    date: guessColumn(headers, 'date'),
    description: guessColumn(headers, 'description'),
    reference: guessColumn(headers, 'reference'),
    deposit: guessColumn(headers, 'deposit'),
    withdrawal: guessColumn(headers, 'withdrawal'),
    amount: guessColumn(headers, 'amount'),
    balance: guessColumn(headers, 'balance'),
  };
}

export function parseBankCsv(text: string, override?: Partial<ColumnMapping>): ParseResult {
  const errors: string[] = [];
  const rawLines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '');

  if (rawLines.length === 0) return { lines: [], headers: [], mapping: detectMapping([]), errors: ['ไฟล์ว่าง'] };

  // หาแถวหัวตาราง : แถวแรกที่มีคำที่รู้จักอย่างน้อย 2 คำ (บาง statement มีหัวกระดาษหลายบรรทัด)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(rawLines.length, 15); i++) {
    const cells = splitCsvLine(rawLines[i]);
    const m = detectMapping(cells);
    const found = [m.date, m.description, m.deposit, m.withdrawal, m.amount, m.balance].filter((x) => x >= 0).length;
    if (found >= 2) { headerIdx = i; break; }
  }

  const headers = splitCsvLine(rawLines[headerIdx]);
  const mapping = { ...detectMapping(headers), ...(override || {}) };

  if (mapping.date < 0) errors.push('ไม่พบคอลัมน์วันที่ กรุณาเลือกเอง');
  if (mapping.deposit < 0 && mapping.withdrawal < 0 && mapping.amount < 0) {
    errors.push('ไม่พบคอลัมน์จำนวนเงิน กรุณาเลือกเอง');
  }

  const lines: BankLine[] = [];
  for (let i = headerIdx + 1; i < rawLines.length; i++) {
    const c = splitCsvLine(rawLines[i]);
    const get = (idx: number) => (idx >= 0 && idx < c.length ? c[idx] : '');

    const date = parseThaiDate(get(mapping.date));
    if (!date) continue; // ข้ามแถวสรุป/แถวว่าง

    let deposit = 0;
    let withdrawal = 0;
    if (mapping.deposit >= 0 || mapping.withdrawal >= 0) {
      deposit = Math.abs(parseAmount(get(mapping.deposit)));
      withdrawal = Math.abs(parseAmount(get(mapping.withdrawal)));
    } else {
      const amt = parseAmount(get(mapping.amount));
      if (amt >= 0) deposit = amt;
      else withdrawal = -amt;
    }
    if (deposit === 0 && withdrawal === 0) continue;

    const balRaw = get(mapping.balance);
    lines.push({
      line_no: lines.length + 1,
      txn_date: date,
      description: get(mapping.description).slice(0, 500),
      reference: get(mapping.reference).slice(0, 200),
      deposit,
      withdrawal,
      balance: balRaw ? parseAmount(balRaw) : null,
    });
  }

  if (lines.length === 0 && errors.length === 0) errors.push('อ่านไฟล์ได้แต่ไม่พบรายการเดินบัญชี');
  return { lines, headers, mapping, errors };
}
