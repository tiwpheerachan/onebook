#!/usr/bin/env node
/**
 * ตรวจว่าข้อความที่ผู้ใช้เห็นถูกย้ายเข้าพจนานุกรมครบหรือยัง
 *
 * ตรวจสองอย่าง
 *   1) คีย์ในพจนานุกรมครบทั้งสามภาษาไหม (th เป็นตัวกำหนดชนิด ที่จริง typecheck จับให้อยู่แล้ว
 *      แต่ตรวจซ้ำเพื่อจับกรณีคัดลอกค่าไทยไปวางในไฟล์ en/zh โดยไม่ได้แปล)
 *   2) ยังมีภาษาไทยฝังในโค้ดตรงไหนบ้าง โดยยกเว้นสิ่งที่ต้องเป็นไทยตามข้อตกลงในโครงการ
 *
 * รัน: node scripts/i18n-audit.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.join(process.cwd(), 'src');
const THAI = /[฀-๿]/;

/** แฟ้มที่ต้องเป็นภาษาไทยตามกฎหมายหรือตามข้อตกลง ไม่นับเป็นข้อบกพร่อง */
const EXEMPT = [
  { p: 'src/i18n/', why: 'ตัวพจนานุกรมเอง' },
  { p: 'src/lib/help/content.ts', why: 'เนื้อหาคู่มือเก็บเป็น {th,en,zh} อยู่แล้ว' },
  { p: 'src/lib/baht-text.ts', why: 'การอ่านจำนวนเงินเป็นตัวอักษรไทย' },
  { p: 'src/lib/import-map.ts', why: 'หัวคอลัมน์ไทยที่ใช้จับคู่ตอนนำเข้า CSV' },
  { p: 'src/lib/bank-csv.ts', why: 'หัวคอลัมน์ไทยของไฟล์จากธนาคาร' },
  { p: 'src/lib/wht-form.ts', why: 'แบบพิมพ์ 50 ทวิ ตามกฎหมาย' },
  { p: 'src/app/(print)/', why: 'แบบพิมพ์ตามกฎหมาย' },
  { p: 'src/components/documents/document-print.tsx', why: 'แบบพิมพ์ตามกฎหมาย' },
  { p: 'src/components/documents/print-meta.ts', why: 'แบบพิมพ์ตามกฎหมาย' },
  { p: 'src/components/tax/vat-report.tsx', why: 'หัวคอลัมน์ตามแบบรายงานภาษี' },
  { p: 'src/app/api/ai/', why: 'พรอมต์ที่ส่งให้โมเดล ไม่ใช่ UI' },
];

const exemptFor = (rel) => EXEMPT.find((e) => rel.startsWith(e.p) || rel === e.p);

/** ชื่อประเภทเงินได้ตามประมวลรัษฎากรและชื่อบัญชีมาตรฐาน ห้ามแปล */
const LINE_EXEMPT = [
  /name_th|nameTh/,                 // ชื่อไทยของผังบัญชี/ข้อมูลหลัก เป็นข้อมูล ไม่ใช่ UI
  /pnd_form|WHT_PRESETS|ภ\.ง\.ด|ภ\.พ\.30|50 ทวิ/,
  /^\s*(\/\/|\*|\/\*)/,             // คอมเมนต์ — โครงการกำหนดให้เขียนไทย
];

const files = [];
(function walk(dir) {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(n)) files.push(p);
  }
})(SRC);

// ── 1. พจนานุกรมสามภาษา ────────────────────────────────────────────────
const dictDir = path.join(SRC, 'i18n/dictionaries');
const read = (f) => fs.readFileSync(path.join(dictDir, f), 'utf8');
const [thSrc, enSrc, zhSrc] = ['th.ts', 'en.ts', 'zh.ts'].map(read);

/** ดึงคู่ key: 'value' แบบหยาบ ๆ พอสำหรับหาค่าที่ยังไม่ได้แปล */
function pairs(src) {
  const out = new Map();
  const re = /([A-Za-z_][A-Za-z0-9_]*)\s*:\s*'((?:[^'\\]|\\.)*)'/g;
  let m;
  while ((m = re.exec(src))) out.set(m[1] + '#' + out.size, m[2]);
  return out;
}
const thVals = [...pairs(thSrc).values()];
const enVals = [...pairs(enSrc).values()];
const zhVals = [...pairs(zhSrc).values()];

const enThai = enVals.filter((v) => THAI.test(v));
const zhThai = zhVals.filter((v) => THAI.test(v));

console.log('=== 1. พจนานุกรม ===');
console.log(`th: ${thVals.length} ค่า · en: ${enVals.length} ค่า · zh: ${zhVals.length} ค่า`);
console.log(`ค่าที่ยังเป็นภาษาไทยในไฟล์ en: ${enThai.length}`);
enThai.slice(0, 10).forEach((v) => console.log('   • ' + v.slice(0, 70)));
console.log(`ค่าที่ยังเป็นภาษาไทยในไฟล์ zh: ${zhThai.length}`);
zhThai.slice(0, 10).forEach((v) => console.log('   • ' + v.slice(0, 70)));

// ── 2. ภาษาไทยที่ยังฝังอยู่ในโค้ด ───────────────────────────────────────
console.log('\n=== 2. ภาษาไทยที่ยังฝังอยู่ในโค้ด ===');
const offenders = [];
let exemptCount = 0;

for (const f of files) {
  const rel = path.relative(process.cwd(), f);
  const ex = exemptFor(rel);
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  let hits = 0;
  const samples = [];
  lines.forEach((ln, i) => {
    if (!THAI.test(ln)) return;
    if (LINE_EXEMPT.some((re) => re.test(ln))) return;
    // นับเฉพาะข้อความที่แสดงผล : ใน JSX หรือในสตริงที่ไม่ใช่คอมเมนต์
    const inJsx = />[^<>{}]*[฀-๿][^<>{}]*</.test(ln);
    const inStr = /(['"`])[^'"`]*[฀-๿][^'"`]*\1/.test(ln);
    if (!inJsx && !inStr) return;
    hits++;
    if (samples.length < 3) samples.push(`L${i + 1}: ` + ln.trim().slice(0, 80));
  });
  if (!hits) continue;
  if (ex) { exemptCount += hits; continue; }
  offenders.push({ rel, hits, samples });
}

offenders.sort((a, b) => b.hits - a.hits);
const total = offenders.reduce((a, x) => a + x.hits, 0);
console.log(`ยกเว้นตามข้อตกลง: ${exemptCount} บรรทัด`);
console.log(`ต้องแก้: ${total} บรรทัด ใน ${offenders.length} ไฟล์\n`);
offenders.slice(0, 25).forEach((o) => {
  console.log(`${String(o.hits).padStart(4)}  ${o.rel}`);
  o.samples.forEach((s) => console.log('        ' + s));
});
if (offenders.length > 25) console.log(`\n... และอีก ${offenders.length - 25} ไฟล์`);

process.exit(total > 0 || enThai.length > 0 || zhThai.length > 0 ? 1 : 0);
