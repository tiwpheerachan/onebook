-- ============================================================================
-- ONEBOOK 0004 : ฟังก์ชันความปลอดภัย (RBAC ละเอียด + freeze งวด)
-- ============================================================================

-- true ถ้าเป็นผู้ดูแลระดับกลุ่ม
create or replace function app.is_group_admin(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, app as $$
  select coalesce((select p.is_group_admin and p.is_active from public.profiles p where p.id = uid), false);
$$;

-- คืนรายการ company_id ที่ผู้ใช้เข้าถึงได้ (รวมบริษัทลูกตามสายบังคับบัญชา)
create or replace function app.accessible_company_ids(uid uuid default auth.uid())
returns table (company_id uuid)
language sql stable security definer set search_path = public, app as $$
  with recursive direct as (
    select uc.company_id, uc.can_view_subsidiaries
    from public.user_companies uc
    join public.profiles p on p.id = uc.user_id and p.is_active
    where uc.user_id = uid
      and uc.is_active
      and (uc.valid_from is null or uc.valid_from <= current_date)
      and (uc.valid_to is null or uc.valid_to >= current_date)
  ),
  tree as (
    select d.company_id, d.can_view_subsidiaries from direct d
    union
    select c.id, t.can_view_subsidiaries
    from public.companies c
    join tree t on c.parent_id = t.company_id
    where t.can_view_subsidiaries
  )
  select distinct company_id from tree
  union
  select c.id from public.companies c where app.is_group_admin(uid);
$$;

create or replace function app.can_access_company(p_company uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, app as $$
  select exists (select 1 from app.accessible_company_ids(uid) a where a.company_id = p_company);
$$;

-- สิทธิ์ระดับละเอียด: ทรัพยากร + การกระทำ
-- รองรับ wildcard '*' และ prefix เช่น resource 'sales' ครอบคลุม 'sales.invoice'
create or replace function app.has_perm(p_company uuid, p_resource text, p_action text, uid uuid default auth.uid())
returns boolean language plpgsql stable security definer set search_path = public, app as $$
declare
  v_ok boolean;
begin
  if app.is_group_admin(uid) then
    return true;
  end if;

  -- ต้องเป็นสมาชิกบริษัทนั้น (หรือบริษัทแม่ที่มองทะลุได้ -> อ่านอย่างเดียว)
  if not app.can_access_company(p_company, uid) then
    return false;
  end if;

  select exists (
    select 1
    from public.user_companies uc
    join public.role_permissions rp on rp.role_id = uc.role_id
    where uc.user_id = uid
      and uc.company_id = p_company
      and uc.is_active
      and (rp.resource = '*' or rp.resource = p_resource
           or p_resource like rp.resource || '.%')
      and ('*' = any(rp.actions) or p_action = any(rp.actions))
  ) into v_ok;

  if v_ok then return true; end if;

  -- สิทธิ์ "มองทะลุบริษัทลูก" ให้เฉพาะการดู/ออกรายงาน
  if p_action in ('view','export') then
    return exists (
      with recursive tree as (
        select uc.company_id, uc.role_id
        from public.user_companies uc
        where uc.user_id = uid and uc.is_active and uc.can_view_subsidiaries
        union
        select c.id, t.role_id from public.companies c
        join tree t on c.parent_id = t.company_id
      )
      select 1 from tree t
      join public.role_permissions rp on rp.role_id = t.role_id
      where t.company_id = p_company
        and (rp.resource = '*' or rp.resource = p_resource or p_resource like rp.resource || '.%')
        and ('*' = any(rp.actions) or p_action = any(rp.actions))
    );
  end if;

  return false;
end $$;

-- ฟิลด์ที่ต้องซ่อนสำหรับผู้ใช้ปัจจุบัน (ใช้ฝั่งแอปเพื่อ mask ข้อมูล)
create or replace function public.masked_fields(p_company uuid, p_resource text)
returns text[] language sql stable security definer set search_path = public, app as $$
  select case when app.is_group_admin() then '{}'::text[] else
    coalesce((
      select array_agg(distinct f)
      from public.user_companies uc
      join public.role_permissions rp on rp.role_id = uc.role_id
      cross join unnest(rp.field_mask) f
      where uc.user_id = auth.uid() and uc.company_id = p_company and uc.is_active
        and (rp.resource = '*' or rp.resource = p_resource or p_resource like rp.resource || '.%')
    ), '{}'::text[])
  end;
$$;

-- ------------------------------------------------------------ freeze / ปิดงวด
create or replace function app.locked_through(p_company uuid, p_scope text default 'all')
returns date language sql stable security definer set search_path = public, app as $$
  select max(locked_through) from public.period_locks
  where company_id = p_company and is_active and released_at is null
    and (scope = 'all' or scope = p_scope);
$$;

create or replace function app.assert_period_open(p_company uuid, p_date date, p_scope text default 'all')
returns void language plpgsql stable security definer set search_path = public, app as $$
declare v_lock date;
begin
  v_lock := app.locked_through(p_company, p_scope);
  if v_lock is not null and p_date <= v_lock then
    if app.has_perm(p_company, 'period', 'unlock') then
      return; -- ผู้มีสิทธิ์ปลดล็อกเท่านั้นที่แก้ย้อนหลังได้
    end if;
    raise exception 'PERIOD_LOCKED: งวดบัญชีถูกปิด (freeze) ถึงวันที่ % ไม่สามารถบันทึก/แก้ไขรายการวันที่ % ได้', v_lock, p_date
      using errcode = 'P0001';
  end if;
end $$;

-- ตัวช่วยเรียกจากฝั่งแอป
create or replace function public.check_period_open(p_company uuid, p_date date, p_scope text default 'all')
returns boolean language plpgsql stable security definer set search_path = public, app as $$
begin
  perform app.assert_period_open(p_company, p_date, p_scope);
  return true;
exception when others then
  return false;
end $$;

grant execute on function app.is_group_admin(uuid) to authenticated;
grant execute on function app.accessible_company_ids(uuid) to authenticated;
grant execute on function app.can_access_company(uuid, uuid) to authenticated;
grant execute on function app.has_perm(uuid, text, text, uuid) to authenticated;
grant execute on function app.locked_through(uuid, text) to authenticated;
grant execute on function public.masked_fields(uuid, text) to authenticated;
grant execute on function public.check_period_open(uuid, date, text) to authenticated;
