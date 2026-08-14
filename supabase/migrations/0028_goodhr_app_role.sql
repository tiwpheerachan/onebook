-- =====================================================================
-- 0028 : รองรับ claim app_role ที่ GoodHR เพิ่มมาให้
--
--  GoodHR ให้ผู้ดูแลเลือก "บทบาทใน ONEBOOK" ให้พนักงานได้ตั้งแต่ฝั่งเขา
--  แต่ ONEBOOK เป็นระบบหลายบริษัท (ตอนนี้ 7 บริษัท) ส่วน app_role เป็นค่าเดียว
--  จึงบอกไม่ได้ว่า "เป็นพนักงานบัญชีของบริษัทไหน"
--
--  ทางออก : ONEBOOK ยังเป็นผู้ตัดสินสิทธิ์
--    - มีคำเชิญจากผู้ดูแล ONEBOOK  → ใช้คำเชิญ (มีผลเหนือกว่าเสมอ)
--    - ไม่มีคำเชิญ แต่เปิด GOODHR_TRUST_APP_ROLE → ใช้ app_role
--      โดยจับคู่บริษัทจาก claim company_name
--    - ไม่เข้าเงื่อนไขไหนเลย → เข้าไม่ได้
-- =====================================================================

alter table public.profiles
  add column if not exists goodhr_app_role text;

comment on column public.profiles.goodhr_app_role is
  'บทบาทใน ONEBOOK ที่ผู้ดูแล GoodHR เลือกไว้ — เก็บไว้ให้ผู้ดูแล ONEBOOK ดูประกอบการอนุมัติ';

create or replace function public.sso_link_profile(
  p_user         uuid,
  p_claims       jsonb,
  p_auto_role    text default null,
  p_company_name text default null
)
returns json
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_code    text   := nullif(p_claims->>'employee_code', '');
  v_email   citext := (p_claims->>'email')::citext;
  v_applied int := 0;
  v_auto    int := 0;
  v_company uuid;
  v_role    uuid;
  inv       record;
begin
  update public.profiles set
    goodhr_sub      = coalesce(p_claims->>'sub', goodhr_sub),
    email           = coalesce(v_email, email),
    full_name       = coalesce(nullif(p_claims->>'name', ''), full_name),
    employee_code   = coalesce(v_code, employee_code),
    goodhr_role     = nullif(p_claims->>'role', ''),
    goodhr_app_role = nullif(p_claims->>'app_role', ''),
    department      = nullif(p_claims->>'department', ''),
    position        = nullif(p_claims->>'position', ''),
    branch          = nullif(p_claims->>'branch', ''),
    auth_source     = 'goodhr',
    goodhr_synced_at = now(),
    last_login_at   = now(),
    updated_at      = now()
  where id = p_user;

  -- ── 1) คำเชิญจากผู้ดูแล ONEBOOK มีผลเหนือกว่าเสมอ ──
  for inv in
    select * from public.sso_invitations
    where consumed_at is null
      and ((v_code is not null and employee_code = v_code) or (email is not null and email = v_email))
  loop
    insert into public.user_companies (user_id, company_id, role_id, can_view_subsidiaries, is_active)
    values (p_user, inv.company_id, inv.role_id, inv.can_view_subsidiaries, true)
    on conflict (user_id, company_id) do update
      set role_id = excluded.role_id,
          can_view_subsidiaries = excluded.can_view_subsidiaries,
          is_active = true;

    update public.sso_invitations set consumed_at = now(), consumed_by = p_user where id = inv.id;
    v_applied := v_applied + 1;
  end loop;

  -- ── 2) ยังไม่มีสิทธิ์บริษัทไหนเลย และเปิดให้เชื่อ app_role ──
  if p_auto_role is not null
     and not exists (select 1 from public.user_companies where user_id = p_user and is_active)
  then
    -- จับคู่บริษัทจากชื่อที่ GoodHR ส่งมา ถ้าไม่ตรงและมีบริษัทเดียวก็ใช้บริษัทนั้น
    select id into v_company
    from public.companies
    where is_active
      and (name_th = p_company_name or name_en = p_company_name
           or replace(name_th, ' ', '') = replace(coalesce(p_company_name, ''), ' ', ''))
    limit 1;

    if v_company is null and (select count(*) from public.companies where is_active) = 1 then
      select id into v_company from public.companies where is_active limit 1;
    end if;

    if v_company is not null then
      select id into v_role from public.roles where company_id = v_company and code = p_auto_role;
      if v_role is not null then
        insert into public.user_companies (user_id, company_id, role_id, can_view_subsidiaries, is_active)
        values (p_user, v_company, v_role, false, true)
        on conflict (user_id, company_id) do nothing;
        v_auto := 1;
      end if;
    end if;
  end if;

  return json_build_object(
    'applied_invitations', v_applied,
    'auto_granted', v_auto,
    'company_count', (select count(*) from public.user_companies where user_id = p_user and is_active)
  );
end $$;

grant execute on function public.sso_link_profile(uuid, jsonb, text, text) to authenticated;
