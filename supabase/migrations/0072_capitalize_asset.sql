-- ============================================================================
-- ONEBOOK 0072 : รับเอกสารซื้อเป็นทรัพย์สินถาวร (capitalize)
--
--   เดิมทะเบียนสินทรัพย์ (0015) มีช่อง document_id/supplier_id ไว้โยงใบซื้ออยู่แล้ว
--   แต่ไม่มีทางสร้างสินทรัพย์จากเอกสารซื้อโดยตรง ต้องคีย์มือซ้ำทั้งหมด
--
--   capitalize_asset()  สร้างแถว fixed_assets จากเอกสารซื้อ โยง document_id กลับ
--                       อนุญาตเฉพาะเอกสารฝั่งซื้อที่ "อนุมัติ/ลงบัญชีแล้ว" เท่านั้น
--                       (บิล/ค่าใช้จ่ายที่อนุมัติ = ผ่าน 3-way match + ลง GL แล้ว)
--                       จึงเป็นด่านคุมว่าต้องมี PO/รับของ/ตั้งหนี้จริงก่อนตั้งทรัพย์สิน
--
--   สิทธิ์ : accounting.assets create (เหมือนการสร้างสินทรัพย์ปกติ)
-- ============================================================================

create or replace function public.capitalize_asset(p_document uuid, p_payload jsonb)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare
  v_doc  public.documents%rowtype;
  v_code text;
  v_id   uuid;
begin
  select * into v_doc from public.documents where id = p_document;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;

  if not app.has_perm(v_doc.company_id,'accounting.assets','create') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์ตั้งทรัพย์สิน';
  end if;

  -- ตั้งเป็นทรัพย์สินได้เฉพาะเอกสารฝั่งซื้อ และต้องผ่านการอนุมัติ/ลงบัญชีแล้ว
  -- สถานะ draft/awaiting_approval/void = ยังไม่ผ่านกระบวนการจัดซื้อจริง จึงยังตั้งไม่ได้
  if v_doc.kind not in ('bill','goods_receipt','expense') then
    raise exception 'NOT_ASSET_DOC: เอกสารนี้ตั้งเป็นทรัพย์สินไม่ได้';
  end if;
  if v_doc.status in ('draft','awaiting_approval','void') then
    raise exception 'DOC_NOT_READY: ต้องอนุมัติ/ลงบัญชีเอกสารก่อนจึงจะรับเป็นทรัพย์สินได้';
  end if;

  if coalesce((p_payload->>'cost')::numeric, 0) <= 0 then
    raise exception 'COST_REQUIRED';
  end if;
  if nullif(p_payload->>'asset_account_id','') is null
     or nullif(p_payload->>'accum_dep_account_id','') is null then
    raise exception 'ACCOUNTS_REQUIRED';
  end if;

  -- ไม่ระบุรหัสมา ให้สร้างให้อัตโนมัติแบบ FA-<ปี>-<ลำดับในบริษัท>
  v_code := nullif(trim(p_payload->>'code'),'');
  if v_code is null then
    select 'FA-' || to_char(coalesce(v_doc.doc_date, current_date),'YYYY') || '-'
           || lpad((count(*) + 1)::text, 4, '0')
      into v_code
      from public.fixed_assets where company_id = v_doc.company_id;
  end if;

  insert into public.fixed_assets (
    company_id, code, name, name_en, category, serial_no, location,
    supplier_id, document_id,
    acquired_date, in_service_date, cost, salvage_value, useful_life_months,
    method, declining_rate, opening_accum_dep,
    asset_account_id, accum_dep_account_id, expense_account_id,
    status, note, created_by
  ) values (
    v_doc.company_id, v_code,
    coalesce(nullif(trim(p_payload->>'name'),''), v_doc.doc_number),
    nullif(p_payload->>'name_en',''),
    nullif(p_payload->>'category',''),
    nullif(p_payload->>'serial_no',''),
    nullif(p_payload->>'location',''),
    v_doc.contact_id, v_doc.id,
    coalesce(nullif(p_payload->>'acquired_date','')::date, v_doc.doc_date),
    coalesce(nullif(p_payload->>'in_service_date','')::date, v_doc.doc_date),
    (p_payload->>'cost')::numeric,
    coalesce(nullif(p_payload->>'salvage_value','')::numeric, 0),
    coalesce(nullif(p_payload->>'useful_life_months','')::int, 60),
    coalesce(nullif(p_payload->>'method',''),'straight_line')::depreciation_method,
    coalesce(nullif(p_payload->>'declining_rate','')::numeric, 0),
    coalesce(nullif(p_payload->>'opening_accum_dep','')::numeric, 0),
    (p_payload->>'asset_account_id')::uuid,
    (p_payload->>'accum_dep_account_id')::uuid,
    nullif(p_payload->>'expense_account_id','')::uuid,
    'active',
    nullif(p_payload->>'note',''),
    auth.uid()
  ) returning id into v_id;

  return v_id;
end $$;

grant execute on function public.capitalize_asset(uuid, jsonb) to authenticated;
