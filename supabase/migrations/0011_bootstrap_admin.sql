-- ============================================================================
-- ONEBOOK 0011 : ตั้งค่าเริ่มต้นครั้งแรก
-- วิธีใช้ : 1) สร้างผู้ใช้แรกใน Supabase Studio > Authentication > Add user
--          2) แก้อีเมลด้านล่างให้ตรง แล้วรันไฟล์นี้ใน SQL Editor
-- ============================================================================
do $$
declare
  v_admin_email text := 'the.dataverse@shd-technology.co.th';   -- << แก้เป็นอีเมลผู้ดูแลของคุณ
  v_uid uuid;
  v_parent uuid;
  v_role uuid;
begin
  select id into v_uid from auth.users where email = v_admin_email;
  if v_uid is null then
    raise notice 'ยังไม่พบผู้ใช้ % กรุณาสร้างผู้ใช้ใน Authentication ก่อน', v_admin_email;
    return;
  end if;

  insert into public.profiles(id, email, full_name, is_group_admin)
  values (v_uid, v_admin_email, 'ผู้ดูแลระบบกลุ่มบริษัท', true)
  on conflict (id) do update set is_group_admin = true, is_active = true;

  -- บริษัทแม่
  if not exists (select 1 from public.companies where code = 'HQ') then
    insert into public.companies(code, name_th, name_en, name_zh, tax_id, vat_registered)
    values ('HQ','บริษัท โฮลดิ้ง (สำนักงานใหญ่) จำกัด','Group Holding Co., Ltd.','集团控股有限公司', null, true)
    returning id into v_parent;
    perform app.seed_chart_of_accounts(v_parent);
    perform app.seed_default_roles(v_parent);
    perform app.seed_doc_sequences(v_parent);
    insert into public.financial_channels(company_id, code, name, kind, account_id)
    select v_parent,'CASH','เงินสด','cash', a.id from public.accounts a where a.company_id = v_parent and a.code='1110';
  else
    select id into v_parent from public.companies where code = 'HQ';
  end if;

  select id into v_role from public.roles where company_id = v_parent and code = 'owner';
  insert into public.user_companies(user_id, company_id, role_id, can_view_subsidiaries, is_default)
  values (v_uid, v_parent, v_role, true, true)
  on conflict (user_id, company_id) do update set can_view_subsidiaries = true, is_default = true;

  raise notice 'ตั้งค่าเรียบร้อย: % เป็นผู้ดูแลระดับกลุ่ม บริษัทแม่รหัส HQ', v_admin_email;
end $$;
