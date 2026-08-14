-- =====================================================================
-- 0020 : ตารางงาน / งานที่มอบหมาย / งานตกหล่น
--   - งานผูกกับเอกสารบัญชีและผู้ติดต่อได้ จึงตามงานจากใบแจ้งหนี้ได้ตรง ๆ
--   - มีโน้ต เช็กลิสต์ ไฟล์แนบ และผู้รับผิดชอบหลายคน
--   - มีตัวสรุปภาพรวมสำหรับหน้าจอและสำหรับส่งให้ AI เขียนสรุป
-- =====================================================================

do $$ begin
  create type task_status as enum ('todo','in_progress','blocked','review','done','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_priority as enum ('low','normal','high','urgent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_kind as enum ('task','meeting','deadline','milestone','personal');
exception when duplicate_object then null; end $$;

create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  code         text,
  title        text not null,
  description  text,
  kind         task_kind     not null default 'task',
  status       task_status   not null default 'todo',
  priority     task_priority not null default 'normal',
  start_at     timestamptz,
  due_at       timestamptz,
  all_day      boolean not null default false,
  progress     smallint not null default 0 check (progress between 0 and 100),
  completed_at timestamptz,
  completed_by uuid references public.profiles(id),
  -- ผูกกับงานบัญชีที่มีอยู่ เช่น ตามเก็บเงินจากใบแจ้งหนี้ใบนี้
  document_id  uuid references public.documents(id) on delete set null,
  contact_id   uuid references public.contacts(id)  on delete set null,
  parent_id    uuid references public.tasks(id)     on delete cascade,
  -- งานที่ระบบสร้างให้อัตโนมัติ (เช่น กำหนดยื่นภาษี) กันสร้างซ้ำด้วยคีย์นี้
  auto_key     text,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint tasks_time_chk check (start_at is null or due_at is null or due_at >= start_at)
);

create unique index if not exists tasks_auto_key_idx
  on public.tasks (company_id, auto_key) where auto_key is not null;
create index if not exists tasks_company_due_idx on public.tasks (company_id, due_at);
create index if not exists tasks_company_status_idx on public.tasks (company_id, status);
create index if not exists tasks_doc_idx on public.tasks (document_id) where document_id is not null;

create table if not exists public.task_assignees (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'assignee' check (role in ('owner','assignee','watcher')),
  added_at   timestamptz not null default now(),
  unique (task_id, user_id)
);
create index if not exists task_assignees_user_idx on public.task_assignees (user_id, company_id);

create table if not exists public.task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  body       text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  edited_at  timestamptz
);
create index if not exists task_comments_task_idx on public.task_comments (task_id, created_at);

create table if not exists public.task_checklist (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  title      text not null,
  is_done    boolean not null default false,
  position   int not null default 0,
  done_by    uuid references public.profiles(id),
  done_at    timestamptz
);
create index if not exists task_checklist_task_idx on public.task_checklist (task_id, position);

-- ไฟล์แนบใช้ตารางเดิม เพิ่มการอ้างถึงงานเข้าไป
alter table public.attachments
  add column if not exists task_id uuid references public.tasks(id) on delete cascade;
create index if not exists attachments_task_idx on public.attachments (task_id, created_at desc);

-- document_id เดิมบังคับ not null หรือไม่ก็ตาม ต้องยอมให้ว่างได้เมื่อแนบกับงาน
alter table public.attachments alter column document_id drop not null;

-- ------------------------------------------------------------- ปรับปรุงเวลา
create or replace function app.touch_task()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  -- ปิดงานแล้วให้บันทึกเวลาและคนปิดอัตโนมัติ เปิดใหม่ก็ล้างค่าให้
  if new.status = 'done' and coalesce(old.status, 'todo') <> 'done' then
    new.completed_at := now();
    new.completed_by := auth.uid();
    new.progress := 100;
  elsif new.status <> 'done' and coalesce(old.status, 'todo') = 'done' then
    new.completed_at := null;
    new.completed_by := null;
  end if;
  return new;
end $$;

drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks
  for each row execute function app.touch_task();

-- ------------------------------------------------------------------- RLS
alter table public.tasks           enable row level security;
alter table public.tasks           force  row level security;
alter table public.task_assignees  enable row level security;
alter table public.task_assignees  force  row level security;
alter table public.task_comments   enable row level security;
alter table public.task_comments   force  row level security;
alter table public.task_checklist  enable row level security;
alter table public.task_checklist  force  row level security;

drop policy if exists "tasks_sel" on public.tasks;
create policy "tasks_sel" on public.tasks for select
  using (app.has_perm(company_id, 'tasks', 'view'));
drop policy if exists "tasks_ins" on public.tasks;
create policy "tasks_ins" on public.tasks for insert
  with check (app.has_perm(company_id, 'tasks', 'create'));
