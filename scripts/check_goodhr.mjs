#!/usr/bin/env node
/**
 * ตรวจการตั้งค่า "เข้าสู่ระบบด้วย GoodHR" ก่อนใช้งานจริง
 *
 *   node scripts/check_goodhr.mjs
 *
 * ตรวจให้ครบทุกจุดที่มักพลาด โดยเฉพาะ redirect_uri ไม่ตรง
 * ซึ่งเป็นปัญหาที่เอกสาร GoodHR บอกเองว่าเจอบ่อยที่สุด
 */
import fs from 'node:fs';
import path from 'node:path';

const C = {
  ok: (s) => `\x1b[32m✓\x1b[0m ${s}`,
  bad: (s) => `\x1b[31m✗\x1b[0m ${s}`,
  warn: (s) => `\x1b[33m!\x1b[0m ${s}`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
};

// อ่าน .env.local แบบง่าย ๆ (ไม่พึ่ง dependency)
for (const file of ['.env.local', '.env']) {
  const p = path.join(process.cwd(), file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const k = t.slice(0, t.indexOf('=')).trim();
    const v = t.slice(t.indexOf('=') + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}

const issuer = (process.env.GOODHR_ISSUER || '').replace(/\/+$/, '');
const clientId = process.env.OAUTH_CLIENT_ID || process.env.GOODHR_CLIENT_ID || '';
const secret = process.env.OAUTH_CLIENT_SECRET || process.env.GOODHR_CLIENT_SECRET || '';
const appOrigin = (process.env.APP_ORIGIN || '').replace(/\/+$/, '');
const redirect = process.env.OAUTH_REDIRECT_URI
  || (appOrigin ? `${appOrigin}/api/auth/callback/goodhr` : '');

let fail = 0;
const bad = (m) => { console.log(C.bad(m)); fail++; };

console.log(C.b('\nตรวจการตั้งค่า GoodHR SSO\n'));

/* ── 1) ตัวแปรครบไหม ── */
console.log(C.b('1) ตัวแปรสภาพแวดล้อม'));
const todo = (v) => !v || v.startsWith('TODO');

if (todo(issuer)) bad(`GOODHR_ISSUER ยังไม่ได้ตั้ง — ขอโดเมนจริงจากผู้ดูแล GoodHR`);
else if (!/^https?:\/\//.test(issuer)) bad(`GOODHR_ISSUER ต้องขึ้นต้นด้วย http(s):// — ตอนนี้คือ "${issuer}"`);
else console.log(C.ok(`GOODHR_ISSUER = ${issuer}`));

if (todo(clientId)) bad('OAUTH_CLIENT_ID ยังไม่ได้ตั้ง');
else console.log(C.ok(`OAUTH_CLIENT_ID = ${clientId}`));

if (todo(secret)) bad('OAUTH_CLIENT_SECRET ยังไม่ได้ตั้ง — ขอจากผู้ดูแล GoodHR (เป็นค่าลับ)');
else console.log(C.ok(`OAUTH_CLIENT_SECRET = ${secret.slice(0, 7)}… (${secret.length} ตัวอักษร)`));

if (!redirect) bad('OAUTH_REDIRECT_URI ยังไม่ได้ตั้ง และไม่มี APP_ORIGIN ให้ประกอบ');
else {
  console.log(C.ok(`OAUTH_REDIRECT_URI = ${redirect}`));
  if (!redirect.endsWith('/api/auth/callback/goodhr'))
    bad('  path ต้องลงท้ายด้วย /api/auth/callback/goodhr ให้ตรงกับ route ในโค้ด');
  if (redirect.endsWith('/')) bad('  ห้ามมี / ปิดท้าย');
  if (redirect.startsWith('http://') && !redirect.includes('localhost'))
    console.log(C.warn('  ไม่ใช่ localhost แต่ใช้ http:// — production ต้องเป็น https://'));
  if (appOrigin && !redirect.startsWith(appOrigin))
    console.log(C.warn(`  ไม่ได้ขึ้นต้นด้วย APP_ORIGIN (${appOrigin}) — ตรวจว่าตั้งใจ`));
}

console.log(C.ok(`GOODHR_TRUST_APP_ROLE = ${process.env.GOODHR_TRUST_APP_ROLE || 'false'} ` +
  C.dim(process.env.GOODHR_TRUST_APP_ROLE === 'true'
    ? '(ให้ HR กำหนดบทบาท)' : '(ผู้ดูแล ONEBOOK อนุญาตรายคนเอง)')));
console.log(C.ok(`ALLOW_PASSWORD_LOGIN = ${process.env.ALLOW_PASSWORD_LOGIN || 'false'} ` +
  C.dim(process.env.ALLOW_PASSWORD_LOGIN === 'true'
    ? '(มีทางเข้าสำรอง)' : '(เข้าได้ทาง GoodHR ทางเดียว)')));

if (todo(issuer)) {
  console.log(C.b('\nยังตรวจต่อไม่ได้ เพราะยังไม่รู้โดเมน GoodHR\n'));
  process.exit(1);
}

/* ── 2) คุยกับ GoodHR ได้ไหม ── */
console.log(C.b('\n2) เชื่อมต่อ GoodHR'));
const get = async (url) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try { return await fetch(url, { signal: ctrl.signal }); }
  finally { clearTimeout(t); }
};

let disco = null;
try {
  const res = await get(`${issuer}/.well-known/openid-configuration`);
  if (!res.ok) bad(`discovery ตอบ HTTP ${res.status} — ตรวจว่าโดเมนถูกและเซิร์ฟเวอร์เปิดอยู่`);
  else {
    disco = await res.json();
    console.log(C.ok('อ่าน discovery ได้'));
    const di = (disco.issuer || '').replace(/\/+$/, '');
    if (di !== issuer)
      bad(`issuer ไม่ตรง : GoodHR บอกว่า "${di}" แต่เราตั้งไว้ "${issuer}" — library จะปฏิเสธ token ทันที`);
    else console.log(C.ok(`issuer ตรงกัน (${di})`));
    for (const k of ['authorization_endpoint', 'token_endpoint', 'userinfo_endpoint', 'jwks_uri'])
      console.log(disco[k] ? C.ok(`  ${k}`) : C.bad(`  ขาด ${k}`));
  }
} catch (e) {
  bad(`ต่อ ${issuer} ไม่ได้ : ${e.message}`);
  console.log(C.dim('   ถ้า GoodHR อยู่บน Render free plan อาจกำลังหลับ ลองใหม่อีกครั้ง'));
}

/* ── 3) กุญแจตรวจลายเซ็น ── */
if (disco?.jwks_uri) {
  console.log(C.b('\n3) กุญแจตรวจลายเซ็น (JWKS)'));
  try {
    const res = await get(disco.jwks_uri);
    const j = await res.json();
    const keys = j.keys || [];
    if (!keys.length) bad('ไม่มีกุญแจใน JWKS');
    else {
      console.log(C.ok(`มีกุญแจ ${keys.length} ใบ`));
      for (const k of keys) {
        const okAlg = k.alg === 'RS256' || k.kty === 'RSA';
        console.log(okAlg ? C.ok(`  kid=${k.kid} ${k.alg || k.kty}`) : C.warn(`  kid=${k.kid} ไม่ใช่ RSA/RS256`));
      }
    }
  } catch (e) { bad(`อ่าน JWKS ไม่ได้ : ${e.message}`); }
}

/* ── 4) สรุป ── */
console.log(C.b('\n4) สิ่งที่ต้องตรงกับที่ลงทะเบียนไว้ฝั่ง GoodHR'));
console.log(`   redirect_uri : ${C.b(redirect)}`);
console.log(`   client_id    : ${C.b(clientId || '(ยังไม่ตั้ง)')}`);
console.log(C.dim('   ถ้าไม่ตรงเป๊ะทุกตัวอักษร จะขึ้น redirect_uri mismatch'));

console.log(fail === 0
  ? C.b('\n✓ ตั้งค่าครบถ้วน พร้อมทดสอบล็อกอินได้เลย\n')
  : C.b(`\n✗ ยังมี ${fail} จุดที่ต้องแก้\n`));
process.exit(fail === 0 ? 0 : 1);
