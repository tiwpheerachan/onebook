// หมวดทรัพย์สินตามอายุการใช้งานในทางภาษี (พ.ร.ฎ.145 / ประมวลรัษฎากร ม.65 ทวิ)
// ใช้เป็น preset ตอน "รับเป็นทรัพย์สิน" — เลือกหมวดแล้วเติมอายุค่าเสื่อม + บัญชีให้อัตโนมัติ
// บัญชีอ้างด้วย "รหัส" ผังบัญชีมาตรฐาน (resolve เป็น account id ต่อบริษัทตอนใช้งาน)
// ข้อมูลครบสามภาษาในที่เดียว (ไม่ใช่สตริง UI ที่ฝังในคอมโพเนนต์)

export interface AssetCategoryPreset {
  key: string;
  name: { th: string; en: string; zh: string };
  lifeMonths: number;                 // 0 = ไม่คิดค่าเสื่อม (ที่ดิน)
  method: 'straight_line' | 'none';
  assetCode: string;                  // บัญชีสินทรัพย์ (เดบิตราคาทุน)
  accumCode: string;                  // บัญชีค่าเสื่อมสะสม ('' = ไม่มี เช่น ที่ดิน)
}

// เกณฑ์เข้าทรัพย์สิน — ต่ำกว่านี้ตามปกติลงเป็นค่าใช้จ่าย ไม่ตั้งเป็นทรัพย์สินถาวร
export const CAPITALIZE_THRESHOLD = 3000;

export const ASSET_CATEGORIES: AssetCategoryPreset[] = [
  { key: 'building', name: { th: 'อาคารและสิ่งปลูกสร้าง', en: 'Buildings & structures', zh: '建筑物及构筑物' }, lifeMonths: 240, method: 'straight_line', assetCode: '1220', accumCode: '1221' },
  { key: 'machine',  name: { th: 'เครื่องจักรและอุปกรณ์', en: 'Machinery & equipment', zh: '机器与设备' }, lifeMonths: 60, method: 'straight_line', assetCode: '1230', accumCode: '1231' },
  { key: 'computer', name: { th: 'คอมพิวเตอร์และอุปกรณ์ไอที', en: 'Computers & IT equipment', zh: '计算机及IT设备' }, lifeMonths: 36, method: 'straight_line', assetCode: '1240', accumCode: '1241' },
  { key: 'office',   name: { th: 'เครื่องใช้สำนักงาน / เฟอร์นิเจอร์', en: 'Office equipment & furniture', zh: '办公设备及家具' }, lifeMonths: 60, method: 'straight_line', assetCode: '1240', accumCode: '1241' },
  { key: 'vehicle',  name: { th: 'ยานพาหนะ', en: 'Vehicles', zh: '车辆' }, lifeMonths: 60, method: 'straight_line', assetCode: '1250', accumCode: '1251' },
  { key: 'land',     name: { th: 'ที่ดิน (ไม่คิดค่าเสื่อม)', en: 'Land (no depreciation)', zh: '土地（不计折旧）' }, lifeMonths: 0, method: 'none', assetCode: '1210', accumCode: '' },
];
