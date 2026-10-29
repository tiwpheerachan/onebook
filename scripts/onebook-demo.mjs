#!/usr/bin/env node
// รัน/ลบ ข้อมูลตัวอย่าง (DEMO) ของ ONEBOOK บน Supabase ผ่าน Management API
// ใช้ SUPABASE_ACCESS_TOKEN + project ref จาก .env.local (ไม่ต้องมีรหัส DB)
//
//   node scripts/onebook-demo.mjs         # สร้าง/รีเฟรช (idempotent — ล้างของเก่าก่อนเสมอ)
//   node scripts/onebook-demo.mjs clean   # ลบข้อมูล DEMO ออกทั้งหมด (ตอนจะใช้จริง)
//
// เอกสาร DEMO ทั้งหมดทำเครื่องหมาย notes='DEMO-SEED' และ contacts code เริ่ม 'DEMO-'
// ลงเฉพาะบริษัท SHD · post เป็น group admin → journal บาลานซ์ · ขึ้นรายงานจริง

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '..');
const CLEAN = process.argv.includes('clean');

function envVal(key) {
  for (const f of ['.env.local', '.env']) {
    try {
      const line = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').find((l) => l.startsWith(key + '='));
      if (line) return line.slice(key.length + 1).trim().replace(/^['"]|['"]$/g, '');
    } catch {}
  }
  return '';
}

const TOKEN = envVal('SUPABASE_ACCESS_TOKEN');
const URL_ = envVal('NEXT_PUBLIC_SUPABASE_URL');
const REF = (URL_.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1];
if (!TOKEN || !REF) { console.error('✗ ไม่พบ SUPABASE_ACCESS_TOKEN หรือ project ref ใน .env.local'); process.exit(1); }

const sqlFile = CLEAN ? 'onebook-demo-clean.sql' : 'onebook-demo-seed.sql';
const query = fs.readFileSync(path.join(DIR, sqlFile), 'utf8');

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
});
const body = await res.text();
if (!res.ok || body.includes('"message"')) {
  console.error(`✗ failed (${res.status}):`, body.slice(0, 500));
  process.exit(1);
}
console.log(CLEAN ? '✓ ลบข้อมูล DEMO ของ ONEBOOK ออกแล้ว' : '✓ ลงข้อมูล DEMO ของ ONEBOOK แล้ว (16 เอกสาร SHD, post + บาลานซ์)');
