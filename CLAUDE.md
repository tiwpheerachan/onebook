# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

# กติกาเฉพาะของโปรเจกต์ ONEBOOK

ส่วนบนเป็นแนวทางกลางจาก `forrestchang/andrej-karpathy-skills`
ส่วนนี้คือข้อตกลงเฉพาะของโปรเจกต์นี้ ถ้าขัดกัน ให้ยึดส่วนนี้

## ภาษา — ต้องครบสามภาษาเสมอ

ข้อความที่ผู้ใช้เห็นทุกตัวต้องอยู่ใน `src/i18n/dictionaries/` ครบทั้ง `th.ts` `en.ts` `zh.ts`
**ห้ามฝังภาษาไทยไว้ในคอมโพเนนต์หรือหน้าจอ**

- `th.ts` เป็นตัวกำหนดชนิด `Dictionary` เพิ่มคีย์ที่นั่นก่อน แล้วใส่ให้ครบอีกสองภาษาใน commit เดียวกัน
- ขาดภาษาใดภาษาหนึ่ง `npm run typecheck` จะไม่ผ่าน ใช้เป็นด่านตรวจได้
- คอมโพเนนต์ฝั่ง client ให้รับ dictionary เป็น prop จาก server component ไม่เรียก `t()` เอง

**ยกเว้นที่ต้องเป็นไทย** ห้ามแปล — แบบพิมพ์ตามกฎหมาย (ใบกำกับภาษี, 50 ทวิ),
ชื่อประเภทเงินได้ตามประมวลรัษฎากร, หัวคอลัมน์ไทยที่ใช้จับคู่ตอนนำเข้าไฟล์ CSV,
และพรอมต์ที่ส่งให้โมเดล AI (ไม่ใช่ UI)

## คอมเมนต์

เขียนเป็นภาษาไทย อธิบาย **"ทำไม"** ไม่ใช่ "ทำอะไร" โดยเฉพาะจุดที่เลือกทางที่ไม่ชัดในตัวเอง
ให้เนียนไปกับโค้ดรอบข้าง อย่าเพิ่มความหนาแน่นเกินของเดิม

## ฐานข้อมูล

- **migration ไม่ได้รันอัตโนมัติตอน deploy** ต้องรันเองเรียงตามลำดับไฟล์
- ทดสอบทุกฟังก์ชันใหม่ใต้ RLS จริงเสมอ ห้ามทดสอบด้วยสิทธิ์ service role อย่างเดียว

  ```sql
  begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);
  -- ทดสอบตรงนี้
  rollback;
  ```

- **ห้ามลบข้อมูลในฐานข้อมูลจริงโดยไม่ได้รับอนุมัติชัดเจน** ให้ลิสต์สิ่งที่จะลบให้ดูก่อนเสมอ
- ฟังก์ชัน `rpt_*` ที่อ่านข้อมูลผู้ใช้ ให้เป็น **security invoker** เพื่อให้ RLS กรองสิทธิ์เอง
  ใช้ `security definer` เฉพาะตอนจำเป็นต้องข้าม RLS จริง ๆ และต้องเช็ค `app.has_perm()` ในตัวเอง
- ข้อมูลจำลองใช้ `seed_demo_data` / `purge_demo_data` ซึ่งจดทะเบียนแถวที่สร้างไว้
  **ห้ามเขียนคำสั่งลบที่อิงคำนำหน้าชื่อ** เพราะจะกวาดข้อมูลจริงที่ชื่อคล้ายกันไปด้วย

## รันและ build

- `output: 'standalone'` — **`next start` ใช้ไม่ได้** ต้อง `node .next/standalone/server.js`
- **พอร์ต 3000 เป็นของ GoodHR** ตอนพัฒนา ONEBOOK ให้ใช้ 3100 และตั้ง `APP_ORIGIN` ให้ตรงพอร์ต
  ไม่งั้น middleware จะบล็อก POST ทุกอันด้วย 403
- อย่ารัน build ขณะที่ dev server ของโปรเจกต์เดียวกันเปิดอยู่ `.next` จะพัง
- ฆ่า process เก่าบนพอร์ตให้แน่ใจก่อนทดสอบ ไม่งั้นจะทดสอบโดนตัวเก่าแล้วสรุปผิด

## ข้อควรระวังที่เคยพลาดมาแล้ว

- **`middleware.ts` ต้องอยู่ใน `src/`** เพราะโปรเจกต์ใช้โครงสร้าง `src/`
  วางไว้ที่รากโปรเจกต์ Next.js จะไม่คอมไพล์ให้และไม่มีอะไรฟ้อง
- **header ใน `next.config.mjs` ถูกผูกค่าตั้งแต่ตอน build** อันที่ต้องอ่าน env ตอน request
  ให้ตั้งที่ middleware แทน
- Server Component **ส่ง prop ที่เป็นฟังก์ชันให้ Client Component ไม่ได้** typecheck ไม่จับ
  พังตอนรันเท่านั้น ให้ส่งเป็น `ReactNode` ที่ render ไว้แล้ว
- เมนูหรือกล่องลอยที่อยู่ในคอนเทนเนอร์ที่มี `overflow` จะถูกตัดจนมองไม่เห็น ใช้ `createPortal`
- **AI แก้เอกสารเองไม่ได้** เส้นทางที่ AI เรียกต้องไม่มีคำสั่งเขียนฐานข้อมูล
  การลงมือจริงอยู่ที่ server action ที่คนกดยืนยัน และต้องตรวจสิทธิ์ใหม่ทั้งหมด
  ไม่เชื่อค่าที่ส่งมาจากเบราว์เซอร์
- ระวังของที่กิน GPU — เอฟเฟกต์ที่วาดต่อเนื่องต้องจำกัดเฟรม จำกัดความละเอียด
  และหยุดเมื่อผู้ใช้ไม่ได้มอง เลี่ยง `backdrop-blur` บนแถบที่ติดหนึบตอนเลื่อน

## ก่อนบอกว่าเสร็จ

`npm run typecheck` → `npm run build` → ยิงเซิร์ฟเวอร์จริงเทสต์ route ที่แก้
ถ้าแตะฐานข้อมูล ให้ทดสอบใต้ RLS ด้วย รายงานผลตามจริง รวมทั้งข้อที่ยังไม่ผ่าน
