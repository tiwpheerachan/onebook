-- =====================================================================
-- 0065 : การแจ้งเตือน
--
--  ระบบไม่มีการแจ้งเตือนเลย ค้นทั้งฐานข้อมูลแล้วไม่พบ
--  ข้อมูลที่ควรเตือนมีครบอยู่แล้วทุกอย่าง (บิลเลยกำหนด สต๊อกต่ำ งบเกิน
--  เอกสารรออนุมัติ รายการซ้ำถึงกำหนด) แต่ไม่มีที่เก็บและไม่มีใครไปหยิบมาบอก
--
--  เรื่องนี้จำเป็นขึ้นมากหลังทำ 0063 และ 0064 เพราะทั้งสองอย่างสร้าง
--  "คิวที่รอคนมาทำ" ขึ้นมา แต่ไม่มีอะไรบอกว่ามีของรออยู่
--
-- ---------------------------------------------------------------------
--  เก็บคีย์กับพารามิเตอร์ ไม่ใช่ข้อความสำเร็จรูป
--
--  ระบบเป็นสามภาษา คนที่สร้างการแจ้งเตือนกับคนที่อ่านอาจตั้งภาษาคนละอัน
--  ถ้าเก็บข้อความไว้ตรง ๆ ผู้อ่านจะได้ภาษาของคนสร้าง หรือของงานตั้งเวลา
--  จึงเก็บ title_key กับ params แล้วให้หน้าจอประกอบข้อความตามภาษาผู้อ่านเอง
--
-- ---------------------------------------------------------------------
--  ส่งถึงใคร
--
--  ไม่ผูกกับผู้ใช้รายคน แต่ผูกกับ "สิทธิ์" หรือ "บทบาท"
--  เพราะคนเข้าออกงานตลอด ถ้าผูกรายคน พอคนลาออกการแจ้งเตือนจะค้างไม่มีใครดู
--
--    resource  ใครมีสิทธิ์ดูทรัพยากรนี้ก็เห็น
--    role_id   เฉพาะคนที่ถือบทบาทนี้ (ใช้กับคิวอนุมัติ)
--
--  สถานะอ่านแล้วจึงต้องแยกเป็นรายคน (notification_reads)
--  ไม่ใช่คอลัมน์ is_read บนตัวการแจ้งเตือน ซึ่งจะกลายเป็นว่าคนแรกที่อ่าน
--  ทำให้ทุกคนเห็นเป็นอ่านแล้ว
--
-- ---------------------------------------------------------------------
--  สร้างซ้ำไม่ได้
--
--  dedupe_key เป็น unique ต่อบริษัท เช่น 'overdue:<doc_id>'
--  เรียกกี่รอบก็ได้ ไม่มีทางได้การแจ้งเตือนซ้ำ
-- =====================================================================

-- ------------------------------------------------------------------------
-- 1) ตาราง
-- ------------------------------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  kind        text not null,
  severity    text not null default 'info',
  title_key   text not null,
  params      jsonb not null default '{}'::jsonb,
  href        text,
  resource    text,
  role_id     uuid references public.roles(id) on delete cascade,
  dedupe_key  text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint notifications_sev_chk check (severity in ('info','warning','danger')),
  unique (company_id, dedupe_key)
);

create index if not exists notifications_company_idx
  on public.notifications (company_id, is_active, created_at desc);
create index if not exists notifications_role_idx
  on public.notifications (role_id) where role_id is not null;

comment on table public.notifications is
  'การแจ้งเตือน — เก็บคีย์ข้อความกับพารามิเตอร์ ไม่เก็บข้อความสำเร็จรูป เพราะผู้อ่านอาจใช้คนละภาษา';
comment on column public.notifications.dedupe_key is
  'คีย์กันสร้างซ้ำ unique ต่อบริษัท เช่น overdue:<document_id>';
comment on column public.notifications.resource is
  'ใครมีสิทธิ์ดูทรัพยากรนี้จึงจะเห็น null = ทุกคนในบริษัท';

create table if not exists public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (notification_id, user_id)
);

