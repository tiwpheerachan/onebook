-- ============================================================================
-- ONEBOOK 0012 : รวมข้อมูลบริบทผู้ใช้ไว้ในฟังก์ชันเดียว (ลดจำนวนรอบวิ่งไป-กลับ)
--
-- เดิมทุกครั้งที่เปิดหน้าใดหน้าหนึ่ง แอปต้องยิงคิวรีแยกกัน 5-6 รอบ
-- (auth.getUser, profiles, companies, user_companies, role_permissions, period_locks)
-- ซึ่งแต่ละรอบเสียเวลาเดินทางไป-กลับ Supabase ประมาณ 130-150 ms
-- ฟังก์ชันนี้คืนทุกอย่างในรอบเดียว โดยยังคงตรรกะสิทธิ์เดิมทุกประการ
-- ============================================================================

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
        'parent_id', c.parent_id, 'tax_id', c.tax_id, 'vat_rate', c.vat_rate
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
