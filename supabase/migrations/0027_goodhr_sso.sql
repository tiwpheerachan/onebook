-- =====================================================================
-- 0027 : เข้าสู่ระบบด้วย GoodHR (OIDC) + อนุญาตเข้าใช้เป็นรายบุคคล
--
--  หลักการ
--    GoodHR = ยืนยันว่า "คุณคือใคร" เท่านั้น
--    ONEBOOK = ตัดสินว่า "คุณทำอะไรได้บ้าง" ด้วยระบบสิทธิ์เดิมทั้งหมด
--
--  ค่าเริ่มต้นคือ "เข้าไม่ได้"
--  พนักงาน GoodHR ที่ยังไม่ถูกอนุญาตจะล็อกอินไม่ผ่าน แม้บัญชีจะถูกต้อง
--  ผู้ดูแลต้องกดอนุญาตรายคนก่อน พร้อมเลือกบทบาทและบริษัทที่เข้าถึงได้
-- =====================================================================

-- ------------------------------------------------- ข้อมูลจาก GoodHR บนโปรไฟล์
alter table public.profiles
  add column if not exists goodhr_sub   text,
  add column if not exists goodhr_role  text,
  add column if not exists department   text,
  add column if not exists position     text,
  add column if not exists branch       text,
  add column if not exists auth_source  text not null default 'password'
      check (auth_source in ('password','goodhr')),
  add column if not exists goodhr_synced_at timestamptz;

-- sub คือรหัสถาวรของ GoodHR ห้ามซ้ำ และใช้เป็นกุญแจผูกบัญชี (ไม่ใช้อีเมล เพราะเปลี่ยนได้)
create unique index if not exists profiles_goodhr_sub_key
  on public.profiles (goodhr_sub) where goodhr_sub is not null;

comment on column public.profiles.goodhr_sub is
  'รหัสประจำตัวถาวรจาก GoodHR (claim sub) — ใช้ผูกบัญชี ไม่ใช้อีเมลเพราะพนักงานเปลี่ยนอีเมลได้';

-- ------------------------------------------------- รายชื่อที่อนุญาตให้เข้าใช้
-- อนุญาตล่วงหน้าได้ก่อนพนักงานเคยล็อกอิน โดยอ้างรหัสพนักงานหรืออีเมล
create table if not exists public.sso_invitations (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  employee_code text,
  email         citext,
  role_id       uuid not null references public.roles(id) on delete cascade,
  can_view_subsidiaries boolean not null default false,
  note          text,
  invited_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  consumed_at   timestamptz,
  consumed_by   uuid references public.profiles(id),
  constraint sso_inv_key_chk check (employee_code is not null or email is not null)
);

create index if not exists sso_inv_code_idx  on public.sso_invitations (employee_code) where consumed_at is null;
create index if not exists sso_inv_email_idx on public.sso_invitations (email) where consumed_at is null;

alter table public.sso_invitations enable row level security;
alter table public.sso_invitations force  row level security;

drop policy if exists "sso_inv_sel" on public.sso_invitations;
create policy "sso_inv_sel" on public.sso_invitations for select
  using (app.has_perm(company_id, 'settings.users', 'view'));
drop policy if exists "sso_inv_ins" on public.sso_invitations;
create policy "sso_inv_ins" on public.sso_invitations for insert
  with check (app.has_perm(company_id, 'settings.users', 'create'));
drop policy if exists "sso_inv_del" on public.sso_invitations;
create policy "sso_inv_del" on public.sso_invitations for delete
  using (app.has_perm(company_id, 'settings.users', 'edit'));

-- ------------------------------------------------------------------------
-- ตรวจว่าพนักงาน GoodHR คนนี้ได้รับอนุญาตให้เข้าใช้หรือยัง
-- เรียกก่อนสร้างบัญชีจริง เพื่อไม่ให้เกิดบัญชีขยะของคนที่ไม่มีสิทธิ์
-- ------------------------------------------------------------------------
create or replace function public.sso_check_access(
  p_sub           text,
  p_email         text,
  p_employee_code text
)
returns json
language sql
stable
security definer
set search_path = public, app
as $$
  select json_build_object(
    -- เคยเข้าระบบแล้วและยังใช้งานอยู่
    'existing_profile', (
      select jsonb_build_object('id', p.id, 'is_active', p.is_active,
                                'companies', (select count(*) from public.user_companies uc
                                              where uc.user_id = p.id and uc.is_active))
      from public.profiles p
      where p.goodhr_sub = p_sub
         or (p_employee_code is not null and p.employee_code = p_employee_code)
         or p.email = p_email::citext
      limit 1
    ),
    -- มีคำเชิญค้างอยู่กี่ใบ
    'pending_invitations', (
      select count(*) from public.sso_invitations i
      where i.consumed_at is null
        and ((p_employee_code is not null and i.employee_code = p_employee_code)
             or (i.email is not null and i.email = p_email::citext))
    )
  );