comment on table public.notification_reads is
  'สถานะอ่านแล้วรายคน — การแจ้งเตือนหนึ่งอันมีผู้รับหลายคน จึงเก็บแยกไม่ใช่คอลัมน์บนตัวแจ้งเตือน';

-- ------------------------------------------------------------------------
-- 2) RLS
--
--  เห็นเฉพาะที่ตรงกับสิทธิ์หรือบทบาทของตัวเอง
-- ------------------------------------------------------------------------
alter table public.notifications enable row level security;
alter table public.notifications force row level security;

drop policy if exists "notifications_sel" on public.notifications;
create policy "notifications_sel" on public.notifications for select to authenticated
  using (
    app.can_access_company(company_id, auth.uid())
    and (resource is null or app.has_perm(company_id, resource, 'view'))
    and (role_id is null or exists (
      select 1 from public.user_companies uc
      where uc.user_id = auth.uid() and uc.company_id = notifications.company_id
        and uc.is_active and uc.role_id = notifications.role_id
    ))
  );

-- สร้างและปิดผ่านฟังก์ชันเท่านั้น ผู้ใช้แก้ตรง ๆ ไม่ได้
drop policy if exists "notifications_ins" on public.notifications;
create policy "notifications_ins" on public.notifications for insert to authenticated
  with check (false);

alter table public.notification_reads enable row level security;
alter table public.notification_reads force row level security;

drop policy if exists "notification_reads_own" on public.notification_reads;
create policy "notification_reads_own" on public.notification_reads for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ------------------------------------------------------------------------
-- 3) ตัวช่วยสร้าง
--
--  on conflict do nothing คือหัวใจ เรียกซ้ำกี่รอบก็ได้
-- ------------------------------------------------------------------------
create or replace function app.notify(
  p_company   uuid,
  p_kind      text,
  p_severity  text,
  p_title_key text,
  p_params    jsonb,
  p_dedupe    text,
  p_href      text default null,
  p_resource  text default null,
  p_role      uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public, app
as $fn$
declare v_id uuid;
begin
  insert into public.notifications
    (company_id, kind, severity, title_key, params, dedupe_key, href, resource, role_id)
  values (p_company, p_kind, p_severity, p_title_key, coalesce(p_params, '{}'::jsonb),
          p_dedupe, p_href, p_resource, p_role)
  on conflict (company_id, dedupe_key) do nothing
  returning id into v_id;
  return v_id is not null;
end $fn$;

-- ------------------------------------------------------------------------
-- 4) สแกนหาสิ่งที่ควรเตือน
--
--  เรียกได้บ่อยเท่าที่ต้องการ ไม่สร้างซ้ำ
--  แต่ละกลุ่มแยกกัน ถ้ากลุ่มไหนไม่มีข้อมูลก็ข้ามไปเงียบ ๆ
-- ------------------------------------------------------------------------
create or replace function public.generate_notifications(
  p_company uuid, p_as_of date default current_date
)
returns json
language plpgsql
security definer
set search_path = public, app
as $fn$
declare
  r record; v_made int := 0; v_year int; v_month int;
