-- =====================================================================
-- 0045 : สกุลเงิน — ทำให้ข้อสมมติที่ซ่อนอยู่กลายเป็นเรื่องที่มองเห็นและกันพลาดได้
--
--  สิ่งที่พบตอนตรวจ : ตาราง companies มี base_currency และ documents มี currency
--  กับ exchange_rate มาตั้งแต่ 0002/0003 แต่ไม่มีที่ไหนในระบบอ่านสองช่องนี้เลย
--    - เครื่องลงบัญชีไม่แปลงค่า ลงยอดตามหน้าเอกสารตรง ๆ
--    - รายงานทุกตัวบวกยอดรวมกันโดยไม่สนใจสกุลเงิน
--    - ภ.พ.30 และรายงานภาษีก็เช่นกัน
--    - หน้าจอไม่เคยแสดงสกุลเงิน และไม่เคยให้เลือก
--
--  แปลว่าระบบเป็นสกุลเงินเดียวโดยพฤตินัย ถ้ามีเอกสาร 1,000 USD หลุดเข้ามา
--  ระบบจะนับเป็น 1,000 บาทเงียบ ๆ ตัวเลขผิดโดยไม่มีอะไรฟ้อง
--
--  ทางที่เลือก : ยังไม่ทำหลายสกุลเงินเต็มรูปแบบ (ต้องมีผลต่างอัตราแลกเปลี่ยน
--  บัญชีกำไรขาดทุนจากอัตราแลกเปลี่ยน และการตีราคาใหม่ตอนปิดงวด — คนละขนาดกัน)
--  แต่เปลี่ยน "ผิดเงียบ ๆ" ให้เป็น "ฟ้องดัง ๆ" และเปิดสกุลเงินให้หน้าจอเห็น
-- =====================================================================

comment on column public.companies.base_currency is
  'สกุลเงินหลักของบริษัท — ระบบยังเป็นสกุลเงินเดียว เอกสารทุกใบต้องเป็นสกุลนี้';
comment on column public.documents.currency is
  'สกุลเงินของเอกสาร — ต้องตรงกับ base_currency ของบริษัทเสมอจนกว่าจะรองรับหลายสกุลเงินจริง';
comment on column public.documents.exchange_rate is
  'อัตราแลกเปลี่ยน — ยังไม่ถูกใช้ที่ใดในระบบ ต้องเป็น 1 จนกว่าจะรองรับหลายสกุลเงินจริง';

-- ------------------------------------------------------------------------
-- ส่งสกุลเงินหลักของบริษัทไปให้ฝั่งแอป
--
-- ประกาศทับทั้งก้อนโดยคงตรรกะของ 0012 ไว้ทุกบรรทัด เพิ่มแค่ base_currency
-- ในก้อน json ของบริษัท เพราะแก้เฉพาะบางบรรทัดของฟังก์ชันเดิมไม่ได้
-- ------------------------------------------------------------------------
create or replace function public.rpt_session_context(p_company uuid default null)
returns json
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_uid       uuid := auth.uid();
  v_profile   record;
  v_companies json;
  v_company   uuid;
  v_perms     json;
  v_lock      date;
