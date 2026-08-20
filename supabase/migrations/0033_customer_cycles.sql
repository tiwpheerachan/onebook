-- =====================================================================
-- 0033 : ลูกค้าประจำ — รอบการขายและการเตือนก่อนหลุดรอบ
--
--  ลูกค้าที่ซื้อซ้ำเป็นรอบ (ทุก 7 วัน ทุกเดือน) ถ้าหลุดรอบไปเงียบ ๆ
--  มักไม่มีใครรู้จนผ่านไปหลายเดือน เพราะไม่มีใครนั่งไล่ดูว่าใครหายไป
--
--  หลักการที่เลือกใช้
--    1) รอบคำนวณจาก "มัธยฐาน" ของช่วงห่างระหว่างการซื้อ ไม่ใช่ค่าเฉลี่ย
--       เพราะการสั่งก้อนใหญ่ครั้งเดียวจะดึงค่าเฉลี่ยเพี้ยนทั้งชุด
--    2) ต้องมีประวัติซื้ออย่างน้อย 3 ครั้ง ถึงจะเดารอบให้
--       น้อยกว่านั้นยังไม่ใช่รูปแบบ เป็นแค่ความบังเอิญ
--    3) ค่าที่คนตั้งเองมีผลเหนือค่าที่ระบบคำนวณเสมอ
--       ฝ่ายขายรู้เงื่อนไขที่ตัวเลขไม่รู้ เช่นลูกค้าปิดโรงงานยาว
-- =====================================================================

alter table public.contacts
  add column if not exists is_regular       boolean not null default false,
  add column if not exists cycle_days       int,
  add column if not exists cycle_source     text check (cycle_source in ('manual','auto')),
  add column if not exists cycle_note       text,
  add column if not exists cycle_updated_at timestamptz;

comment on column public.contacts.cycle_days is
  'รอบการซื้อโดยประมาณเป็นวัน — ตั้งเองหรือให้ระบบคำนวณจากประวัติ';

create index if not exists contacts_regular_idx
  on public.contacts (company_id) where is_regular;

