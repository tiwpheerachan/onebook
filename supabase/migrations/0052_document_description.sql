-- =====================================================================
-- 0052 : คำอธิบายรายการบันทึกบัญชีบนเอกสาร
--
--  ปัญหา : เวลาลงบัญชี เครื่องลงบัญชีตั้งคำอธิบายให้เองเป็น
--  "invoice DEMO-INV-3-0" ซึ่งอ่านแล้วไม่รู้เรื่องว่าเป็นรายการอะไร
--  เปิดสมุดรายวันหรือบัญชีแยกประเภทย้อนหลังก็ต้องไล่เปิดเอกสารทีละใบ
--
--  เอกสารมีช่อง notes อยู่แล้ว แต่เป็นหมายเหตุภายในที่ไม่ได้ลงบัญชี
--  คนละหน้าที่กับคำอธิบายที่ต้องปรากฏในสมุดรายวัน จึงแยกช่องใหม่
--
--  ทำไมไม่ตั้ง not null ที่ฐานข้อมูล
--    เอกสารเข้าระบบได้หลายทาง ทั้งหน้าจอ นำเข้าไฟล์ อ่านด้วย AI และแปลงต่อ
--    ถ้าบังคับที่ฐานข้อมูล ทางที่ยังไม่ได้แก้จะพังทันทีตอนรัน migration
--    จึงบังคับที่หน้าบันทึกซึ่งเป็นทางที่คนกรอกจริง แล้วมีค่าสำรองให้เสมอ
-- =====================================================================

alter table public.documents
  add column if not exists description text;

comment on column public.documents.description is
  'คำอธิบายรายการบันทึกบัญชี — ใช้เป็นคำอธิบายในสมุดรายวัน ไม่ใช่หมายเหตุภายใน (notes)';

-- ------------------------------------------------------------------------
-- เติมย้อนหลังให้เอกสารเดิม
--
-- ใช้ชื่อชนิดเอกสารกับคู่ค้า ซึ่งอ่านรู้เรื่องกว่าเลขที่เอกสารเปล่า ๆ
-- ทำครั้งเดียวเฉพาะแถวที่ยังว่าง จะไม่ทับของที่คนกรอกเองภายหลัง
-- ------------------------------------------------------------------------
update public.documents d
   set description = trim(
     case d.kind::text
       when 'quotation'            then 'ใบเสนอราคา'
       when 'sales_order'          then 'ใบสั่งขาย'
       when 'billing_note'         then 'ใบวางบิล'
       when 'invoice'              then 'ขายสินค้า/บริการ'
       when 'tax_invoice'          then 'ขายสินค้า/บริการ'
       when 'receipt'              then 'รับชำระเงิน'
       when 'credit_note'          then 'ลดหนี้/รับคืนสินค้า'
       when 'debit_note'           then 'เพิ่มหนี้'
       when 'deposit_receipt'      then 'รับเงินมัดจำ'
       when 'purchase_request'     then 'ใบขอซื้อ'
       when 'purchase_order'       then 'ใบสั่งซื้อ'
       when 'goods_receipt'        then 'รับสินค้า'
       when 'bill'                 then 'ซื้อสินค้า/บริการ'
       when 'expense'              then 'ค่าใช้จ่าย'
       when 'purchase_credit_note' then 'ส่งคืนสินค้า/ลดหนี้ผู้ขาย'
       when 'purchase_debit_note'  then 'เพิ่มหนี้ผู้ขาย'
       when 'deposit_payment'      then 'จ่ายเงินมัดจำ'
       else d.kind::text
     end
     || coalesce(' - ' || nullif(coalesce(c.name, d.contact_snapshot->>'name'), ''), ''))
  from public.contacts c
 where c.id = d.contact_id
   and (d.description is null or btrim(d.description) = '');

-- เอกสารที่ไม่มีคู่ค้าผูกไว้ ก็ยังต้องมีคำอธิบาย
update public.documents d
   set description = d.kind::text
 where d.description is null or btrim(d.description) = '';

-- ------------------------------------------------------------------------
-- ให้สมุดรายวันใช้คำอธิบายจากเอกสาร
--
-- แก้เฉพาะบรรทัดที่สร้าง journal_entries ในเครื่องลงบัญชี
-- coalesce ไว้เพื่อให้เอกสารที่ไม่มีคำอธิบายยังได้ข้อความเดิมเป๊ะ ๆ
-- คัดนิยามจริงจากฐานข้อมูลมาแก้จุดเดียว ไม่ได้พิมพ์ใหม่จากความจำ
-- ------------------------------------------------------------------------
do $$
declare v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'post_document';

  if v_src is null then
    raise exception 'post_document ไม่พบ — ต้องรัน 0009 ถึง 0051 ให้ครบก่อน';
  end if;

  if position('d.kind::text || '' '' || d.doc_number' in v_src) = 0 then
    raise exception 'ไม่พบบรรทัดคำอธิบายสมุดรายวันใน post_document — โครงสร้างเปลี่ยนไป ต้องตรวจด้วยมือ';
  end if;

  v_src := replace(
    v_src,
    'd.kind::text || '' '' || d.doc_number',
    'coalesce(nullif(btrim(d.description), ''''), d.kind::text || '' '' || d.doc_number)');

  execute v_src;
end $$;

-- ------------------------------------------------------------------------
-- ให้คลังเอกสารและรายการเอกสารส่งคำอธิบายกลับมาด้วย
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
  d.deposit_applied,
  d.status, d.description, d.notes,
  case when app.field_masked(d.company_id, 'documents', 'internal_note')
       then null else d.internal_note end as internal_note,
  d.journal_entry_id, d.warehouse_id,
  d.vat_tax_month, d.vat_deferred, d.vat_note,
  d.tax_invoice_number, d.tax_invoice_date,
  d.created_by, d.approved_by, d.approved_at,
  d.voided_by, d.voided_at, d.void_reason,
  d.created_at, d.updated_at
from public.documents d;

grant select on public.documents_masked to authenticated;