drop policy if exists "tasks_upd" on public.tasks;
create policy "tasks_upd" on public.tasks for update
  using (app.has_perm(company_id, 'tasks', 'edit'))
  with check (app.has_perm(company_id, 'tasks', 'edit'));
drop policy if exists "tasks_del" on public.tasks;
create policy "tasks_del" on public.tasks for delete
  using (app.has_perm(company_id, 'tasks', 'delete'));

do $$
declare tbl text;
begin
  foreach tbl in array array['task_assignees','task_comments','task_checklist'] loop
    execute format('drop policy if exists %I on public.%I', tbl || '_sel', tbl);
    execute format($f$create policy %I on public.%I for select
                     using (app.has_perm(company_id, 'tasks', 'view'))$f$, tbl || '_sel', tbl);

    execute format('drop policy if exists %I on public.%I', tbl || '_ins', tbl);
    execute format($f$create policy %I on public.%I for insert
                     with check (app.has_perm(company_id, 'tasks', 'edit'))$f$, tbl || '_ins', tbl);

    execute format('drop policy if exists %I on public.%I', tbl || '_upd', tbl);
    execute format($f$create policy %I on public.%I for update
                     using (app.has_perm(company_id, 'tasks', 'edit'))
                     with check (app.has_perm(company_id, 'tasks', 'edit'))$f$, tbl || '_upd', tbl);

    execute format('drop policy if exists %I on public.%I', tbl || '_del', tbl);
    execute format($f$create policy %I on public.%I for delete
                     using (app.has_perm(company_id, 'tasks', 'edit'))$f$, tbl || '_del', tbl);
  end loop;
end $$;

-- ไฟล์แนบของงานใช้สิทธิ์ tasks ส่วนของเอกสารใช้สิทธิ์ documents เหมือนเดิม
drop policy if exists "attachments_read" on storage.objects;
create policy "attachments_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'attachments'
    and (
      app.has_perm(app.safe_uuid(split_part(name, '/', 1)), 'documents', 'view')
      or app.has_perm(app.safe_uuid(split_part(name, '/', 1)), 'tasks', 'view')
    )
  );

drop policy if exists "attachments_write" on storage.objects;
create policy "attachments_write" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (
      app.has_perm(app.safe_uuid(split_part(name, '/', 1)), 'documents', 'edit')
      or app.has_perm(app.safe_uuid(split_part(name, '/', 1)), 'tasks', 'edit')
    )
  );

drop policy if exists "attachments_remove" on storage.objects;
create policy "attachments_remove" on storage.objects for delete to authenticated
  using (
    bucket_id = 'attachments'
    and (
      app.has_perm(app.safe_uuid(split_part(name, '/', 1)), 'documents', 'delete')
      or app.has_perm(app.safe_uuid(split_part(name, '/', 1)), 'tasks', 'edit')
    )
  );

-- --------------------------------------------------------------- สิทธิ์งาน
-- ให้บทบาทที่มีอยู่แล้วใช้งานเมนูงานได้ทันที โดยยึดตามสิทธิ์เอกสารที่แต่ละบทบาทมี
insert into public.role_permissions (role_id, resource, actions)
select rp.role_id, 'tasks',
       array(select distinct unnest(rp.actions || array['view','create','edit']))
from public.role_permissions rp
where rp.resource = 'documents'
  and not exists (
    select 1 from public.role_permissions x
    where x.role_id = rp.role_id and x.resource = 'tasks'
  );

-- บทบาทที่ไม่มีสิทธิ์เอกสารเลย (เช่น ผู้บริหารที่ดูรายงานอย่างเดียว) ให้ดูงานได้
insert into public.role_permissions (role_id, resource, actions)
select r.id, 'tasks', array['view','create','edit']
from public.roles r
where not exists (
  select 1 from public.role_permissions x where x.role_id = r.id and x.resource in ('tasks','*')
);

-- ------------------------------------------------------------------------
-- เลขที่งานอัตโนมัติ
-- ------------------------------------------------------------------------
create or replace function app.next_task_code(p_company uuid)
returns text language plpgsql security definer set search_path = public, app as $$
declare v_seq int;
begin
  select count(*) + 1 into v_seq from public.tasks where company_id = p_company;
  return 'TSK-' || lpad(v_seq::text, 5, '0');
end $$;

-- ------------------------------------------------------------------------
-- สร้าง / แก้ไขงาน พร้อมผู้รับผิดชอบในครั้งเดียว
-- ------------------------------------------------------------------------
create or replace function public.save_task(p_task jsonb, p_assignees uuid[] default null)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_id      uuid := nullif(p_task->>'id', '')::uuid;
  v_company uuid := (p_task->>'company_id')::uuid;
  u         uuid;
