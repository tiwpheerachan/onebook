/**
 * สร้าง payload พร้อมเพย์ (PromptPay) ตามมาตรฐาน EMVCo QR Code
 * อ้างอิงข้อกำหนด Thai QR Payment Standard ของธนาคารแห่งประเทศไทย
 *
 * โครงสร้างเป็น TLV (tag + ความยาว 2 หลัก + ค่า) ต่อกันไปเรื่อย ๆ
 * ปิดท้ายด้วย CRC-16/CCITT-FALSE ของสตริงทั้งหมดรวม "6304"
 */

export type PromptPayIdType = 'phone' | 'natid' | 'ewallet';

/** ประเภทหมายเลขพร้อมเพย์ที่ใช้บ่อย พร้อมแท็กย่อยตามมาตรฐาน */
const SUBTAG: Record<PromptPayIdType, string> = {
  phone: '01',    // เบอร์โทรศัพท์ -> แปลงเป็น 0066xxxxxxxxx
  natid: '02',    // เลขประจำตัวประชาชน 13 หลัก / เลขนิติบุคคล 13 หลัก
  ewallet: '03',  // เลข e-Wallet 15 หลัก
};

function tlv(tag: string, value: string): string {
  return tag + String(value.length).padStart(2, '0') + value;
}

/** CRC-16/CCITT-FALSE : poly 0x1021, init 0xFFFF, ไม่กลับบิต */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** เดาประเภทหมายเลขจากจำนวนหลัก : 10 = เบอร์โทร, 13 = บัตร ปชช./นิติบุคคล, 15 = e-Wallet */
export function detectIdType(id: string): PromptPayIdType | null {
  const digits = id.replace(/\D/g, '');
  if (digits.length === 10 || (digits.length === 11 && digits.startsWith('0'))) return 'phone';
  if (digits.length === 13) return 'natid';
  if (digits.length === 15) return 'ewallet';
  return null;
}

/** เบอร์ 0812345678 -> 0066812345678 (ตัด 0 นำหน้าแล้วเติมรหัสประเทศ) */
function formatTarget(id: string, type: PromptPayIdType): string {
  const digits = id.replace(/\D/g, '');
  if (type !== 'phone') return digits;
  return ('0000' + '66' + digits.replace(/^0/, '')).slice(-13);
}

export interface PromptPayInput {
  /** เบอร์โทร / เลขบัตรประชาชน / เลขนิติบุคคล / e-Wallet ของผู้รับเงิน */
  id: string;
  /** ระบุเองได้ ถ้าไม่ระบุจะเดาจากจำนวนหลัก */
  idType?: PromptPayIdType;
  /** จำนวนเงิน ถ้าไม่ใส่ QR จะให้ผู้จ่ายกรอกเอง */
  amount?: number | null;
  /** ชื่อผู้รับเงิน (ไม่บังคับ แสดงบนแอปธนาคารบางแห่ง) */
  merchantName?: string | null;
}

/**
 * คืนสตริงที่เอาไปเข้ารหัสเป็น QR ได้เลย
 * โยน Error เมื่อหมายเลขไม่ถูกต้อง เพื่อไม่ให้พิมพ์ QR ที่สแกนแล้วโอนผิดบัญชี
 */
export function buildPromptPayPayload({ id, idType, amount, merchantName }: PromptPayInput): string {
  const type = idType || detectIdType(id);
  if (!type) throw new Error('INVALID_PROMPTPAY_ID');

  const target = formatTarget(id, type);
  const hasAmount = typeof amount === 'number' && Number.isFinite(amount) && amount > 0;

  const merchantAccount = tlv('29', tlv('00', 'A000000677010111') + tlv(SUBTAG[type], target));

  // ชื่อร้านต้องเป็น ASCII เท่านั้น แอปธนาคารบางแห่งอ่านภาษาไทยในแท็กนี้ไม่ออก
  const asciiName = (merchantName || '').replace(/[^\x20-\x7E]/g, '').trim().slice(0, 25);

  // แท็กต้องเรียงจากน้อยไปมากตามข้อกำหนด EMVCo : 00 01 29 53 54 58 59 63
  let payload =
    tlv('00', '01') +                                  // เวอร์ชันข้อกำหนด
    tlv('01', hasAmount ? '12' : '11') +               // 11 = สแกนซ้ำได้, 12 = ครั้งเดียว (มีจำนวนเงิน)
    merchantAccount +
    tlv('53', '764');                                  // สกุลเงิน THB ตาม ISO 4217

  if (hasAmount) payload += tlv('54', amount!.toFixed(2));
  payload += tlv('58', 'TH');                          // ประเทศ
  if (asciiName) payload += tlv('59', asciiName);

  payload += '6304';
  return payload + crc16(payload);
}

/** ตรวจว่าหมายเลขใช้สร้าง QR ได้จริงไหม (ใช้กับหน้าตั้งค่า) */
export function isValidPromptPayId(id: string | null | undefined): boolean {
  if (!id) return false;
  return detectIdType(id) !== null;
}
