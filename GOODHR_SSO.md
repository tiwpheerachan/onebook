# เข้าสู่ระบบด้วย GoodHR — คู่มือตั้งค่า

ตรวจการตั้งค่าได้ตลอดด้วย

```bash
npm run check:goodhr
```

หรือเปิด `https://<โดเมน>/api/health` เพื่อดูสถานะของเครื่องที่ deploy แล้ว
(`sso.ready = true` แปลว่าปุ่ม GoodHR จะโผล่)

---

## ค่าที่ต้องกรอกใน Render → Environment

```
GOODHR_ISSUER        = https://goodhr.shd-technology.co.th
OAUTH_CLIENT_ID      = ghr_onebookbb2ced
OAUTH_CLIENT_SECRET  = <ค่าลับ ดูใน ONEBOOK_SSO_CREDENTIALS.txt>
OAUTH_REDIRECT_URI   = https://onebook-gxyz.onrender.com/api/auth/callback/goodhr
GOODHR_TRUST_APP_ROLE = false
ALLOW_PASSWORD_LOGIN  = true
```

`APP_ORIGIN` ไม่ต้องกรอก — `render.yaml` ตั้งให้ชี้ URL ของตัวเองอัตโนมัติ

กรอกเสร็จต้อง **Manual Deploy** ไม่ใช่แค่ Restart

ตรวจแล้วว่าฝั่ง GoodHR production พร้อมครบ

```
✓ discovery อ่านได้      https://goodhr.shd-technology.co.th
✓ issuer ตรงกัน
✓ JWKS มีกุญแจ RS256     kid=7e0605361df6c0191dcebd4346164bae
✓ redirect_uri ผ่าน      https://onebook-gxyz.onrender.com/api/auth/callback/goodhr
```

---

## ค่าสำหรับพัฒนาบนเครื่อง (`.env.local`)

```
GOODHR_ISSUER        = http://localhost:3000     # GoodHR รันอยู่พอร์ตนี้
OAUTH_REDIRECT_URI   = http://localhost:3100/api/auth/callback/goodhr
APP_ORIGIN           = http://localhost:3100
```

> **พอร์ต 3000 เป็นของ GoodHR** ONEBOOK จึงต้องรันพอร์ตอื่น
> ```bash
> npm run dev -- -p 3100
> ```
> `APP_ORIGIN` ต้องตรงกับพอร์ตที่รันจริง ไม่งั้น middleware จะบล็อก POST ทุกอันด้วย 403

⛔ ก่อนทดสอบบนเครื่องต้องไปเพิ่ม redirect URI ของ dev ที่ GoodHR `/admin/sso` ก่อน
(ตอนนี้ลงทะเบียนไว้เฉพาะ URL production)

```
http://localhost:3100/api/auth/callback/goodhr
```

---

## ประตูมี 2 ชั้น — ต้องเปิดทั้งคู่

`require_allowlist = TRUE` ทำให้พนักงานต้องมีชื่อทั้งสองที่

1. **GoodHR** `/admin/sso` → แท็บ "ใครใช้ได้บ้าง"
   ไม่มีชื่อ = ไม่ผ่านตั้งแต่ฝั่ง GoodHR
2. **ONEBOOK** ตั้งค่า → ผู้ใช้และสิทธิ์ → "อนุญาตพนักงาน GoodHR"
   ไม่มีชื่อ = GoodHR ปล่อยผ่านแต่ ONEBOOK ปฏิเสธ

ตั้งใจให้เป็นแบบนี้ — HR คุมว่าใครเข้าแอปได้ ฝ่ายบัญชีคุมว่าเข้าได้บริษัทไหน
เห็นเมนูอะไร แก้อะไรได้ ซึ่ง GoodHR ไม่รู้

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

## เมื่อล็อกอินไม่ผ่าน

| อาการ | สาเหตุ |
|---|---|
| ไม่เห็นปุ่ม GoodHR เลย | env ไม่ครบ 3 ตัว — เช็คที่ `/api/health` → `sso.ready` |
| `redirect_uri ไม่ถูกต้อง` | URL ไม่ตรงกับที่ลงทะเบียน — เทียบกับ `sso.redirect_uri` ใน `/api/health` |
| ล็อกอินแล้วเด้งกลับพร้อม `no_access` | ยังไม่ได้อนุญาตใน ONEBOOK (ตั้งค่า → ผู้ใช้และสิทธิ์) |
| GoodHR ปฏิเสธก่อนถึง ONEBOOK | ยังไม่ได้เพิ่มชื่อใน `/admin/sso` แท็บ "ใครใช้ได้บ้าง" |
| ล็อกอินได้แต่บันทึกอะไรไม่ได้ (403) | `APP_ORIGIN` ไม่ตรงกับโดเมนจริง |

---

## ความปลอดภัย

- `OAUTH_CLIENT_SECRET` อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น ห้ามขึ้นต้นด้วย `NEXT_PUBLIC_` ห้าม commit
  (repo นี้เป็น public — `.env.local` และ `goodhr_seed_onebook.sql` อยู่ใน `.gitignore` แล้ว)
- ถ้าหลุด → GoodHR `/admin/sso` → แอป ONEBOOK → "สร้าง secret ใหม่" ของเก่าตายทันที
  แล้วมาแก้ค่าใน Render และ `.env.local`
- ตัดสิทธิ์รายคนได้ 2 ทาง — GoodHR `/admin/sso` (revoke token ทันที)
  หรือ ONEBOOK ตั้งค่า → ผู้ใช้และสิทธิ์ (ปิดการใช้งานผู้ใช้)
- ONEBOOK ตรวจ `id_token` ครบทุกด้าน : ลายเซ็น RS256 จาก JWKS · `iss` · `aud` · `exp`/`iat` · `nonce`
  และปฏิเสธ `alg: none` — ทดสอบการโจมตี 8 แบบผ่านหมดแล้ว
