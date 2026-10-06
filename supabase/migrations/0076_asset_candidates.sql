-- ============================================================================
-- ONEBOOK 0076 : รายการบิลที่ "เป็นทรัพย์สิน" สำหรับให้ระบบทรัพย์สิน (Asset) ดึงไปขึ้นทะเบียน
--
--   rpt_asset_candidates()  คืนบรรทัดของบิล/ค่าใช้จ่ายที่ลงบัญชีแล้ว และบันทึกเข้าบัญชี
--                           สินทรัพย์ไม่หมุนเวียน (รหัส 12xx) — คือ "ต้นทุนจริงหลังลงบัญชี"
--                           ใช้ที่ endpoint /api/integrations/asset-candidates (token auth)
--   หมายเหตุ master data : คืน "รหัส/ชื่อ" ของบริษัท/บัญชี/ผู้ขาย มาด้วย เพื่อให้ฝั่ง Asset
--                           จับคู่กับ master ของตัวเองได้ (ONEBOOK เป็นเจ้าของผังบัญชี/คู่ค้า)
-- ============================================================================

create or replace function public.rpt_asset_candidates(p_company uuid default null)
returns table (
  line_id      uuid,
  document_id  uuid,
  doc_number   text,
  doc_date     date,
  kind         text,
  status       text,
  company_id   uuid,
  company_name text,
  vendor_name  text,
  description  text,
  quantity     numeric,
  unit_price   numeric,
  amount       numeric,
  account_code text,
  account_name text
) language sql stable security definer set search_path = public, app as $$
  select dl.id, dco.id, dco.doc_number, dco.doc_date, dco.kind::text, dco.status::text,
         dco.company_id, co.name_th, ct.name,
         dl.description, dl.quantity, dl.unit_price, dl.line_amount,
         ac.code, ac.name_th
  from public.document_lines dl
  join public.documents dco on dco.id = dl.document_id
  join public.accounts ac on ac.id = dl.account_id
  join public.companies co on co.id = dco.company_id
  left join public.contacts ct on ct.id = dco.contact_id
  where dco.kind in ('bill','expense')
    and dco.status not in ('draft','awaiting_approval','void')
    and ac.is_header = false
    and ac.code like '12%'                 -- บัญชีสินทรัพย์ไม่หมุนเวียน (ที่ดิน/อาคาร/อุปกรณ์/ยานพาหนะ/ไม่มีตัวตน)
    and (p_company is null or dco.company_id = p_company)
  order by dco.doc_date desc, dco.doc_number;
$$;

grant execute on function public.rpt_asset_candidates(uuid) to authenticated, service_role;
