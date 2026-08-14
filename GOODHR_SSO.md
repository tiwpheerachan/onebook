# เข้าสู่ระบบด้วย GoodHR — คู่มือตั้งค่า

ตรวจการตั้งค่าได้ตลอดด้วย

```bash
npm run check:goodhr
```

ตอนนี้ผ่านครบทุกข้อแล้ว ✓

---

## ค่าใน `.env.local`

| ตัวแปร | ค่า |
|---|---|
| `GOODHR_ISSUER` | `http://localhost:3000` (ตอนพัฒนา) → โดเมนจริงตอนขึ้น production |
| `OAUTH_CLIENT_ID` | `ghr_onebookbb2ced` |
| `OAUTH_CLIENT_SECRET` | `ghs_…` (ค่าลับ อยู่ในไฟล์ที่ gitignore แล้ว) |
| `OAUTH_REDIRECT_URI` | `http://localhost:3100/api/auth/callback/goodhr` |
| `APP_ORIGIN` | `http://localhost:3100` |
| `GOODHR_TRUST_APP_ROLE` | `false` — ผู้ดูแล ONEBOOK อนุญาตรายคนเอง |
| `ALLOW_PASSWORD_LOGIN` | `true` ตอน dev / `false` ตอนขึ้นจริง |

> **พอร์ต 3000 เป็นของ GoodHR** ONEBOOK จึงต้องรันที่พอร์ตอื่น
> ```bash
> npm run dev -- -p 3100
> ```
> `APP_ORIGIN` ต้องตรงกับพอร์ตที่รันจริง ไม่งั้น middleware จะบล็อก POST ทุกอันด้วย 403

---

## ⛔ เหลืออีก 1 อย่างก่อนทดสอบได้ — เพิ่ม redirect URI ของ dev

GoodHR ตอนนี้ลงทะเบียนไว้เฉพาะ URL production ตรวจสอบแล้วด้วยการยิงจริง

```
✓ https://onebook-gxyz.onrender.com/api/auth/callback/goodhr   ← ผ่าน
✗ http://localhost:3100/api/auth/callback/goodhr               ← ยังไม่ได้ลงทะเบียน
```

**วิธีแก้** เข้า GoodHR → `/admin/sso` → แอป ONEBOOK → เพิ่ม redirect URI

```
http://localhost:3100/api/auth/callback/goodhr
```

ต้องตรงเป๊ะทุกตัวอักษร ไม่มี `/` ปิดท้าย

---

## ⚠️ ตรวจโดเมน production

ที่ลงทะเบียนไว้คือ `https://onebook-gxyz.onrender.com`
ถ้าโดเมนจริงบน Render ไม่ใช่ตัวนี้ ต้องเข้า `/admin/sso` แก้ให้ตรง ไม่งั้นล็อกอินบน production จะไม่ผ่าน

---

## ขั้นตอนทดสอบ

1. GoodHR รันอยู่ที่พอร์ต 3000 (ตรวจแล้วว่า discovery + JWKS ใช้ได้)
2. `npm run dev -- -p 3100` แล้วเข้า `http://localhost:3100/login`
3. กดปุ่ม **เข้าสู่ระบบด้วย GoodHR**
4. ครั้งแรกจะโดนปฏิเสธ เพราะยังไม่มีรายชื่อในระบบ — ถูกต้องแล้ว
5. ไปที่ **ตั้งค่า → ผู้ใช้และสิทธิ์ → อนุญาตพนักงาน GoodHR**
   ใส่รหัสพนักงานหรืออีเมล เลือกบทบาท + บริษัท แล้วลองล็อกอินใหม่

---

## ตอนขึ้น Render

ใส่ที่ **Environment** ของบริการ

```
GOODHR_ISSUER        = https://<โดเมนจริงของ GoodHR>
OAUTH_CLIENT_ID      = ghr_onebookbb2ced
OAUTH_CLIENT_SECRET  = ghs_…
OAUTH_REDIRECT_URI   = https://<โดเมนจริงของ ONEBOOK>/api/auth/callback/goodhr
APP_ORIGIN           = https://<โดเมนจริงของ ONEBOOK>
GOODHR_TRUST_APP_ROLE = false
ALLOW_PASSWORD_LOGIN  = false
```

---

## ใครตัดสินสิทธิ์

GoodHR ยืนยันแค่ว่า "คุณคือใคร" — ONEBOOK ตัดสินว่า "ทำอะไรได้บ้าง"

ลำดับความสำคัญ (ทดสอบไว้แล้วใน migration `0028`)

1. **มีคำเชิญจากผู้ดูแล ONEBOOK** → ใช้บทบาทตามคำเชิญ **เสมอ**
   ต่อให้ GoodHR ส่ง `app_role = owner` มาก็ทับไม่ได้
2. ไม่มีคำเชิญ + `GOODHR_TRUST_APP_ROLE=true` → ใช้ `app_role` จาก GoodHR
3. ไม่เข้าเงื่อนไขไหนเลย → **เข้าไม่ได้**

ตอนนี้ตั้ง `false` ตามที่ตกลงกันว่าจะคุมเองแบบละเอียด

---

## ความปลอดภัย

- `OAUTH_CLIENT_SECRET` อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น ห้ามขึ้นต้นด้วย `NEXT_PUBLIC_` ห้าม commit
- ถ้าหลุด → GoodHR `/admin/sso` → แอป ONEBOOK → "สร้าง secret ใหม่" (ของเก่าตายทันที)
  แล้วมาแก้ค่าใน `.env.local` และ Render
- ตัดสิทธิ์รายคนได้ 2 ทาง — ที่ GoodHR `/admin/sso` แท็บ "ใครใช้ได้บ้าง"
  หรือที่ ONEBOOK **ตั้งค่า → ผู้ใช้และสิทธิ์** (ปิดการใช้งานผู้ใช้)
- ONEBOOK ตรวจ `id_token` ครบทุกด้าน : ลายเซ็น RS256 จาก JWKS · `iss` · `aud` · `exp`/`iat` · `nonce`
  และปฏิเสธ `alg: none` — ทดสอบการโจมตี 8 แบบผ่านหมดแล้ว