-- ------------------------------------------------------------------------
-- รอบการขายของลูกค้า พร้อมสถานะว่าใกล้ถึงรอบหรือเลยรอบไปแล้ว
--
-- security invoker ให้ RLS ของ contacts/documents กรองสิทธิ์เอง
-- ------------------------------------------------------------------------
create or replace function public.rpt_customer_cycles(
  p_company uuid,
  p_filter  text default 'all',   -- all | overdue | due_soon | untracked | regular
  p_q       text default null,
  p_limit   int default 100
)
returns json
language sql
stable
set search_path = public, app
as $$
with args as (
  select '%' || replace(replace(btrim(coalesce(p_q,'')),'%','\%'),'_','\_') || '%' as pat,
         nullif(btrim(coalesce(p_q,'')),'') as raw,
         least(greatest(coalesce(p_limit,100),1),300) as lim
),
-- เอกสารขายที่ถือว่า "เกิดการซื้อจริง" เท่านั้น
orders as (
  select d.contact_id, d.doc_date, d.grand_total
  from public.documents d
  where d.company_id = p_company
    and d.contact_id is not null
    and d.kind in ('invoice','tax_invoice','receipt')
    and d.status not in ('draft','void')
),
-- ช่วงห่างระหว่างการซื้อแต่ละครั้ง ใช้หามัธยฐาน
gaps as (
  select contact_id,
         doc_date - lag(doc_date) over (partition by contact_id order by doc_date) as gap
  from orders
),
stat as (
  select o.contact_id,
         count(*)                                   as order_count,
         max(o.doc_date)                            as last_order,
         min(o.doc_date)                            as first_order,
         sum(o.grand_total)                         as total_spend,
         (select percentile_cont(0.5) within group (order by g.gap)
          from gaps g where g.contact_id = o.contact_id and g.gap is not null) as median_gap
  from orders o
  group by o.contact_id
),
rows as (
  select
    c.id, c.code, c.name, c.kind::text as contact_kind, c.phone, c.email,
    c.is_regular, c.cycle_days, c.cycle_source, c.cycle_note, c.cycle_updated_at,
    coalesce(s.order_count, 0)  as order_count,
    s.last_order, s.first_order,
    coalesce(s.total_spend, 0)  as total_spend,
    -- เดารอบให้เมื่อมีประวัติพอ ปัดเป็นจำนวนวันเต็ม
    case when coalesce(s.order_count,0) >= 3 and s.median_gap is not null
         then greatest(1, round(s.median_gap)::int) end as suggested_days,
    -- รอบที่ใช้จริง : ค่าที่คนตั้งมาก่อน ถ้าไม่มีค่อยใช้ค่าที่คำนวณได้
    coalesce(c.cycle_days,
             case when coalesce(s.order_count,0) >= 3 and s.median_gap is not null
                  then greatest(1, round(s.median_gap)::int) end) as effective_days
  from public.contacts c
  left join stat s on s.contact_id = c.id
  cross join args
  where c.company_id = p_company
    and c.is_active
    and c.kind in ('customer','both')
    and (args.raw is null or c.name ilike args.pat or c.code ilike args.pat or c.phone ilike args.pat)
),
scored as (
  select r.*,
    case when r.effective_days is not null and r.last_order is not null
         then r.last_order + r.effective_days end as due_date,
    case when r.effective_days is not null and r.last_order is not null
         then (current_date - (r.last_order + r.effective_days)) end as days_late
  from rows r
),
tagged as (
  select s.*,
    case
      when s.effective_days is null then 'untracked'
      when s.days_late > 0          then 'overdue'
      -- เตือนล่วงหน้าเป็นสัดส่วนของรอบ รอบ 7 วันเตือนล่วงหน้า 2 วัน
      -- รอบ 90 วันเตือนล่วงหน้า 14 วัน ใช้ค่าคงที่ค่าเดียวจะเตือนผิดจังหวะทั้งคู่
      when s.days_late >= -greatest(2, least(14, (s.effective_days / 4))) then 'due_soon'
      else 'ok'
    end as cycle_status
  from scored s
)
select json_build_object(
  'rows', coalesce((
    select jsonb_agg(to_jsonb(x) order by
             case x.cycle_status when 'overdue' then 0 when 'due_soon' then 1
                                 when 'ok' then 2 else 3 end,
             x.days_late desc nulls last, x.name)
    from (
      select * from tagged
      where p_filter is null or p_filter = 'all'
         or (p_filter = 'regular'   and is_regular)
         or (p_filter = 'untracked' and cycle_status = 'untracked')
         or (p_filter in ('overdue','due_soon') and cycle_status = p_filter)
      limit (select lim from args)
    ) x
  ), '[]'::jsonb),
  'summary', json_build_object(
    'overdue',   (select count(*) from tagged where cycle_status = 'overdue'),
    'due_soon',  (select count(*) from tagged where cycle_status = 'due_soon'),
    'ok',        (select count(*) from tagged where cycle_status = 'ok'),
    'untracked', (select count(*) from tagged where cycle_status = 'untracked'),
    'regular',   (select count(*) from tagged where is_regular)
  )
);
$$;

grant execute on function public.rpt_customer_cycles(uuid, text, text, int) to authenticated;

-- ------------------------------------------------------------------------
-- ตั้งรอบการขายให้ลูกค้ารายหนึ่ง
-- ส่ง p_days เป็น null = เลิกตั้งเอง กลับไปใช้ค่าที่ระบบคำนวณ
-- ------------------------------------------------------------------------
create or replace function public.set_contact_cycle(
  p_contact   uuid,
  p_days      int default null,
  p_regular   boolean default null,
  p_note      text default null
)
returns json
language plpgsql
security definer
set search_path = public, app
as $$
declare v_company uuid;
begin
  select company_id into v_company from public.contacts where id = p_contact;
  if v_company is null then raise exception 'CONTACT_NOT_FOUND'; end if;

  if not app.has_perm(v_company, 'contacts', 'edit') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์แก้ไขผู้ติดต่อ';
  end if;

  if p_days is not null and (p_days < 1 or p_days > 730) then
    raise exception 'INVALID_CYCLE: รอบการขายต้องอยู่ระหว่าง 1 ถึง 730 วัน';
  end if;

  update public.contacts set
    cycle_days       = p_days,
    cycle_source     = case when p_days is null then null else 'manual' end,
    cycle_note       = coalesce(p_note, cycle_note),
    cycle_updated_at = now(),
    is_regular       = coalesce(p_regular, is_regular),
    updated_at       = now()
  where id = p_contact;

  return json_build_object('ok', true);
end $$;

grant execute on function public.set_contact_cycle(uuid, int, boolean, text) to authenticated;

comment on function public.set_contact_cycle is
  'ตั้งรอบการขายของลูกค้า — ค่าที่ตั้งเองมีผลเหนือค่าที่ระบบคำนวณจากประวัติ';