begin
  if v_uid is null then
    return null;
  end if;

  select p.id, p.email, p.full_name, p.is_group_admin, p.is_active
    into v_profile
  from public.profiles p
  where p.id = v_uid;

  -- ผู้ใช้ที่ถูกปิดการใช้งานถือว่าไม่มีเซสชัน
  if v_profile.id is not null and v_profile.is_active is false then
    return null;
  end if;

  -- บริษัทที่เข้าถึงได้ : ใช้ตรรกะเดียวกับ RLS ของตาราง companies (app.can_access_company)
  select coalesce(
    json_agg(
      json_build_object(
        'id', c.id, 'code', c.code,
        'name_th', c.name_th, 'name_en', c.name_en, 'name_zh', c.name_zh,
        'parent_id', c.parent_id, 'tax_id', c.tax_id, 'vat_rate', c.vat_rate,
        'base_currency', c.base_currency
      )
      order by c.parent_id nulls first, c.code
    ), '[]'::json)
  into v_companies
  from public.companies c
  where c.is_active
    and c.id in (select company_id from app.accessible_company_ids(v_uid));

  if v_companies is null or json_array_length(v_companies) = 0 then
    return null;
  end if;

  -- บริษัทที่เลือกไว้ (จากคุกกี้) ถ้าไม่มีสิทธิ์หรือไม่ได้ส่งมา ให้ใช้บริษัทแรกของรายการ
  select c.id into v_company
  from public.companies c
  where c.id = p_company
    and c.is_active
    and c.id in (select company_id from app.accessible_company_ids(v_uid));

  if v_company is null then
    select c.id into v_company
    from public.companies c
    where c.is_active
      and c.id in (select company_id from app.accessible_company_ids(v_uid))
    order by c.parent_id nulls first, c.code
    limit 1;
  end if;

  -- สิทธิ์ของผู้ใช้ในบริษัทที่เลือก
  select coalesce(
    json_agg(json_build_object('resource', rp.resource, 'actions', rp.actions)), '[]'::json)
  into v_perms
  from public.user_companies uc
  join public.role_permissions rp on rp.role_id = uc.role_id
  where uc.user_id = v_uid
    and uc.company_id = v_company
    and uc.is_active;

  -- งวดที่ล็อกล่าสุดของบริษัทที่เลือก
  select pl.locked_through into v_lock
  from public.period_locks pl
  where pl.company_id = v_company
    and pl.is_active
    and pl.released_at is null
  order by pl.locked_through desc
  limit 1;

  return json_build_object(
    'user_id', v_uid,
    'email', coalesce(v_profile.email, ''),
    'full_name', coalesce(v_profile.full_name, v_profile.email, ''),
    'is_group_admin', coalesce(v_profile.is_group_admin, false),
    'companies', v_companies,
    'company_id', v_company,
    'permissions', v_perms,
    'locked_through', v_lock
  );
end;
$$;

grant execute on function public.rpt_session_context(uuid) to authenticated;

-- ------------------------------------------------------------------------
-- กันเอกสารต่างสกุลเงินหลุดเข้ามาทางไหนก็ตาม
--
-- หน้าจอไม่มีช่องให้เลือกสกุลเงินอยู่แล้ว แต่ยังมีทางเข้าอื่น
-- (นำเข้าไฟล์ อ่านเอกสารด้วย AI หรือยิง API ตรง) ที่ใส่ค่าอื่นได้
-- ปล่อยผ่านแล้วตัวเลขในงบจะผิดโดยไม่มีร่องรอย จึงต้องหยุดตั้งแต่ตรงนี้
--
-- ตรวจเฉพาะตอนที่ค่าเกี่ยวข้องถูกแตะ เอกสารเก่าที่ค้างค่าแปลก ๆ ไว้จะไม่ถูกปลุก
-- ขึ้นมาทำให้บันทึกอย่างอื่นพังตามไปด้วย
-- ------------------------------------------------------------------------
create or replace function app.document_currency_guard()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare v_base char(3);
begin
  select base_currency into v_base from public.companies where id = new.company_id;

  if new.currency is distinct from v_base then
    raise exception
      'CURRENCY_MISMATCH: เอกสารเป็นสกุล % แต่บริษัทใช้ % — ระบบยังไม่รองรับหลายสกุลเงิน',
      new.currency, v_base;
  end if;

  if new.exchange_rate is distinct from 1 then
    raise exception
      'FX_NOT_SUPPORTED: ยังไม่รองรับอัตราแลกเปลี่ยน ต้องเป็น 1 เท่านั้น';
  end if;

  return new;
end $$;

drop trigger if exists trg_document_currency on public.documents;
create trigger trg_document_currency
  before insert or update of currency, exchange_rate, company_id on public.documents
  for each row execute function app.document_currency_guard();

comment on function app.document_currency_guard is
  'กันเอกสารต่างสกุลเงิน — ระบบยังไม่แปลงค่า ปล่อยผ่านแล้วงบจะผิดโดยไม่มีร่องรอย';
