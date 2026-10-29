/**
 * แคตตาล็อกหน้าหลักของ ONEBOOK — ใช้เป็นดัชนีคลิกได้ในหน้า /help และป้อนผู้ช่วย AI
 * แก้ที่นี่ทุกครั้งที่เพิ่ม/ย้าย/ลบหน้า แล้วอัปเดตคู่มือ docs/USER_MANUAL_ONEBOOK.md ด้วย
 */
export interface HelpPage {
  path: string;
  title: string;
  group: string;
  purpose: string;
  keywords: string[];
}

export const HELP_GROUPS = ['ภาพรวม', 'รายรับ', 'รายจ่าย', 'ผู้ติดต่อ/สินค้า', 'การเงิน', 'บัญชี', 'รายงาน', 'ภาษี', 'ตั้งค่า'] as const;

export const HELP_PAGES: HelpPage[] = [
  // ภาพรวม
  { path: '/dashboard', title: 'แดชบอร์ด', group: 'ภาพรวม', purpose: 'ภาพรวมธุรกิจ รายรับ-รายจ่าย เงินสด และงานที่ต้องทำ', keywords: ['แดชบอร์ด', 'ภาพรวม', 'หน้าแรก', 'สรุป'] },
  { path: '/group', title: 'ภาพรวมกลุ่มบริษัท', group: 'ภาพรวม', purpose: 'รวมตัวเลขของทุกบริษัทในเครือ', keywords: ['กลุ่มบริษัท', 'รวมบริษัท', 'group', 'เครือ'] },
  { path: '/approvals', title: 'คิวอนุมัติ', group: 'ภาพรวม', purpose: 'เอกสารที่รอฉันอนุมัติ', keywords: ['อนุมัติ', 'คิว', 'รออนุมัติ', 'approval'] },
  { path: '/tasks', title: 'ตารางงาน', group: 'ภาพรวม', purpose: 'ปฏิทินงานและสิ่งที่ต้องทำ', keywords: ['งาน', 'ปฏิทิน', 'task', 'เตือน'] },
  { path: '/documents/ai-import', title: 'นำเข้าด้วย AI', group: 'ภาพรวม', purpose: 'อัปโหลดเอกสารให้ OCR+AI อ่านและสร้างเอกสารให้', keywords: ['นำเข้า', 'ai', 'ocr', 'อัปโหลด', 'สแกนบิล', 'สแกนเอกสาร'] },
  // รายรับ
  { path: '/sales', title: 'ภาพรวมรายรับ', group: 'รายรับ', purpose: 'ภาพรวมเอกสารขายทั้งหมด', keywords: ['รายรับ', 'ขาย', 'ภาพรวมขาย'] },
  { path: '/sales/quotations', title: 'ใบเสนอราคา', group: 'รายรับ', purpose: 'สร้าง/จัดการใบเสนอราคา', keywords: ['ใบเสนอราคา', 'quotation', 'เสนอราคา'] },
  { path: '/sales/invoices', title: 'ใบแจ้งหนี้', group: 'รายรับ', purpose: 'สร้าง/จัดการใบแจ้งหนี้ลูกค้า', keywords: ['ใบแจ้งหนี้', 'invoice', 'วางบิล'] },
  { path: '/sales/tax-invoices', title: 'ใบกำกับภาษี', group: 'รายรับ', purpose: 'ออกใบกำกับภาษีขาย', keywords: ['ใบกำกับภาษี', 'tax invoice', 'ภาษีขาย'] },
  { path: '/sales/receipts', title: 'ใบเสร็จรับเงิน', group: 'รายรับ', purpose: 'ออกใบเสร็จเมื่อรับเงิน', keywords: ['ใบเสร็จ', 'receipt', 'รับเงิน'] },
  { path: '/sales/credit-notes', title: 'ใบลดหนี้', group: 'รายรับ', purpose: 'ออกใบลดหนี้ให้ลูกค้า', keywords: ['ใบลดหนี้', 'credit note', 'cn', 'ลดหนี้'] },
  // รายจ่าย
  { path: '/purchase', title: 'ภาพรวมรายจ่าย', group: 'รายจ่าย', purpose: 'ภาพรวมเอกสารซื้อทั้งหมด', keywords: ['รายจ่าย', 'ซื้อ', 'ภาพรวมซื้อ'] },
  { path: '/purchase/purchase-orders', title: 'ใบสั่งซื้อ', group: 'รายจ่าย', purpose: 'สร้างใบสั่งซื้อให้ผู้ขาย', keywords: ['ใบสั่งซื้อ', 'po', 'purchase order'] },
  { path: '/purchase/bills', title: 'ซื้อสินค้า/บริการ (บิล)', group: 'รายจ่าย', purpose: 'บันทึกบิลซื้อสินค้า/บริการ (รวมบิลที่เป็นทรัพย์สิน)', keywords: ['บิล', 'ซื้อ', 'bill', 'ค่าใช้จ่าย', 'ทรัพย์สิน', 'ซื้อสินค้า'] },
  { path: '/purchase/expenses', title: 'บันทึกค่าใช้จ่าย', group: 'รายจ่าย', purpose: 'บันทึกค่าใช้จ่ายทั่วไป', keywords: ['ค่าใช้จ่าย', 'expense', 'เบิกจ่าย'] },
  { path: '/purchase/goods-receipts', title: 'ใบรับสินค้า', group: 'รายจ่าย', purpose: 'รับสินค้าเข้าคลังตามใบสั่งซื้อ', keywords: ['ใบรับสินค้า', 'รับของ', 'gr', 'goods receipt'] },
  // ผู้ติดต่อ/สินค้า
  { path: '/contacts', title: 'ผู้ติดต่อ', group: 'ผู้ติดต่อ/สินค้า', purpose: 'ลูกค้าและผู้ขาย ข้อมูลติดต่อ วงเงินเครดิต', keywords: ['ผู้ติดต่อ', 'ลูกค้า', 'ผู้ขาย', 'contact', 'vendor', 'customer'] },
  { path: '/products', title: 'สินค้า/บริการ', group: 'ผู้ติดต่อ/สินค้า', purpose: 'รายการสินค้าและบริการ ราคา บัญชีที่ผูก', keywords: ['สินค้า', 'บริการ', 'product', 'ราคา'] },
  { path: '/inventory', title: 'สินค้าคงคลัง', group: 'ผู้ติดต่อ/สินค้า', purpose: 'สต๊อกคงเหลือ คลัง ล็อต และตรวจนับ', keywords: ['คงคลัง', 'สต๊อก', 'inventory', 'คลัง', 'ตรวจนับ', 'ล็อต'] },
  // การเงิน
  { path: '/finance', title: 'ภาพรวมการเงิน', group: 'การเงิน', purpose: 'ภาพรวมเงินสด ธนาคาร และการรับ-จ่าย', keywords: ['การเงิน', 'เงินสด', 'ภาพรวมการเงิน'] },
  { path: '/finance/payments', title: 'รับ-จ่ายเงิน', group: 'การเงิน', purpose: 'บันทึกการรับชำระและจ่ายชำระ', keywords: ['รับเงิน', 'จ่ายเงิน', 'ชำระ', 'payment', 'รับชำระ', 'จ่ายชำระ'] },
  { path: '/finance/reconcile', title: 'กระทบยอดธนาคาร', group: 'การเงิน', purpose: 'กระทบยอดเงินในบัญชีธนาคาร', keywords: ['กระทบยอด', 'ธนาคาร', 'reconcile', 'bank'] },
  { path: '/finance/cheques', title: 'เช็ค', group: 'การเงิน', purpose: 'จัดการเช็ครับ-จ่าย', keywords: ['เช็ค', 'cheque'] },
  // บัญชี
  { path: '/accounting/coa', title: 'ผังบัญชี', group: 'บัญชี', purpose: 'ผังบัญชีทั้งหมด รหัสและประเภทบัญชี', keywords: ['ผังบัญชี', 'coa', 'บัญชี', 'รหัสบัญชี', 'chart of accounts'] },
  { path: '/accounting/journal', title: 'สมุดรายวัน', group: 'บัญชี', purpose: 'รายการบัญชีที่ลงจากเอกสาร (เดบิต/เครดิต)', keywords: ['สมุดรายวัน', 'journal', 'เดบิต', 'เครดิต', 'ลงบัญชี'] },
  { path: '/accounting/ledger', title: 'บัญชีแยกประเภท', group: 'บัญชี', purpose: 'ความเคลื่อนไหวและยอดคงเหลือรายบัญชี', keywords: ['แยกประเภท', 'ledger', 'ยอดคงเหลือ', 'บัญชีแยกประเภท'] },
  { path: '/accounting/close-check', title: 'ตรวจก่อนปิดงบ', group: 'บัญชี', purpose: 'เช็กลิสต์ก่อนปิดงวด', keywords: ['ปิดงบ', 'ตรวจก่อนปิด', 'close check'] },
  { path: '/accounting/year-end', title: 'ปิดบัญชีสิ้นปี', group: 'บัญชี', purpose: 'ล้างรายได้/ค่าใช้จ่ายเข้ากำไรสะสม ปิดรอบปี', keywords: ['ปิดบัญชี', 'สิ้นปี', 'year end', 'กำไรสะสม'] },
  // รายงาน
  { path: '/reports/trial-balance', title: 'งบทดลอง', group: 'รายงาน', purpose: 'งบทดลองยอดเดบิต/เครดิตทุกบัญชี', keywords: ['งบทดลอง', 'trial balance'] },
  { path: '/reports/profit-loss', title: 'งบกำไรขาดทุน', group: 'รายงาน', purpose: 'รายได้ ค่าใช้จ่าย และกำไรสุทธิ', keywords: ['กำไรขาดทุน', 'p&l', 'profit loss', 'กำไร'] },
  { path: '/reports/balance-sheet', title: 'งบแสดงฐานะการเงิน', group: 'รายงาน', purpose: 'สินทรัพย์ หนี้สิน และส่วนของผู้ถือหุ้น', keywords: ['งบดุล', 'ฐานะการเงิน', 'balance sheet', 'สินทรัพย์'] },
  { path: '/reports/cash-flow', title: 'งบกระแสเงินสด', group: 'รายงาน', purpose: 'กระแสเงินสดเข้า-ออก', keywords: ['กระแสเงินสด', 'cash flow'] },
  { path: '/reports/ar-aging', title: 'อายุลูกหนี้', group: 'รายงาน', purpose: 'ลูกหนี้ค้างชำระแยกตามอายุ', keywords: ['อายุลูกหนี้', 'ลูกหนี้', 'ar aging', 'ค้างรับ'] },
  { path: '/reports/ap-aging', title: 'อายุเจ้าหนี้', group: 'รายงาน', purpose: 'เจ้าหนี้ค้างจ่ายแยกตามอายุ', keywords: ['อายุเจ้าหนี้', 'เจ้าหนี้', 'ap aging', 'ค้างจ่าย'] },
  // ภาษี
  { path: '/tax/vat/sales', title: 'รายงานภาษีขาย', group: 'ภาษี', purpose: 'รายงานภาษีขายประจำเดือน', keywords: ['ภาษีขาย', 'vat ขาย', 'รายงานภาษี'] },
  { path: '/tax/vat/purchase', title: 'รายงานภาษีซื้อ', group: 'ภาษี', purpose: 'รายงานภาษีซื้อประจำเดือน', keywords: ['ภาษีซื้อ', 'vat ซื้อ'] },
  { path: '/tax/pp30', title: 'แบบ ภ.พ.30', group: 'ภาษี', purpose: 'สรุปยื่นภาษีมูลค่าเพิ่ม ภ.พ.30', keywords: ['ภพ30', 'pp30', 'ภาษีมูลค่าเพิ่ม', 'ยื่นภาษี'] },
  { path: '/tax/wht', title: 'ภาษีหัก ณ ที่จ่าย', group: 'ภาษี', purpose: 'รายงานและหนังสือรับรองหัก ณ ที่จ่าย', keywords: ['หัก ณ ที่จ่าย', 'wht', 'ภาษีหัก'] },
  // ตั้งค่า
  { path: '/settings/companies', title: 'บริษัทในเครือ', group: 'ตั้งค่า', purpose: 'จัดการบริษัทในกลุ่ม', keywords: ['บริษัท', 'companies', 'เครือ'] },
  { path: '/settings/users', title: 'ผู้ใช้งาน', group: 'ตั้งค่า', purpose: 'จัดการผู้ใช้และบทบาท', keywords: ['ผู้ใช้', 'users', 'สิทธิ์'] },
  { path: '/settings/approval', title: 'สายอนุมัติ', group: 'ตั้งค่า', purpose: 'กำหนดสายอนุมัติตามชนิดเอกสารและวงเงิน', keywords: ['สายอนุมัติ', 'approval chain', 'อนุมัติ'] },
  { path: '/settings/roles', title: 'บทบาทและสิทธิ์', group: 'ตั้งค่า', purpose: 'กำหนดบทบาทและสิทธิ์การใช้งาน', keywords: ['บทบาท', 'สิทธิ์', 'role', 'permission'] },
  { path: '/settings/numbering', title: 'รูปแบบเลขที่เอกสาร', group: 'ตั้งค่า', purpose: 'ตั้งรูปแบบและลำดับเลขที่เอกสาร', keywords: ['เลขที่เอกสาร', 'numbering', 'running number'] },
  { path: '/settings/period-lock', title: 'ปิดงวด (Freeze)', group: 'ตั้งค่า', purpose: 'ล็อกงวดไม่ให้แก้เอกสารย้อนหลัง', keywords: ['ปิดงวด', 'freeze', 'period lock', 'ล็อกงวด'] },
  { path: '/help', title: 'คู่มือการใช้งาน', group: 'ตั้งค่า', purpose: 'คู่มือและผู้ช่วย AI ค้นหาวิธีใช้และนำทาง', keywords: ['คู่มือ', 'help', 'ช่วยเหลือ', 'วิธีใช้'] },
];

export function pageByPath(path: string): HelpPage | undefined {
  const clean = (path || '/').split('?')[0].split('#')[0];
  const exact = HELP_PAGES.find((p) => p.path === clean);
  if (exact) return exact;
  // จับกลุ่มย่อยกลับไปหน้าหลัก เช่น /sales/invoices/123 -> /sales/invoices
  const hit = HELP_PAGES.filter((p) => clean.startsWith(p.path + '/')).sort((a, b) => b.path.length - a.path.length)[0];
  return hit;
}