begin
  if v_company is null then raise exception 'COMPANY_REQUIRED'; end if;
  if not app.has_perm(v_company, 'tasks', case when v_id is null then 'create' else 'edit' end) then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์จัดการงาน';
  end if;
  if coalesce(trim(p_task->>'title'), '') = '' then
    raise exception 'TITLE_REQUIRED: กรุณาระบุชื่องาน';
  end if;

  if v_id is null then
    insert into public.tasks (
      company_id, code, title, description, kind, status, priority,
      start_at, due_at, all_day, progress, document_id, contact_id, parent_id, created_by
    ) values (
      v_company, app.next_task_code(v_company),
      trim(p_task->>'title'), nullif(p_task->>'description', ''),
      coalesce(nullif(p_task->>'kind', ''), 'task')::task_kind,
      coalesce(nullif(p_task->>'status', ''), 'todo')::task_status,
      coalesce(nullif(p_task->>'priority', ''), 'normal')::task_priority,
      nullif(p_task->>'start_at', '')::timestamptz,
      nullif(p_task->>'due_at', '')::timestamptz,
      coalesce((p_task->>'all_day')::boolean, false),
      coalesce((p_task->>'progress')::smallint, 0),
      nullif(p_task->>'document_id', '')::uuid,
      nullif(p_task->>'contact_id', '')::uuid,
      nullif(p_task->>'parent_id', '')::uuid,
      auth.uid()
    ) returning id into v_id;
  else
    update public.tasks set
      title       = trim(p_task->>'title'),
      description = nullif(p_task->>'description', ''),
      kind        = coalesce(nullif(p_task->>'kind', ''), kind::text)::task_kind,
      status      = coalesce(nullif(p_task->>'status', ''), status::text)::task_status,
      priority    = coalesce(nullif(p_task->>'priority', ''), priority::text)::task_priority,
      start_at    = nullif(p_task->>'start_at', '')::timestamptz,
      due_at      = nullif(p_task->>'due_at', '')::timestamptz,
      all_day     = coalesce((p_task->>'all_day')::boolean, all_day),
      progress    = coalesce((p_task->>'progress')::smallint, progress),
      document_id = nullif(p_task->>'document_id', '')::uuid,
      contact_id  = nullif(p_task->>'contact_id', '')::uuid
    where id = v_id and company_id = v_company;
    if not found then raise exception 'TASK_NOT_FOUND'; end if;
  end if;

  -- ส่ง null = ไม่แตะผู้รับผิดชอบเดิม, ส่ง array = แทนที่ทั้งชุด
  if p_assignees is not null then
    delete from public.task_assignees
     where task_id = v_id and not (user_id = any(p_assignees));
    foreach u in array p_assignees loop
      insert into public.task_assignees (task_id, company_id, user_id)
      values (v_id, v_company, u)
      on conflict (task_id, user_id) do nothing;
    end loop;
  end if;

  return v_id;
end $$;

grant execute on function public.save_task(jsonb, uuid[]) to authenticated;

-- ------------------------------------------------------------------------
-- สรุปภาพรวมงาน : ใช้ทั้งบนหน้าจอและเป็นข้อมูลตั้งต้นให้ AI เขียนสรุป
-- คำนวณจากฐานข้อมูลทั้งหมด ตัวเลขจึงไม่มีทางถูกแต่งขึ้นเอง
-- ------------------------------------------------------------------------
create or replace function public.rpt_task_summary(
  p_company uuid,
  p_from    date default null,
  p_to      date default null
)
returns json
language sql
stable
security definer
set search_path = public, app
as $$
  with scope as (
    select t.*
    from public.tasks t
    where t.company_id = p_company
      and app.has_perm(p_company, 'tasks', 'view')
      and t.status <> 'cancelled'
  ),
  counts as (
    select
      count(*) filter (where status = 'todo')        as todo,
      count(*) filter (where status = 'in_progress') as in_progress,
      count(*) filter (where status = 'blocked')     as blocked,
      count(*) filter (where status = 'review')      as review,
      count(*) filter (where status = 'done')        as done,
      count(*)                                       as total
    from scope
  ),
  overdue as (
    select json_agg(x order by x.due_at) as list, count(*) as n from (
      select s.id, s.code, s.title, s.due_at, s.priority::text, s.kind::text,
             (current_date - s.due_at::date) as days_late
      from scope s
      where s.status not in ('done','cancelled') and s.due_at < now()
      order by s.due_at
      limit 25
    ) x
  ),
  today as (
    select count(*) as n from scope
    where status not in ('done','cancelled') and due_at::date = current_date
  ),
  week as (
    select count(*) as n from scope
    where status not in ('done','cancelled')
      and due_at::date between current_date and current_date + 7
  ),
  unassigned as (
    select count(*) as n from scope s
    where s.status not in ('done','cancelled')
      and not exists (select 1 from public.task_assignees a where a.task_id = s.id)
  ),
  workload as (
    select json_agg(x order by x.open_tasks desc) as list from (
      select p.id, coalesce(p.full_name, p.email) as name,
             count(*) filter (where s.status not in ('done','cancelled'))                       as open_tasks,
             count(*) filter (where s.status not in ('done','cancelled') and s.due_at < now())  as overdue_tasks,
             count(*) filter (where s.status = 'done')                                          as done_tasks
      from public.task_assignees a
      join scope s on s.id = a.task_id
      join public.profiles p on p.id = a.user_id
      group by p.id, p.full_name, p.email
      having count(*) filter (where s.status not in ('done','cancelled')) > 0
      order by open_tasks desc
      limit 20
    ) x
  ),
  upcoming as (
    select json_agg(x order by x.due_at) as list from (
      select s.id, s.code, s.title, s.due_at, s.priority::text, s.kind::text
      from scope s
      where s.status not in ('done','cancelled')
        and s.due_at between now() and now() + interval '7 days'
      order by s.due_at
      limit 25
    ) x
  ),
  done_week as (
    select count(*) as n from scope
    where status = 'done' and completed_at >= now() - interval '7 days'
  )
  select json_build_object(
    'generated_at', now(),
    'range', json_build_object('from', p_from, 'to', p_to),
    'counts', (select row_to_json(counts) from counts),
    'overdue_count', (select n from overdue),
    'overdue', coalesce((select list from overdue), '[]'::json),
    'due_today', (select n from today),
    'due_week', (select n from week),
    'unassigned', (select n from unassigned),
    'done_last_7_days', (select n from done_week),
    'workload', coalesce((select list from workload), '[]'::json),
    'upcoming', coalesce((select list from upcoming), '[]'::json)
  );
