import 'server-only';
import crypto from 'node:crypto';

/**
 * เข้าสู่ระบบด้วย GoodHR (OpenID Connect)
 *
 * เขียนเองแทนการใช้ NextAuth เพราะระบบสิทธิ์ทั้งหมดของ ONEBOOK ผูกกับ Supabase Auth
 * (RLS ทุกตารางเรียก auth.uid()) ถ้าใส่ระบบล็อกอินตัวที่สองเข้ามาจะกลายเป็นสองระบบซ้อนกัน
 *
 * GoodHR ทำหน้าที่ยืนยันตัวตนอย่างเดียว ส่วนสิทธิ์ยังคุมด้วยบทบาทของ ONEBOOK ตามเดิม
 */

export interface GoodhrClaims {
  sub: string;
  name?: string;
  email?: string;
  email_verified?: boolean;
  picture?: string;
  employee_code?: string;
  role?: string;
  company_id?: string;
  company_name?: string;
  department?: string;
  position?: string;
  branch?: string;
  /** บทบาทใน ONEBOOK ที่ผู้ดูแล GoodHR เลือกไว้ให้ — ใช้เป็นค่าตั้งต้น */
  app_role?: string;
  is_active?: boolean;
  nonce?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
}

/** GoodHR ใช้ชื่อ OAUTH_* ในเอกสาร รองรับชื่อ GOODHR_* ไว้ด้วยเผื่อตั้งไว้แล้ว */
export const clientId = () => process.env.OAUTH_CLIENT_ID || process.env.GOODHR_CLIENT_ID || '';
export const clientSecret = () => process.env.OAUTH_CLIENT_SECRET || process.env.GOODHR_CLIENT_SECRET || '';

export function isGoodhrConfigured(): boolean {
  return !!(process.env.GOODHR_ISSUER && clientId() && clientSecret());
}

const issuer = () => (process.env.GOODHR_ISSUER || '').replace(/\/+$/, '');

/** URL ที่ GoodHR จะส่งผู้ใช้กลับมา ต้องตรงกับที่ลงทะเบียนไว้เป๊ะทุกตัวอักษร */
export function redirectUri(): string {
  // ต้องตรงกับที่ลงทะเบียนไว้กับ GoodHR เป๊ะทุกตัวอักษร
  // ถ้าตั้ง OAUTH_REDIRECT_URI ไว้ ให้ใช้ค่านั้นตรง ๆ ไม่ประกอบเอง
  if (process.env.OAUTH_REDIRECT_URI) return process.env.OAUTH_REDIRECT_URI;
  const base = (process.env.APP_ORIGIN || 'http://localhost:3000').replace(/\/+$/, '');
  return `${base}/api/auth/callback/goodhr`;
}

const b64url = (b: Buffer) => b.toString('base64url');

export function randomToken(bytes = 32): string {
  return b64url(crypto.randomBytes(bytes));
}

/** PKCE : challenge = BASE64URL(SHA256(verifier)) ตาม RFC 7636 */
export function pkceChallenge(verifier: string): string {
  return b64url(crypto.createHash('sha256').update(verifier).digest());
}

/* ─────────────────────────── Discovery ─────────────────────────── */

interface Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  issuer: string;
  end_session_endpoint?: string;
}

let discoveryCache: { at: number; data: Discovery } | null = null;

/** อ่านค่า endpoint จาก discovery แล้วเก็บไว้ 1 ชั่วโมง ถ้าอ่านไม่ได้ใช้ path มาตรฐานแทน */
export async function discover(): Promise<Discovery> {
  const fallback: Discovery = {
    issuer: issuer(),
    authorization_endpoint: `${issuer()}/oauth/authorize`,
    token_endpoint: `${issuer()}/api/oauth/token`,
    userinfo_endpoint: `${issuer()}/api/oauth/userinfo`,
    jwks_uri: `${issuer()}/.well-known/jwks.json`,
    end_session_endpoint: `${issuer()}/api/oauth/logout`,
  };

  if (discoveryCache && Date.now() - discoveryCache.at < 3_600_000) return discoveryCache.data;

  try {
    const res = await fetch(`${issuer()}/.well-known/openid-configuration`, { cache: 'no-store' });
    if (!res.ok) return fallback;
    const data = (await res.json()) as Discovery;
    if (!data.authorization_endpoint || !data.token_endpoint) return fallback;
    discoveryCache = { at: Date.now(), data };
    return data;
  } catch {
    return fallback;
  }
}

/* ─────────────────────────── JWKS + ตรวจลายเซ็น ─────────────────────────── */

let jwksCache: { at: number; keys: any[] } | null = null;

async function getKey(kid: string): Promise<crypto.KeyObject> {
  const load = async () => {
    const { jwks_uri } = await discover();
    const res = await fetch(jwks_uri, { cache: 'no-store' });
    if (!res.ok) throw new Error(`โหลด JWKS ไม่สำเร็จ (HTTP ${res.status})`);
    const json = await res.json();
    jwksCache = { at: Date.now(), keys: json.keys || [] };
  };

  if (!jwksCache || Date.now() - jwksCache.at > 3_600_000) await load();
  let jwk = jwksCache!.keys.find((k: any) => k.kid === kid);
  // เจอ kid ที่ไม่รู้จัก แปลว่าอาจเพิ่งหมุนกุญแจ ให้โหลดใหม่หนึ่งครั้ง
  if (!jwk) {
    await load();
    jwk = jwksCache!.keys.find((k: any) => k.kid === kid);
  }
  if (!jwk) throw new Error('ไม่พบกุญแจสาธารณะที่ตรงกับ token นี้');
  return crypto.createPublicKey({ key: jwk, format: 'jwk' } as any);
}

