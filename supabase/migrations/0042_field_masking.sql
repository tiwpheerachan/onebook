-- =====================================================================
-- 0042 : บังคับใช้การซ่อนข้อมูลรายคอลัมน์จริง ๆ
--
--  ปัญหาที่เจอตอนตรวจ : ระบบมี field_mask ให้ตั้งค่ามาตั้งแต่ต้น
--  และตั้งไว้จริงแล้ว เช่นฝ่ายขายให้ซ่อน purchase_price กับ cogs_account_id
--  มีฟังก์ชัน masked_fields() ในฐานข้อมูลด้วย
--  แต่ไม่มีโค้ดที่ไหนเรียกใช้เลย ฝ่ายขายจึงยังเห็นราคาทุนอยู่
--
--  อันตรายกว่าการไม่มีฟีเจอร์ เพราะผู้ดูแลเข้าใจว่าซ่อนแล้ว
--
--  ทางที่เลือก : ทำเป็น view ที่ปิดค่าให้เป็น null ตามสิทธิ์
--    ตั้ง security_invoker เพื่อให้ RLS เดิมยังทำงานตามปกติ
--    และค่าที่ถูกซ่อนจะไม่ออกจากฐานข้อมูลเลย ไม่ใช่แค่ไม่แสดงบนหน้าจอ
--    ซ่อนบนหน้าจออย่างเดียวกันคนที่ยิง API ตรงไม่ได้
--
--  จุดที่ต้องระวังและแก้ไปด้วย : การเขียนทับด้วยค่าว่าง
--    ถ้าคนที่ถูกซ่อนราคาทุนเปิดหน้าแก้ไขสินค้าแล้วกดบันทึก
--    ค่าที่หน้าจอไม่เห็นจะถูกส่งกลับเป็นว่างและทับของเดิมหาย
--    จึงมีฟังก์ชันให้ฝั่งแอปถามได้ว่าต้องไม่แตะคอลัมน์ไหนบ้าง
-- =====================================================================

-- ถามว่าคอลัมน์นี้ถูกซ่อนสำหรับผู้ใช้ปัจจุบันหรือไม่
create or replace function app.field_masked(p_company uuid, p_resource text, p_field text)
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select p_field = any(public.masked_fields(p_company, p_resource));
$$;

grant execute on function app.field_masked(uuid, text, text) to authenticated;

-- ------------------------------------------------------------------------
-- สินค้า : ปิดราคาทุนและบัญชีต้นทุนตามสิทธิ์
-- ------------------------------------------------------------------------
drop view if exists public.products_masked;
create view public.products_masked
with (security_invoker = true)
as
select
  p.id, p.company_id, p.sku, p.barcode, p.name, p.name_en, p.name_zh,
  p.kind, p.unit, p.category, p.group_id, p.weight_kg,
  p.sale_price,
  case when app.field_masked(p.company_id, 'products', 'purchase_price')
       then null else p.purchase_price end as purchase_price,
  p.vat_treatment, p.track_inventory, p.reorder_point,
  p.income_account_id, p.expense_account_id, p.inventory_account_id,
  case when app.field_masked(p.company_id, 'products', 'cogs_account_id')
       then null else p.cogs_account_id end as cogs_account_id,
  p.is_active, p.created_at, p.updated_at
from public.products p;

grant select on public.products_masked to authenticated;

-- ------------------------------------------------------------------------
-- เอกสาร : ปิดบันทึกภายในตามสิทธิ์
-- ------------------------------------------------------------------------
drop view if exists public.documents_masked;
create view public.documents_masked
with (security_invoker = true)
as
select
  d.id, d.company_id, d.kind, d.doc_number, d.doc_date, d.due_date,
  d.contact_id, d.contact_snapshot, d.reference, d.ref_document_id, d.dimension_id,
  d.currency, d.exchange_rate, d.subtotal, d.discount_amount,
  d.vat_base, d.vat_amount, d.wht_amount, d.grand_total, d.net_payable, d.paid_amount,
  d.status, d.notes,
  case when app.field_masked(d.company_id, 'documents', 'internal_note')
       then null else d.internal_note end as internal_note,
  d.journal_entry_id, d.warehouse_id,
  d.vat_tax_month, d.vat_deferred, d.vat_note,
  d.created_by, d.approved_by, d.approved_at,
  d.voided_by, d.voided_at, d.void_reason,
  d.created_at, d.updated_at
from public.documents d;

grant select on public.documents_masked to authenticated;

-- ------------------------------------------------------------------------
-- รายการคอลัมน์ที่ห้ามเขียนทับ ให้ฝั่งแอปถามก่อนบันทึก
--
-- ผู้ใช้ที่มองไม่เห็นค่า ต้องไม่มีสิทธิ์ทำให้ค่านั้นหายไปด้วย
-- ------------------------------------------------------------------------
create or replace function public.rpt_masked_fields(p_company uuid, p_resource text)
returns text[]
language sql
stable
security definer
set search_path = public, app
as $$
  select public.masked_fields(p_company, p_resource);
$$;

grant execute on function public.rpt_masked_fields(uuid, text) to authenticated;

comment on view public.products_masked is
  'สินค้าที่ปิดคอลัมน์ตาม field_mask ของบทบาท — อ่านผ่าน view นี้แทนตารางตรงเมื่อจะแสดงผล';