begin
  if not app.can_access_company(p_company, auth.uid()) then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์เข้าถึงบริษัทนี้';
  end if;

  -- ---------- เอกสารขายเลยกำหนดชำระ ----------
  for r in
    select d.id, d.doc_number, d.due_date, d.net_payable - d.paid_amount as outstanding,
           coalesce(c.name, d.contact_snapshot->>'name') as contact_name,
           (p_as_of - d.due_date) as days_late
    from public.documents d
    left join public.contacts c on c.id = d.contact_id
    where d.company_id = p_company
      and d.accounting_doc_id is null
      and d.status::text in ('approved','partial','overdue')
      and d.kind::text in ('invoice','tax_invoice','debit_note')
      and d.due_date is not null and d.due_date < p_as_of
      and d.net_payable - d.paid_amount > 0.005
  loop
    if app.notify(p_company, 'ar_overdue',
         case when r.days_late > 30 then 'danger' else 'warning' end,
         'arOverdue',
         jsonb_build_object('doc', r.doc_number, 'contact', r.contact_name,
                            'days', r.days_late, 'amount', r.outstanding),
         'ar_overdue:' || r.id::text,
         '/reports/ar-aging', 'report')
    then v_made := v_made + 1; end if;
  end loop;

  -- ---------- เอกสารซื้อเลยกำหนดจ่าย ----------
  for r in
    select d.id, d.doc_number, d.due_date, d.net_payable - d.paid_amount as outstanding,
           coalesce(c.name, d.contact_snapshot->>'name') as contact_name,
           (p_as_of - d.due_date) as days_late
    from public.documents d
    left join public.contacts c on c.id = d.contact_id
    where d.company_id = p_company
      and d.accounting_doc_id is null
      and d.status::text in ('approved','partial','overdue')
      and d.kind::text in ('bill','expense','purchase_debit_note')
      and d.due_date is not null and d.due_date < p_as_of
      and d.net_payable - d.paid_amount > 0.005
  loop
    if app.notify(p_company, 'ap_overdue', 'warning', 'apOverdue',
         jsonb_build_object('doc', r.doc_number, 'contact', r.contact_name,
                            'days', r.days_late, 'amount', r.outstanding),
         'ap_overdue:' || r.id::text,
         '/reports/ap-aging', 'report')
    then v_made := v_made + 1; end if;
  end loop;

  -- ---------- เอกสารรออนุมัติ ส่งถึงบทบาทที่ถึงคิว ----------
  for r in
    select s.document_id, s.role_id, s.step_no, d.doc_number, d.grand_total
    from public.approval_steps s
    join public.documents d on d.id = s.document_id
    where s.company_id = p_company
      and s.status = 'pending'
      and d.status::text = 'awaiting_approval'
      and s.step_no = (select min(step_no) from public.approval_steps
                       where document_id = s.document_id and status = 'pending')
  loop
    if app.notify(p_company, 'approval_pending', 'warning', 'approvalPending',
         jsonb_build_object('doc', r.doc_number, 'amount', r.grand_total, 'step', r.step_no),
         'approval:' || r.document_id::text || ':' || r.step_no::text,
         '/approvals', 'documents', r.role_id)
    then v_made := v_made + 1; end if;
  end loop;

  -- ---------- สินค้าต่ำกว่าจุดสั่งซื้อ ----------
  for r in
    select b.product_id, b.sku, b.product_name, b.qty_on_hand, p.reorder_point
    from public.rpt_stock_balance(p_company, p_as_of) b
    join public.products p on p.id = b.product_id
    where p.reorder_point > 0 and b.qty_on_hand <= p.reorder_point
  loop
    -- ใส่วันที่ในคีย์ เพื่อให้เตือนใหม่ได้วันละครั้ง ไม่ใช่ครั้งเดียวตลอดกาล
    if app.notify(p_company, 'low_stock', 'warning', 'lowStock',
         jsonb_build_object('sku', r.sku, 'name', r.product_name,
                            'qty', r.qty_on_hand, 'reorder', r.reorder_point),
         'low_stock:' || r.product_id::text || ':' || to_char(p_as_of, 'YYYY-MM-DD'),
         '/inventory/' || r.product_id::text, 'products.inventory')
    then v_made := v_made + 1; end if;
  end loop;

  -- ---------- งบประมาณที่ใช้เกิน ----------
  v_year  := extract(year  from p_as_of)::int;
  v_month := extract(month from p_as_of)::int;
  for r in
    select (x->>'code') as code, (x->>'name_th') as name,
           (x->>'budget')::numeric as budget, (x->>'used')::numeric as used
    from jsonb_array_elements(
           public.rpt_budget_vs_actual(p_company, v_year, v_month)::jsonb) x
    where (x->>'remaining')::numeric < 0
  loop
    if app.notify(p_company, 'budget_over', 'danger', 'budgetOver',
         jsonb_build_object('code', r.code, 'name', r.name,
                            'budget', r.budget, 'used', r.used),
         'budget_over:' || r.code || ':' || v_year::text || '-' || v_month::text,
         '/accounting/budget', 'accounting.budget')
    then v_made := v_made + 1; end if;
  end loop;

  -- ---------- รายการซ้ำและตัดจ่ายที่ถึงกำหนด ----------
  for r in
    select t.id, t.name, t.next_date
    from public.recurring_journals t
    where t.company_id = p_company and t.is_active and t.next_date <= p_as_of
      and (t.end_date is null or t.next_date <= t.end_date)
  loop
    if app.notify(p_company, 'recurring_due', 'info', 'recurringDue',
         jsonb_build_object('name', r.name, 'date', r.next_date),
         'recurring_due:' || r.id::text || ':' || to_char(r.next_date, 'YYYY-MM-DD'),
         '/accounting/recurring', 'journal')
    then v_made := v_made + 1; end if;
  end loop;

  return json_build_object('created', v_made);