/**
 * ตรวจ id_token ให้ครบทุกด้าน : ลายเซ็น · ผู้ออก · ผู้รับ · เวลา · nonce
 * ถ้าข้ามข้อใดข้อหนึ่ง จะเปิดช่องให้ปลอม token เข้ามาได้
 */
export async function verifyIdToken(token: string, expectedNonce?: string): Promise<GoodhrClaims> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('รูปแบบ id_token ไม่ถูกต้อง');
  const [h, p, s] = parts;

  const header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'));
  if (header.alg !== 'RS256') throw new Error(`ไม่รองรับอัลกอริทึม ${header.alg}`);

  const key = await getKey(header.kid);
  const ok = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${h}.${p}`),
    key,
    Buffer.from(s, 'base64url')
  );
  if (!ok) throw new Error('ลายเซ็น id_token ไม่ถูกต้อง');

  const claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as GoodhrClaims;

  const iss = (claims.iss || '').replace(/\/+$/, '');
  if (iss !== issuer()) throw new Error(`ผู้ออก token ไม่ตรงกับที่ตั้งค่าไว้ (${claims.iss})`);

  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(clientId())) throw new Error('token ไม่ได้ออกให้แอปนี้');

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp === 'number' && now >= claims.exp) throw new Error('token หมดอายุแล้ว');
  // เผื่อนาฬิกาสองเครื่องคลาดกันเล็กน้อย
  if (typeof claims.iat === 'number' && claims.iat > now + 120) throw new Error('เวลาบน token ผิดปกติ');

  if (expectedNonce && claims.nonce !== expectedNonce) throw new Error('nonce ไม่ตรง (กันการเล่นซ้ำ)');

  return claims;
}

/* ─────────────────────────── แลก code เป็น token ─────────────────────────── */

export interface TokenSet {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

export async function exchangeCode(code: string, verifier: string): Promise<TokenSet> {
  const { token_endpoint } = await discover();
  const res = await fetch(token_endpoint, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      client_id: clientId(),
      client_secret: clientSecret(),
      code_verifier: verifier,
    }),
  });

  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error_description || json.error || `แลก token ไม่สำเร็จ (HTTP ${res.status})`);
  }
  if (!json.id_token) throw new Error('GoodHR ไม่ได้ส่ง id_token กลับมา');
  return json as TokenSet;
}

/** ดึงข้อมูลล่าสุดจาก userinfo (id_token คือข้อมูล ณ ตอนล็อกอิน) */
export async function fetchUserinfo(accessToken: string): Promise<Partial<GoodhrClaims>> {
  const { userinfo_endpoint } = await discover();
  const res = await fetch(userinfo_endpoint, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) return {};
  return (await res.json()) as Partial<GoodhrClaims>;
}

/** สร้าง URL พาผู้ใช้ไปล็อกอินที่ GoodHR */
export async function buildAuthorizeUrl(p: {
  state: string; nonce: string; challenge: string;
}): Promise<string> {
  const { authorization_endpoint } = await discover();
  const url = new URL(authorization_endpoint);
  url.searchParams.set('client_id', clientId());
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', process.env.GOODHR_SCOPE || 'openid profile email employee');
  url.searchParams.set('state', p.state);
  url.searchParams.set('nonce', p.nonce);
  url.searchParams.set('code_challenge', p.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  // URLSearchParams เข้ารหัสช่องว่างเป็น + ซึ่งถูกต้องตามสเปก
  // แต่เอกสารของ GoodHR ใช้ %20 จึงแปลงให้ตรงกัน ลดโอกาสเจอ server ที่ตีความต่างกัน
  return url.toString().replace(/\+/g, '%20');
}

/* ─────────────────── แปลง app_role จาก GoodHR เป็นบทบาทของ ONEBOOK ─────────────────── */

/** GoodHR อาจส่งมาเป็นรหัส (accountant) หรือชื่อไทย (พนักงานบัญชี) รับได้ทั้งสองแบบ */
const ROLE_ALIAS: Record<string, string> = {
  owner: 'owner', 'เจ้าของกิจการ': 'owner',
  accounting_manager: 'accounting_manager', 'สมุห์บัญชี': 'accounting_manager',
  accountant: 'accountant', 'พนักงานบัญชี': 'accountant',
  sales: 'sales', 'ฝ่ายขาย': 'sales',
  purchasing: 'purchasing', 'ฝ่ายจัดซื้อ': 'purchasing', 'จัดซื้อ': 'purchasing',
  executive: 'executive', 'ผู้บริหาร': 'executive',
  auditor: 'auditor', 'ผู้ตรวจสอบ': 'auditor',
};

export function mapAppRole(appRole?: string | null): string | null {
  if (!appRole) return null;
  return ROLE_ALIAS[appRole.trim()] || ROLE_ALIAS[appRole.trim().toLowerCase()] || null;
}

/**
 * ให้สิทธิ์อัตโนมัติจาก app_role ของ GoodHR หรือไม่
 *
 * ค่าเริ่มต้นคือ "ไม่" — ผู้ดูแล ONEBOOK ต้องอนุญาตเองตามที่ตกลงกันไว้
 * เปิดได้เมื่ออยากให้ผู้ดูแล GoodHR เป็นคนกำหนดสิทธิ์แทน
 */
export function trustAppRole(): boolean {
  return process.env.GOODHR_TRUST_APP_ROLE === 'true';
}
