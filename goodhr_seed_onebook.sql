-- ════════════════════════════════════════════════════════════════════
-- Seed แอป ONEBOOK เข้า GoodHR SSO — ฉบับยืนยันแล้วจากทีม ONEBOOK
--
-- ยืนยันแล้วว่าถูกต้อง (ตรวจจากโค้ดจริงของ ONEBOOK)
--   ✓ client_id          ตรง
--   ✓ client_secret_hash ตรง — sha256 ของ secret ที่ส่งมา ตรงกับที่อยู่ใน SQL
--   ✓ callback path      /api/auth/callback/goodhr  ← เดาถูก ไม่ต้องแก้
--   ✓ allowed_scopes     ตรงกับที่ ONEBOOK ขอจริง (openid profile email employee)
--   ✓ is_confidential    ถูก — ONEBOOK แลก token ฝั่ง server ด้วย client_secret_post
--   ✓ require_allowlist  ถูก — ONEBOOK ก็ default-deny เหมือนกัน
--
-- แก้จากต้นฉบับ 2 จุด
--   1. เพิ่ม redirect URI ของเครื่องพัฒนา (พอร์ต 3100 เพราะ 3000 เป็นของ GoodHR)
--   2. เพิ่ม post-logout URI ของเครื่องพัฒนาให้คู่กัน
-- ════════════════════════════════════════════════════════════════════

INSERT INTO oauth_clients (
  client_id, client_secret_hash, name, description,
  redirect_uris, post_logout_redirect_uris,
  allowed_scopes, is_confidential, skip_consent, is_active, require_allowlist,
  access_token_ttl, refresh_token_ttl
) VALUES (
  'ghr_onebookbb2ced',
  '8fa2602d43adbfc169a45d98d1bc25d42cbf343df473e65734c625d3bdbca6d0',  -- sha256(secret) — ตรวจแล้วตรง
  'ONEBOOK',
  'ระบบบัญชี/การเงิน ONEBOOK — ล็อกอินด้วยบัญชี GoodHR',
  ARRAY[
    'https://onebook-gxyz.onrender.com/api/auth/callback/goodhr',  -- production
    'http://localhost:3100/api/auth/callback/goodhr'               -- เครื่องพัฒนา (ถอดออกได้หลังทดสอบเสร็จ)
  ],
  ARRAY[
    'https://onebook-gxyz.onrender.com',
    'http://localhost:3100'
  ],
  ARRAY['openid','profile','email','employee'],
  TRUE,   -- is_confidential
  TRUE,   -- skip_consent
  TRUE,   -- is_active
  TRUE,   -- require_allowlist ← default-deny
  3600,   -- access_token 1 ชม.
  2592000 -- refresh_token 30 วัน
)
ON CONFLICT (client_id) DO UPDATE SET
  client_secret_hash = EXCLUDED.client_secret_hash,
  name               = EXCLUDED.name,
  description        = EXCLUDED.description,
  redirect_uris      = EXCLUDED.redirect_uris,
  post_logout_redirect_uris = EXCLUDED.post_logout_redirect_uris,
  allowed_scopes     = EXCLUDED.allowed_scopes,
  is_confidential    = EXCLUDED.is_confidential,
  skip_consent       = EXCLUDED.skip_consent,
  is_active          = EXCLUDED.is_active,
  require_allowlist  = EXCLUDED.require_allowlist,
  updated_at         = now();

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════
-- หมายเหตุสำคัญ : มี "ประตู 2 ชั้น" ต้องเปิดทั้งคู่
--
--   ชั้นที่ 1 — GoodHR   : oauth_client_users (หรือหน้า /admin/sso แท็บ "ใครใช้ได้บ้าง")
--                          ไม่มีชื่อ = ล็อกอินไม่ผ่านตั้งแต่ฝั่ง GoodHR
--   ชั้นที่ 2 — ONEBOOK  : ตั้งค่า → ผู้ใช้และสิทธิ์ → "อนุญาตพนักงาน GoodHR"
--                          ไม่มีชื่อ = ล็อกอินผ่าน GoodHR แต่ ONEBOOK ปฏิเสธ
--
-- ตั้งใจให้เป็นแบบนี้ HR คุมว่า "ใครเข้าแอปได้" ส่วนฝ่ายบัญชีคุมว่า
-- "เข้าได้บริษัทไหน เห็นเมนูอะไร แก้อะไรได้" ซึ่ง GoodHR ไม่รู้
--
-- ⚠️ app_role ใน oauth_client_users ตอนนี้ ONEBOOK "ไม่ได้ใช้ให้สิทธิ์"
--    เพราะตั้ง GOODHR_TRUST_APP_ROLE=false ตามที่ตกลงกัน
--    ค่านี้จะถูกเก็บไว้ใน profiles.goodhr_app_role ให้ผู้ดูแล ONEBOOK
--    ดูประกอบตอนอนุมัติเท่านั้น ใส่มาได้ ไม่เสียหาย
-- ════════════════════════════════════════════════════════════════════

-- ตัวอย่างเพิ่มคนเข้า allowlist ของ GoodHR
-- INSERT INTO oauth_client_users (client_id, employee_id, app_role)
-- SELECT 'ghr_onebookbb2ced', id, 'owner'
--   FROM employees WHERE employee_code = '68000001'
-- ON CONFLICT (client_id, employee_id) DO UPDATE SET app_role = EXCLUDED.app_role;
