/**
 * นิยามชุดข้อมูลที่นำเข้าจากไฟล์ CSV ได้ ตอนเริ่มใช้ระบบ
 * แต่ละชุดบอกว่าคอลัมน์ไหนบังคับ และหัวตารางภาษาไทย/อังกฤษแบบไหนที่ระบบเดาให้ได้เอง
 */
export type FieldType = 'text' | 'number' | 'boolean' | 'date';

export interface ImportField {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** คำในหัวตารางที่ใช้เดาคอลัมน์ให้อัตโนมัติ (พิมพ์เล็กทั้งหมด) */
  hints: string[];
  hint?: string;
}

export interface ImportSet {
  key: string;
  label: string;
  description: string;
  table: string;
  /** คอลัมน์ที่ใช้ตัดสินว่าซ้ำกับของเดิม จึงอัปเดตแทนที่จะเพิ่มใหม่ */
  conflict: string;
  fields: ImportField[];
}

export const IMPORT_SETS: ImportSet[] = [
  {
    key: 'contacts',
    label: 'ผู้ติดต่อ (ลูกค้า / ผู้ขาย)',
    description: 'นำเข้าทะเบียนลูกค้าและผู้ขายพร้อมเลขผู้เสียภาษีและที่อยู่สำหรับออกเอกสาร',
    table: 'contacts',
    conflict: 'company_id,code',
    fields: [
      { key: 'code', label: 'รหัส', type: 'text', required: true, hints: ['รหัส', 'code', 'รหัสลูกค้า', 'รหัสผู้ขาย'] },
      { key: 'name', label: 'ชื่อ', type: 'text', required: true, hints: ['ชื่อ', 'name', 'ชื่อลูกค้า', 'ชื่อผู้ขาย', 'ชื่อบริษัท'] },
      { key: 'kind', label: 'ประเภท', type: 'text', hints: ['ประเภท', 'kind', 'type'], hint: 'customer / vendor / both' },
      { key: 'legal_name', label: 'ชื่อจดทะเบียน', type: 'text', hints: ['ชื่อจดทะเบียน', 'legal', 'ชื่อเต็ม'] },
      { key: 'tax_id', label: 'เลขผู้เสียภาษี', type: 'text', hints: ['เลขประจำตัวผู้เสียภาษี', 'เลขภาษี', 'tax id', 'taxid', 'เลขผู้เสียภาษี'] },
      { key: 'branch_code', label: 'รหัสสาขา', type: 'text', hints: ['สาขา', 'branch'] },
      { key: 'is_juristic', label: 'นิติบุคคล', type: 'boolean', hints: ['นิติบุคคล', 'juristic'], hint: 'ใช่/ไม่ใช่ · true/false' },
      { key: 'address', label: 'ที่อยู่', type: 'text', hints: ['ที่อยู่', 'address'] },
      { key: 'district', label: 'อำเภอ/เขต', type: 'text', hints: ['อำเภอ', 'เขต', 'district'] },
      { key: 'province', label: 'จังหวัด', type: 'text', hints: ['จังหวัด', 'province'] },
      { key: 'postcode', label: 'รหัสไปรษณีย์', type: 'text', hints: ['ไปรษณีย์', 'postcode', 'zip'] },
      { key: 'phone', label: 'โทรศัพท์', type: 'text', hints: ['โทร', 'phone', 'เบอร์'] },
      { key: 'email', label: 'อีเมล', type: 'text', hints: ['อีเมล', 'email', 'mail'] },
      { key: 'contact_person', label: 'ผู้ติดต่อ', type: 'text', hints: ['ผู้ติดต่อ', 'contact person'] },
      { key: 'credit_days', label: 'เครดิต (วัน)', type: 'number', hints: ['เครดิต', 'credit'] },
    ],
  },
  {
    key: 'products',
    label: 'สินค้า / บริการ',
    description: 'นำเข้ารายการสินค้าและบริการพร้อมราคาขายและราคาซื้อ',
    table: 'products',
    conflict: 'company_id,sku',
    fields: [
      { key: 'sku', label: 'รหัสสินค้า', type: 'text', required: true, hints: ['รหัสสินค้า', 'sku', 'รหัส', 'code'] },
      { key: 'name', label: 'ชื่อสินค้า', type: 'text', required: true, hints: ['ชื่อสินค้า', 'ชื่อ', 'name', 'description'] },
      { key: 'unit', label: 'หน่วย', type: 'text', hints: ['หน่วย', 'unit'] },
      { key: 'sale_price', label: 'ราคาขาย', type: 'number', hints: ['ราคาขาย', 'sale', 'ราคา'] },
      { key: 'purchase_price', label: 'ราคาซื้อ', type: 'number', hints: ['ราคาซื้อ', 'ต้นทุน', 'purchase', 'cost'] },
      { key: 'is_stock', label: 'ตัดสต๊อก', type: 'boolean', hints: ['สต๊อก', 'stock', 'คงคลัง'], hint: 'ใช่ = สินค้า, ไม่ใช่ = บริการ' },
      { key: 'barcode', label: 'บาร์โค้ด', type: 'text', hints: ['บาร์โค้ด', 'barcode'] },
    ],
  },
  {
    key: 'accounts',
    label: 'ผังบัญชี',
    description: 'นำเข้าผังบัญชีเดิมจากโปรแกรมบัญชีที่ใช้อยู่ (ระบบสร้างผังมาตรฐานไทยให้แล้ว นำเข้าเฉพาะบัญชีที่เพิ่มเอง)',
    table: 'accounts',
    conflict: 'company_id,code',
    fields: [
      { key: 'code', label: 'รหัสบัญชี', type: 'text', required: true, hints: ['รหัสบัญชี', 'รหัส', 'code', 'account code'] },
      { key: 'name_th', label: 'ชื่อบัญชี', type: 'text', required: true, hints: ['ชื่อบัญชี', 'ชื่อ', 'name'] },
      { key: 'name_en', label: 'ชื่อ (อังกฤษ)', type: 'text', hints: ['english', 'name en', 'ชื่ออังกฤษ'] },
      {
        key: 'type', label: 'หมวด', type: 'text', required: true,
        hints: ['หมวด', 'ประเภท', 'type', 'category'],
        hint: 'asset / liability / equity / revenue / expense / other_income / other_expense',
      },
    ],
  },
];

