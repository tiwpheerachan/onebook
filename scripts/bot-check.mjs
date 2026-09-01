#!/usr/bin/env node
/**
 * ตรวจว่า token ของธนาคารแห่งประเทศไทยใช้ได้ไหม
 *
 * อ่านค่าจาก .env.local โดยตรง ไม่พิมพ์ token ออกหน้าจอ
 * ถ้ารูปแบบ header ที่ตั้งไว้ใช้ไม่ได้ จะลองแบบอื่นให้แล้วบอกว่าต้องตั้งเป็นอะไร
 *
 * รัน: node scripts/bot-check.mjs [สกุลเงิน] [วันที่]
 *      node scripts/bot-check.mjs CNY 2026-08-28
 */
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.join(process.cwd(), '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('ไม่พบไฟล์ .env.local');
  process.exit(1);
}
const env = {};
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

const key = env.BOT_API_KEY;
if (!key) {
  console.error('ยังไม่ได้ใส่ BOT_API_KEY ใน .env.local');
  console.error('เอามาจาก portal.api.bot.or.th -> Profile -> My apps -> Copy');
  process.exit(1);
}
console.log(`พบ token ยาว ${key.length} ตัวอักษร (ขึ้นต้น ${key.slice(0, 4)}…)\n`);

const base = (env.BOT_API_URL
  || 'https://gateway.api.bot.or.th/Stat-ExchangeRate/v2/DAILY_AVG_EXG_RATE/').replace(/\/+$/, '') + '/';

const currency = process.argv[2] || 'CNY';
// ธปท. ประกาศ 18.00 น. ของวันทำการ ถ้ายังไม่ประกาศให้ถอยไปวันก่อนหน้า
const date = process.argv[3] || new Date(Date.now() - 86400000).toLocaleDateString('sv-SE');

/** ลองทีละแบบจนกว่าจะได้ แล้วบอกว่าต้องตั้ง BOT_API_AUTH เป็นอะไร */
const VARIANTS = [
  { name: '(เว้นว่าง)  Authorization: <token>', headers: { authorization: key } },
  { name: 'bearer      Authorization: Bearer <token>', headers: { authorization: `Bearer ${key}` } },
  { name: 'client-id   X-IBM-Client-Id: <token>', headers: { 'X-IBM-Client-Id': key } },
];

const url = new URL(base);
url.searchParams.set('start_period', date);
url.searchParams.set('end_period', date);
url.searchParams.set('currency', currency);

console.log(`ยิงไปที่ ${url.origin}${url.pathname}`);
console.log(`สกุล ${currency} วันที่ ${date}\n`);

let done = false;
for (const v of VARIANTS) {
  process.stdout.write(`ลอง ${v.name} … `);
  try {
    const res = await fetch(url, { headers: { ...v.headers, accept: 'application/json' } });
    if (!res.ok) {
      console.log(`HTTP ${res.status}`);
      continue;
    }
    const json = await res.json();
    const rows = json?.result?.data?.data_detail ?? json?.data?.data_detail ?? [];
    if (!Array.isArray(rows) || rows.length === 0) {
      console.log('ผ่าน แต่ไม่มีข้อมูลของวันนี้ (อาจเป็นวันหยุด ลองวันทำการก่อนหน้า)');
      done = true;
      break;
    }
    console.log('สำเร็จ\n');
    for (const r of rows) {
      console.log(`  ${r.currency_id}  ${r.period}  ซื้อ ${r.buying_sight}  ขาย ${r.selling}`);
    }
    const sell = Number(rows[0].selling);
    console.log(`\nอัตราขายที่ระบบจะใช้ : ${sell}`);
    console.log(`ตัวอย่าง ซื้อของ 10,000 ${currency} = ${(10000 * sell).toLocaleString('en-US')} บาท`);
    const want = v.name.split(' ')[0].replace('(เว้นว่าง)', '');
    console.log(
      want
        ? `\nตั้งใน .env.local :  BOT_API_AUTH=${want}`
        : '\nรูปแบบ header ตั้งต้นถูกอยู่แล้ว ไม่ต้องตั้ง BOT_API_AUTH'
    );
    done = true;
    break;
  } catch (e) {
    console.log(`เชื่อมต่อไม่ได้ : ${e.message}`);
  }
}

if (!done) {
  console.log('\nยังใช้ไม่ได้ทั้งสามแบบ ตรวจสอบว่า');
  console.log('  1. แอปใน My apps ได้รับอนุมัติแล้ว (สถานะไม่ใช่ pending)');
  console.log('  2. Subscribe บริการ Exchange Rates แล้ว');
  console.log('  3. คัดลอก token มาครบ ไม่มีช่องว่างหรือขึ้นบรรทัดใหม่ปน');
  process.exit(1);
}