$$;

grant execute on function public.sso_check_access(text, text, text) to authenticated, anon;

-- ------------------------------------------------------------------------
-- ผูกบัญชีและอัปเดตข้อมูลพนักงานจาก GoodHR แล้วใช้คำเชิญที่ค้างอยู่
-- เรียกหลังจากสร้าง auth user แล้ว (ต้องส่ง p_user มาจากฝั่งเซิร์ฟเวอร์)
-- ------------------------------------------------------------------------
create or replace function public.sso_link_profile(
  p_user   uuid,
  p_claims jsonb
)
returns json
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_code  text := nullif(p_claims->>'employee_code', '');
  v_email citext := (p_claims->>'email')::citext;
  v_applied int := 0;
  inv record;
begin
  -- อัปเดตข้อมูลพนักงานทุกครั้งที่ล็อกอิน ข้อมูลจึงตรงกับ GoodHR เสมอ
  update public.profiles set
    goodhr_sub    = coalesce(p_claims->>'sub', goodhr_sub),
    email         = coalesce(v_email, email),
    full_name     = coalesce(nullif(p_claims->>'name', ''), full_name),
    employee_code = coalesce(v_code, employee_code),
    goodhr_role   = nullif(p_claims->>'role', ''),
    department    = nullif(p_claims->>'department', ''),
    position      = nullif(p_claims->>'position', ''),
    branch        = nullif(p_claims->>'branch', ''),
    auth_source   = 'goodhr',
    goodhr_synced_at = now(),
    last_login_at = now(),
    updated_at    = now()
  where id = p_user;

  -- ใช้คำเชิญที่ค้างอยู่ทุกใบ ทั้งที่อ้างรหัสพนักงานและอีเมล
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

    update public.sso_invitations
       set consumed_at = now(), consumed_by = p_user
     where id = inv.id;

    v_applied := v_applied + 1;
  end loop;

  return json_build_object(
    'applied_invitations', v_applied,
    'company_count', (select count(*) from public.user_companies
                      where user_id = p_user and is_active)
  );
end $$;

grant execute on function public.sso_link_profile(uuid, jsonb) to authenticated;

-- ------------------------------------------------------------------------
-- รายชื่อผู้ใช้พร้อมข้อมูลจาก GoodHR สำหรับหน้าจัดการสิทธิ์
-- ------------------------------------------------------------------------
create or replace function public.rpt_sso_users(p_company uuid)
returns json
language sql
stable
security definer
set search_path = public, app
as $$
  select json_build_object(
    'users', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'email', p.email, 'full_name', p.full_name,
        'employee_code', p.employee_code, 'department', p.department,
        'position', p.position, 'branch', p.branch,
        'goodhr_role', p.goodhr_role, 'auth_source', p.auth_source,
        'is_active', p.is_active, 'is_group_admin', p.is_group_admin,
        'last_login_at', p.last_login_at,
        'access', (
          select jsonb_agg(jsonb_build_object(
            'company_id', uc.company_id, 'company', c.name_th,
            'role_id', uc.role_id, 'role', r.name_th,
            'can_view_subsidiaries', uc.can_view_subsidiaries,
            'is_active', uc.is_active
          ) order by c.code)
          from public.user_companies uc
          join public.companies c on c.id = uc.company_id
          join public.roles r on r.id = uc.role_id
          where uc.user_id = p.id
        )
      ) order by p.full_name)
      from public.profiles p
      where app.has_perm(p_company, 'settings.users', 'view')
    ), '[]'::jsonb),
    'invitations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'employee_code', i.employee_code, 'email', i.email,
        'company_id', i.company_id, 'company', c.name_th,
        'role_id', i.role_id, 'role', r.name_th,
        'can_view_subsidiaries', i.can_view_subsidiaries,
        'note', i.note, 'created_at', i.created_at
      ) order by i.created_at desc)
      from public.sso_invitations i
      join public.companies c on c.id = i.company_id
      join public.roles r on r.id = i.role_id
      where i.consumed_at is null
        and app.has_perm(i.company_id, 'settings.users', 'view')
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.rpt_sso_users(uuid) to authenticated;
