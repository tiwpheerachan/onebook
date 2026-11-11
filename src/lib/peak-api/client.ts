// PEAK Open API client — อ่านอย่างเดียว (GET) เท่านั้น
// ⚠️ ห้ามเพิ่มฟังก์ชันที่ POST/edit/void/approve กลับไป PEAK โดยเด็ดขาด
// Auth: Client Token (cache 24ชม.) + User Token + ลายเซ็น HMAC-SHA1(timestamp, connectId)
import crypto from 'node:crypto';

const BASE = (process.env.PEAK_SERVER_URL || '').replace(/\/+$/, '');
const CONNECT_ID = process.env.PEAK_CONNECT_ID || '';
const CONNECT_KEY = process.env.PEAK_CONNECT_KEY || '';
const USER_TOKEN = process.env.PEAK_USER_TOKEN || '';

/** ครบทุกค่า env ที่จำเป็นหรือยัง */
export function peakConfigured(): boolean {
  return Boolean(BASE && CONNECT_ID && CONNECT_KEY && USER_TOKEN);
}

export function peakMissingEnv(): string[] {
  const miss: string[] = [];
  if (!BASE) miss.push('PEAK_SERVER_URL');
  if (!CONNECT_ID) miss.push('PEAK_CONNECT_ID');
  if (!CONNECT_KEY) miss.push('PEAK_CONNECT_KEY');
  if (!USER_TOKEN) miss.push('PEAK_USER_TOKEN');
  return miss;
}

/** เวลาปัจจุบัน UTC รูปแบบ yyyyMMddHHmmss ตามที่ PEAK กำหนด */
function peakTimestamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

/** ลายเซ็น = HMAC-SHA1 ของ timestamp โดยใช้ connectId เป็น secret key */
function sign(ts: string): string {
  return crypto.createHmac('sha1', CONNECT_ID).update(ts).digest('hex');
}

// Client Token อายุ 24 ชม. (จำกัด 10 ครั้ง/นาที) — cache ในหน่วยความจำ
let cached: { token: string; exp: number } | null = null;

async function getClientToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  if (!peakConfigured()) throw new Error(`PEAK ยังตั้งค่าไม่ครบ: ${peakMissingEnv().join(', ')}`);
  const ts = peakTimestamp();
  const res = await fetch(`${BASE}/clienttoken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Time-Stamp': ts, 'Time-Signature': sign(ts) },
    body: JSON.stringify({ PeakClientToken: { connectId: CONNECT_ID, password: CONNECT_KEY } }),
  });
  let body: any = null;
  try { body = await res.json(); } catch { /* ignore */ }
  const token = body?.PeakClientToken?.token;
  if (!token) {
    const desc = body?.PeakClientToken?.resDesc || body?.PeakRequestToken?.resDesc || `HTTP ${res.status}`;
    throw new Error(`ขอ Client Token ไม่สำเร็จ: ${desc}`);
  }
  cached = { token, exp: Date.now() + 23 * 3600 * 1000 };
  return token;
}

/**
 * เรียก PEAK API แบบ GET เท่านั้น (อ่านข้อมูล) — ส่ง 4 header ตามสเปก
 * ใช้สำหรับดึงรายการเอกสาร/ผู้ติดต่อ/สินค้า เข้ามา mirror ใน ONEBOOK
 */
export async function peakGet<T = any>(
  path: string, query?: Record<string, string | number | undefined | null>,
): Promise<T> {
  const ct = await getClientToken();
  const ts = peakTimestamp();
  const qs = query
    ? '?' + Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
    : '';
  const res = await fetch(`${BASE}/${path.replace(/^\/+/, '')}${qs}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Client-Token': ct,
      'User-Token': USER_TOKEN,
      'Time-Stamp': ts,
      'Time-Signature': sign(ts),
    },
  });
  if (!res.ok) throw new Error(`PEAK GET ${path} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

/** ทดสอบการเชื่อมต่อ (ขอ Client Token อย่างเดียว ไม่แตะข้อมูล) */
export async function peakPing(): Promise<{ ok: boolean; error?: string }> {
  try { await getClientToken(); return { ok: true }; }
  catch (e: any) { return { ok: false, error: e?.message || String(e) }; }
}
