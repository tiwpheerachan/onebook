# นำ ONEBOOK ขึ้น Render

Repo : `https://github.com/tiwpheerachan/onebook.git` · branch `main`

---

## ⚠️ ทำก่อนเป็นอันดับแรก : เปลี่ยนรหัสผ่านและคีย์

รหัสผ่านฐานข้อมูลกับ `service_role` key เคยถูกส่งผ่านแชท **ก่อนเปิดระบบสู่อินเทอร์เน็ตควรเปลี่ยนใหม่ทั้งคู่**
เพราะ `service_role` ข้าม RLS ได้ทั้งหมด ใครได้ไปคืออ่าน-แก้ข้อมูลทุกบริษัทได้

1. Supabase → Settings → **Database** → Reset database password
2. Supabase → Settings → **API Keys** → Roll `service_role`
3. เอาค่าใหม่ไปกรอกใน Render ตามตารางด้านล่าง (และแก้ `.env.local` บนเครื่องด้วย)

---

## วิธีที่ 1 — ใช้ Blueprint (แนะนำ ตั้งค่าให้เองเกือบหมด)

1. Render Dashboard → **New** → **Blueprint**
2. เลือก repo `tiwpheerachan/onebook`
3. Render อ่าน `render.yaml` แล้วตั้ง build/start/region/health check ให้เอง
4. เหลือกรอกเฉพาะค่าลับ 3 ตัว (ดูตารางข้างล่าง) แล้วกด **Apply**

`APP_ORIGIN` ถูกตั้งให้ชี้ URL ของตัวเองอัตโนมัติ ไม่ต้องกรอก

---

## วิธีที่ 2 — สร้าง Web Service เอง

Render Dashboard → **New** → **Web Service** → เลือก repo แล้วกรอกตามนี้

| ช่อง | ค่าที่กรอก |
|---|---|
| Name | `onebook` |
| Language / Runtime | **Node** |
| Region | **Singapore** (ใกล้ไทยและใกล้ Supabase ที่ Tokyo ที่สุด) |
| Branch | `main` |
| Root Directory | *(เว้นว่าง)* |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |
| Instance Type | `Starter` ขึ้นไป |

> **ห้ามใช้ `next start`** — โปรเจกต์ตั้ง `output: 'standalone'` ไว้ คำสั่งนั้นจะรันไม่ขึ้น
> `npm start` ในโปรเจกต์นี้ชี้ไปที่ `node .next/standalone/server.js` แล้ว และมี `postbuild`
> คัดลอก `.next/static` กับ `public/` เข้าไปให้อัตโนมัติ

---

## Environment Variables

### จำเป็น (ไม่ใส่ = เปิดไม่ขึ้น)

| Key | ค่า | เอามาจากไหน |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGci...` | Supabase → Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGci...` | Supabase → Settings → API → service_role **(ค่าลับ)** |
| `APP_ORIGIN` | `https://onebook-xxxx.onrender.com` | URL ของบริการนี้ **ห้ามมี `/` ปิดท้าย** |

### ควรใส่

| Key | ค่าแนะนำ | ทำอะไร |
|---|---|---|
| `NODE_VERSION` | `20.18.0` | ล็อกเวอร์ชัน Node |
| `HOSTNAME` | `0.0.0.0` | ให้ server ฟังทุก interface |
| `ALLOWED_IPS` | *(เว้นว่าง)* | จำกัด IP ที่เข้าได้ |
| `ENFORCE_IP_ALLOWLIST` | `false` | เปิดบังคับตรวจ IP |
| `SESSION_IDLE_TIMEOUT_MINUTES` | `30` | เตะออกเมื่อไม่ใช้งาน |
| `NEXT_PUBLIC_APP_NAME` | `ONEBOOK` | ชื่อที่แสดง |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | `th` | ภาษาเริ่มต้น |

### ไม่บังคับ

| Key | ทำอะไร |
|---|---|
| `AI_API_URL` `AI_API_KEY` `AI_MODEL` | ให้ AI เรียบเรียงบทสรุปงานและผลตรวจก่อนปิดงบ ไม่ตั้งก็ยังสรุปด้วยกฎได้ |
| `ETAX_API_URL` `ETAX_API_KEY` `ETAX_CERT_ID` | นำส่ง e-Tax Invoice ผ่านผู้ให้บริการที่ ETDA รับรอง |
| `AICOM_API_URL` `AICOM_API_KEY` | เชื่อมบริการอ่านเอกสารด้วย OCR/AI |

---

## 3 กับดักที่ทำให้พังบ่อยที่สุด

**1. `APP_ORIGIN` ไม่ตรงกับ URL จริง**
เปิดหน้าเว็บได้ปกติ แต่**กดบันทึกอะไรก็ไม่ได้ ขึ้น 403** เพราะ middleware เทียบ Origin ของทุก request ที่เป็นการบันทึก
ครั้งแรกที่ deploy จะยังไม่รู้ URL — ปล่อยว่างไว้ก่อนได้ (ระบบจะข้ามการตรวจ) พอรู้ URL แล้วค่อยใส่แล้ว deploy ใหม่
ถ้าใช้ Blueprint ค่านี้ถูกตั้งอัตโนมัติแล้ว

**2. `ALLOWED_IPS` ใส่ผิด → เข้าเว็บไม่ได้เลยทั้งระบบ**
ตอนเริ่มให้**เว้นว่าง** ไว้ก่อน ค่อยใส่ IP ออฟฟิศเมื่อทุกอย่างนิ่งแล้ว
ถ้าล็อกตัวเองออก : แก้ค่าใน Render → Environment แล้ว Restart

**3. แก้ตัวแปรที่ขึ้นต้น `NEXT_PUBLIC_` แล้วแค่ Restart**
ค่าเหล่านี้ถูกฝังตอน build ต้องกด **Manual Deploy → Deploy latest commit** ถึงจะมีผล

---

## หลัง deploy เสร็จ

1. เปิด `https://<url>/api/health` ต้องได้ `{"status":"ok"}`
2. เข้า `https://<url>/login` แล้วล็อกอินด้วย `the.dataverse@shd-technology.co.th`
3. ถ้าล็อกอินได้แต่บันทึกไม่ได้ → `APP_ORIGIN` ผิด
4. Supabase → Settings → Database → **Connection Pooling** เปิดไว้ (แนะนำ) เพราะ Render สร้าง instance ใหม่ได้

### migration ฐานข้อมูล

`supabase/migrations/` มีถึงไฟล์ `0023` แล้ว **ทั้งหมดรันขึ้นฐานข้อมูลจริงไปแล้ว** ไม่ต้องรันซ้ำ
ถ้าสร้างฐานข้อมูลใหม่ ให้รันไล่ตามลำดับเลข `0001 → 0023` ใน Supabase SQL Editor

---

## เรื่องความเร็ว

Supabase อยู่ที่ Tokyo — เลือก Render region **Singapore** จะได้ latency ต่ำสุดเท่าที่ Render มี
ถ้าต้องการเร็วกว่านี้ ย้าย Supabase project ไป Singapore แล้วเว็บจะไวขึ้นชัดเจน

แพ็กเกจ Free ของ Render จะ**หลับเมื่อไม่มีคนใช้ 15 นาที** เปิดครั้งถัดไปรอ ~50 วินาที
ระบบบัญชีที่ใช้งานจริงควรใช้ **Starter ขึ้นไป**