$$;

grant execute on function public.rpt_task_summary(uuid, date, date) to authenticated;

-- ------------------------------------------------------------------------
-- สร้างงานกำหนดยื่นภาษีของเดือนที่ระบุให้อัตโนมัติ
-- กำหนดตามประมวลรัษฎากร : ภ.ง.ด. ภายในวันที่ 7 · ภ.พ.30 และประกันสังคม ภายในวันที่ 15
-- ของเดือนถัดจากเดือนภาษี (ถ้าตรงวันหยุดสุดสัปดาห์ ผู้ใช้เลื่อนเองได้)
-- ------------------------------------------------------------------------
create or replace function public.seed_tax_deadlines(p_company uuid, p_year int, p_month int)
returns int
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_period date := make_date(p_year, p_month, 1);
  v_label  text := to_char(v_period, 'MM/YYYY');
  v_next   date := (v_period + interval '1 month')::date;
  v_made   int := 0;
  rec      record;
begin
  if not app.has_perm(p_company, 'tasks', 'create') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์สร้างงาน';
  end if;

  for rec in
    select * from (values
      ('pnd1',  'ยื่น ภ.ง.ด.1 (ภาษีหัก ณ ที่จ่ายเงินเดือน) งวด ' || v_label,  7),
      ('pnd3',  'ยื่น ภ.ง.ด.3 (หัก ณ ที่จ่าย บุคคลธรรมดา) งวด ' || v_label,  7),
      ('pnd53', 'ยื่น ภ.ง.ด.53 (หัก ณ ที่จ่าย นิติบุคคล) งวด ' || v_label,    7),
      ('pp30',  'ยื่น ภ.พ.30 (ภาษีมูลค่าเพิ่ม) งวด ' || v_label,             15),
      ('sso',   'นำส่งเงินสมทบประกันสังคม งวด ' || v_label,                  15),
      ('close', 'ปิดงบการเงินประจำเดือน ' || v_label,                        20)
    ) as x(key, title, day)
  loop
    begin
      insert into public.tasks (
        company_id, code, title, kind, priority, status,
        due_at, all_day, auto_key, created_by, description
      ) values (
        p_company, app.next_task_code(p_company), rec.title, 'deadline',
        (case when rec.key = 'close' then 'high' else 'urgent' end)::task_priority,
        'todo'::task_status,
        (v_next + (rec.day - 1) * interval '1 day' + interval '17 hours'),
        true,
        rec.key || '-' || to_char(v_period, 'YYYYMM'),
        auth.uid(),
        'ระบบสร้างให้อัตโนมัติจากปฏิทินภาษี — ตรวจสอบวันหยุดราชการและเลื่อนได้ตามจริง'
      );
      v_made := v_made + 1;
    exception when unique_violation then
      -- สร้างไว้แล้ว ข้ามไป
      null;
    end;
  end loop;

  return v_made;
end $$;

grant execute on function public.seed_tax_deadlines(uuid, int, int) to authenticated;
