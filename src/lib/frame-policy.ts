/**
 * นโยบายการให้ฝังหน้าจอในเว็บอื่น (iframe)
 *
 * ONEBOOK ถูกเปิดในพอร์ทัล ONE SPACE แบบฝังหน้าต่าง จึงต้องเลิกใช้
 * X-Frame-Options: DENY ที่สั่งห้ามฝังทุกกรณีและระบุโดเมนไม่ได้
 * เปลี่ยนไปใช้ CSP frame-ancestors ที่อนุญาตเฉพาะโดเมนที่กำหนดได้
 *
 * ตั้งค่าผ่าน FRAME_ANCESTORS เช่น
 *   FRAME_ANCESTORS=https://onespace-ose7.onrender.com
 * ไม่ตั้ง = ห้ามฝังทั้งหมด เท่ากับพฤติกรรมเดิม ปลอดภัยโดยปริยาย
 *
 * เหตุที่ตั้งที่ middleware ไม่ใช่ next.config
 *   headers() ใน next.config ถูกผูกค่าไว้ตั้งแต่ตอน build
 *   ถ้าจะเพิ่มโดเมนพอร์ทัลทีหลังต้อง build ใหม่ทุกครั้ง
 *   ตั้งที่ middleware อ่านค่าตอน request จึงแก้ env แล้ว restart ก็พอ
 */

/** ค่าที่กว้างเกินไปจนเปิดช่องให้ทุกเว็บฝังได้ — ต้องไม่ยอมรับ */
const TOO_BROAD = new Set(['*', 'https:', 'http:', "'unsafe-none'", 'data:', 'blob:']);

/**
 * กลั่นรายการโดเมนที่ยอมให้ฝัง
 *
 * ตั้งใจตัดค่าที่กว้างเกินไปทิ้งเงียบ ๆ แทนที่จะเชื่อ env ตรง ๆ
 * เพราะถ้าใครเผลอตั้ง FRAME_ANCESTORS=* ขึ้นมา ทุกเว็บบนอินเทอร์เน็ต
 * จะฝังหน้าจอบัญชีของบริษัทได้ทันที แล้วหลอกให้พนักงานกดปุ่มผ่านหน้าปลอมได้
 */
export function frameAncestors(raw?: string | null): string {
  const parts = (raw || '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !TOO_BROAD.has(s.toLowerCase()))
    // รับเฉพาะ 'self' กับโดเมนเต็มที่ระบุ scheme ชัดเจน
    .filter((s) => s === "'self'" || /^https?:\/\/[^*\s]+$/i.test(s));

  if (parts.length === 0) return "'none'";

  // ใส่ 'self' ให้เสมอ ไม่งั้นหน้าที่ฝังหน้าตัวเอง เช่นตัวอย่างเอกสาร จะพัง
  const set = new Set(parts);
  set.add("'self'");
  return Array.from(set).join(' ');
}

/** เปิดให้ฝังอยู่หรือไม่ ใช้ตัดสินเรื่องคุกกี้ข้ามไซต์ */
export function embeddingEnabled(raw?: string | null): boolean {
  return frameAncestors(raw) !== "'none'";
}

/**
 * โหมดคุกกี้ที่ต้องใช้
 *
 * เบราว์เซอร์จะไม่ส่งคุกกี้ SameSite=Lax ไปกับหน้าที่ถูกฝังข้ามโดเมน
 * ถ้าไม่เปลี่ยนเป็น None ผู้ใช้จะเปิดใน ONE SPACE แล้วเจอหน้า login วนไปเรื่อย ๆ
 *
 * SameSite=None ต้องมาคู่กับ Secure เสมอ จึงใช้ได้เฉพาะบน https
 * ตอนพัฒนาบนเครื่องที่เป็น http ยังคงใช้ Lax ต่อไป
 *
 * ที่ยอมให้คุกกี้ข้ามไซต์ได้เพราะยังมีด่าน CSRF อีกชั้น —
 * middleware ตรวจ Origin ของทุก POST เทียบกับ APP_ORIGIN อยู่แล้ว
 */
export function cookiePolicy(): { sameSite: 'lax' | 'none'; secure: boolean } {
  const isProd = process.env.NODE_ENV === 'production';
  const embed = embeddingEnabled(process.env.FRAME_ANCESTORS);
  return embed && isProd
    ? { sameSite: 'none', secure: true }
    : { sameSite: 'lax', secure: isProd };
}