export const IMPORT_SET_BY_KEY = Object.fromEntries(IMPORT_SETS.map((s) => [s.key, s]));

/** เดาว่าคอลัมน์ไหนในไฟล์ตรงกับช่องไหน โดยดูจากคำในหัวตาราง */
export function guessMapping(headers: string[], set: ImportSet): Record<string, number> {
  const norm = headers.map((h) => h.toLowerCase().replace(/\s+/g, ' ').trim());
  const used = new Set<number>();
  const map: Record<string, number> = {};

  for (const f of set.fields) {
    let found = -1;
    // จับแบบตรงตัวก่อน แล้วค่อยจับแบบมีคำนั้นอยู่ในหัวตาราง
    for (const hint of f.hints) {
      found = norm.findIndex((h, i) => !used.has(i) && h === hint);
      if (found >= 0) break;
    }
    if (found < 0) {
      for (const hint of f.hints) {
        found = norm.findIndex((h, i) => !used.has(i) && h.includes(hint));
        if (found >= 0) break;
      }
    }
    if (found >= 0) { map[f.key] = found; used.add(found); }
  }
  return map;
}

const TRUE_WORDS = ['true', '1', 'y', 'yes', 'ใช่', 'จริง', 'มี', 'x', '✓'];

export function coerce(value: string, type: FieldType): any {
  const v = (value ?? '').trim();
  if (v === '') return null;
  switch (type) {
    case 'number': {
      const n = Number(v.replace(/,/g, ''));
      return Number.isFinite(n) ? n : null;
    }
    case 'boolean':
      return TRUE_WORDS.includes(v.toLowerCase());
    default:
      return v;
  }
}