end $fn$;

grant execute on function public.generate_notifications(uuid, date) to authenticated;

comment on function public.generate_notifications is
  'สแกนหาสิ่งที่ควรแจ้งเตือนแล้วบันทึกไว้ — เรียกซ้ำได้ ไม่สร้างซ้ำเพราะมี dedupe_key';

-- ------------------------------------------------------------------------
-- 5) การแจ้งเตือนของผู้ใช้คนนี้
--
--  security invoker ให้ RLS คัดว่าใครเห็นอะไร
-- ------------------------------------------------------------------------
create or replace function public.rpt_notifications(
  p_company uuid, p_unread_only boolean default false, p_limit int default 100
)
returns json
language sql
stable
security invoker
set search_path = public, app
as $rn$
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', n.id,
      'kind', n.kind,
      'severity', n.severity,
      'title_key', n.title_key,
      'params', n.params,
      'href', n.href,
      'created_at', n.created_at,
      'is_read', rd.user_id is not null
    ) as x
    from public.notifications n
    left join public.notification_reads rd
      on rd.notification_id = n.id and rd.user_id = auth.uid()
    where n.company_id = p_company
      and n.is_active
      and (not p_unread_only or rd.user_id is null)
    order by n.created_at desc
    limit greatest(1, least(p_limit, 500))
  ) t;
$rn$;

grant execute on function public.rpt_notifications(uuid, boolean, int) to authenticated;

create or replace function public.rpt_unread_count(p_company uuid)
returns int
language sql
stable
security invoker
set search_path = public, app
as $rc$
  select count(*)::int
  from public.notifications n
  left join public.notification_reads rd
    on rd.notification_id = n.id and rd.user_id = auth.uid()
  where n.company_id = p_company and n.is_active and rd.user_id is null;
$rc$;

grant execute on function public.rpt_unread_count(uuid) to authenticated;

-- ------------------------------------------------------------------------
-- 6) ทำเครื่องหมายว่าอ่านแล้ว
--
--  ทำได้เฉพาะการแจ้งเตือนที่ตัวเองมีสิทธิ์เห็น
--  select ผ่าน RLS ก่อนแล้วค่อย insert จึงกันการเดา id ของบริษัทอื่น
-- ------------------------------------------------------------------------
create or replace function public.mark_notifications_read(
  p_company uuid, p_ids uuid[] default null
)
returns json
language plpgsql
security invoker
set search_path = public, app
as $fn$
declare v_n int;
begin
  insert into public.notification_reads(notification_id, user_id)
  select n.id, auth.uid()
  from public.notifications n
  where n.company_id = p_company
    and n.is_active
    and (p_ids is null or n.id = any (p_ids))
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return json_build_object('marked', v_n);
end $fn$;

grant execute on function public.mark_notifications_read(uuid, uuid[]) to authenticated;

comment on function public.mark_notifications_read is
  'ทำเครื่องหมายอ่านแล้ว — security invoker จึงเห็นเฉพาะที่ RLS ยอมให้เห็น ส่ง id ของบริษัทอื่นมาก็ไม่มีผล';
