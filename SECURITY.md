# มาตรการความปลอดภัย — ONEBOOK

ระบบออกแบบตามหลัก **defense in depth** ป้องกัน 4 ชั้น: เครือข่าย → แอปพลิเคชัน → ฐานข้อมูล → การตรวจสอบย้อนหลัง

---

## ชั้นที่ 1 — เครือข่าย (ปิดกั้นการเข้าถึงจากภายนอก)

| มาตรการ | ที่อยู่ในโค้ด |
|---|---|
| IP allowlist ตรวจทุก request ก่อนถึงหน้าใด ๆ (รองรับ CIDR) | `middleware.ts` + `src/lib/ip-guard.ts` |
| ตรวจ `Origin` ของ request ที่เป็น mutation (ป้องกัน CSRF ข้ามโดเมน) | `middleware.ts` |
| Security headers: HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, COOP, Permissions-Policy | `next.config.mjs` |
| `robots: noindex, nofollow` และไม่มีหน้า public ใด ๆ นอกจาก `/login` | `src/app/layout.tsx` |

ตั้งค่า `ALLOWED_IPS` เช่น `203.0.113.10,203.0.113.0/24,10.0.0.0/8` ถ้าเว้นว่างจะไม่บังคับ (ไม่แนะนำสำหรับ production)

**แนะนำเพิ่มเติม:** วางแอปไว้หลัง VPN หรือใน LAN และตั้ง Network Restrictions ของ Supabase ให้รับเฉพาะ IP ของเซิร์ฟเวอร์แอป

---

## ชั้นที่ 2 — แอปพลิเคชัน

- เซสชันเก็บใน cookie แบบ `httpOnly` + `sameSite=lax` + `secure` (production)
- ทุกหน้าใน `(app)/` เรียก `requireSession()` / `requirePermission(resource, action)` ฝั่งเซิร์ฟเวอร์
- เมนูที่ผู้ใช้ไม่มีสิทธิ์จะไม่ถูก render (`buildNav` กรองด้วย `can()`)
- Server Actions ทุกตัวตรวจสิทธิ์ซ้ำก่อนเขียนข้อมูล ไม่เชื่อ input จาก client
- `SUPABASE_SERVICE_ROLE_KEY` อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น ไม่มี prefix `NEXT_PUBLIC_`

---

## ชั้นที่ 3 — ฐานข้อมูล (ด่านสุดท้ายที่ข้ามไม่ได้)

### Row Level Security
ทุกตารางเปิด `ENABLE` + `FORCE ROW LEVEL SECURITY` ผู้ใช้เห็นเฉพาะบริษัทที่ได้รับสิทธิ์ นโยบายแยก
`SELECT / INSERT / UPDATE / DELETE` และเรียก `app.has_perm(company_id, resource, action)` ทุกครั้ง
แม้เรียก REST API ของ Supabase โดยตรงด้วย anon key ก็ข้ามไม่ได้

### สิทธิ์ละเอียด
```
role_permissions(role_id, resource, actions[], field_mask[])
```
- `resource` รองรับ wildcard `*` และ prefix (`report` ครอบคลุม `report.pl`)
- `actions`: view, create, edit, delete, approve, post, void, export, unlock, override
- `field_mask`: ซ่อนฟิลด์เฉพาะบทบาท เช่น ฝ่ายขายไม่เห็น `purchase_price`
- ผู้ใช้บริษัทแม่ที่ตั้ง `can_view_subsidiaries` ได้เฉพาะ `view` และ `export` ของบริษัทลูกเท่านั้น

### Freeze / ปิดงวด
```
period_locks(company_id, locked_through, scope, reason, locked_by, ...)
```
Trigger `enforce_lock_documents` / `enforce_lock_journal` / `enforce_lock_payments` ทำงาน
**BEFORE INSERT / UPDATE / DELETE** ถ้าวันที่รายการ ≤ `locked_through` จะโยน `PERIOD_LOCKED` ทันที
ยกเว้นผู้ที่มีสิทธิ์ `period:unlock` เท่านั้น และการปลดล็อกทุกครั้งถูกบันทึกไว้

นอกจากนี้เอกสารที่อนุมัติแล้วจะแก้ยอดหรือเลขที่ไม่ได้ ต้องยกเลิก (`void_document`) ซึ่งจะ**กลับรายการ**
ในสมุดรายวันแทนการลบ เพื่อรักษาเส้นทางตรวจสอบ

### ความถูกต้องทางบัญชี
- Constraint trigger ตรวจยอด Dr = Cr ของทุกสมุดรายวัน (deferrable)
- `next_doc_number()` ออกเลขที่เอกสารแบบ atomic ด้วย `FOR UPDATE` ป้องกันเลขซ้ำ
- ตรวจ checksum เลขประจำตัวผู้เสียภาษี 13 หลักทั้งฝั่ง DB (regex) และฝั่ง UI (checksum จริง)

---

## ชั้นที่ 4 — Audit trail

ตาราง `audit_logs` เก็บทุก INSERT / UPDATE / DELETE ของ 14 ตารางสำคัญ พร้อม
`before_data` / `after_data` เป็น JSON, ผู้ใช้, อีเมล, และเวลา

```sql
revoke insert, update, delete on public.audit_logs from authenticated;
```
ผู้ใช้ทั่วไป **อ่านได้อย่างเดียว** แก้หรือลบไม่ได้ ดูได้ที่ **ตั้งค่า → ประวัติการใช้งาน** พร้อมสรุปฟิลด์ที่เปลี่ยนแปลง

---

## Checklist ก่อนขึ้น production

- [ ] ตั้ง `ALLOWED_IPS` และ `ENFORCE_IP_ALLOWLIST=true`
- [ ] ตั้ง `APP_ORIGIN` ให้ตรงโดเมนจริง
- [ ] เปิด MFA ทุกบัญชีใน Supabase Auth
- [ ] ปิดการสมัครสมาชิกเอง (Disable email signup) ใน Supabase Auth
- [ ] ตั้ง Network Restrictions ของ Supabase
- [ ] เปิด Point-in-Time Recovery / สำรองข้อมูลรายวัน
- [ ] ทบทวนสิทธิ์ทุกบทบาทที่หน้า ตั้งค่า → บทบาทและสิทธิ์
- [ ] ทดสอบด้วยบัญชีสิทธิ์ต่ำ ว่ามองไม่เห็นบริษัทอื่นและเมนูที่ไม่ได้รับสิทธิ์
