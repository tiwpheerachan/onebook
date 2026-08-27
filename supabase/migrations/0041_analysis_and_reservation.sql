-- =====================================================================
-- 0041 : วิเคราะห์ขาย-ซื้อเชิงลึก และการจองสินค้าที่กันสต๊อก
--
--  ส่วนที่ 1 : วิเคราะห์
--    เดิมมีแค่ภาพรวมรายรับ-รายจ่ายเป็นยอดรวม ตอบไม่ได้ว่า
--    สินค้าตัวไหนขายดี กลุ่มไหนทำกำไร ลูกค้ารายไหนซื้อเยอะสุด
--
--    คิดจากบรรทัดรายการในเอกสาร ไม่ใช่จากสมุดรายวัน
--    เพราะสมุดรายวันรวมยอดตามบัญชีแล้ว แยกกลับเป็นรายสินค้าไม่ได้
--
--  ส่วนที่ 2 : การจอง
--    ใบเสนอราคาที่ลูกค้าตกลงแล้วควรกันของไว้ ไม่งั้นอีกคนขายตัดหน้าไป
--    การจองไม่แตะสต๊อกจริงและไม่ลงบัญชี เพราะยังไม่มีการส่งมอบ
--    แต่ไปลดยอด "พร้อมขาย" ในรายงาน ซึ่งเป็นตัวเลขที่ฝ่ายขายต้องดู
-- =====================================================================

-- ------------------------------------------------------------------------
-- วิเคราะห์ยอดขายหรือยอดซื้อ แยกตามมิติที่เลือก
-- ------------------------------------------------------------------------
create or replace function public.rpt_sales_analysis(
  p_company uuid,
  p_from    date,
  p_to      date,
  p_side    text default 'sales',    -- sales | purchase
  p_dim     text default 'product',  -- product | group | contact
  p_limit   int  default 50
)
returns json
language sql
stable
set search_path = public, app
as $$
with lines as (
  select
    dl.product_id, p.sku, p.name as product_name, p.group_id,
    g.code as group_code, g.name as group_name,
    d.contact_id, coalesce(c.name, d.contact_snapshot->>'name') as contact_name,
    dl.quantity,
    dl.line_amount,
    -- ต้นทุนของบรรทัดนั้นจากที่ตัดสต๊อกจริง ไม่ใช่ราคาซื้อล่าสุด
    coalesce((
      select sum(m.value_out) from public.inventory_moves m
      where m.document_id = d.id and m.product_id = dl.product_id
    ), 0) as cost_amount
  from public.document_lines dl
  join public.documents d on d.id = dl.document_id
  left join public.products p on p.id = dl.product_id
  left join public.product_groups g on g.id = p.group_id
  left join public.contacts c on c.id = d.contact_id
  where d.company_id = p_company
    and d.status not in ('draft','void')
    and d.doc_date between p_from and p_to
    and (case when p_side = 'purchase'
              then d.kind::text in ('bill','expense','purchase_credit_note')
              else d.kind::text in ('invoice','tax_invoice','receipt','credit_note') end)
    and (app.has_perm(p_company,'report','view') or app.has_perm(p_company,'documents','view'))
),
grouped as (
  select
    case p_dim when 'group'   then coalesce(group_code, '—')
               when 'contact' then coalesce(contact_name, '—')
               else coalesce(sku, '—') end as key_code,
    case p_dim when 'group'   then coalesce(group_name, '(ไม่อยู่ในกลุ่ม)')
               when 'contact' then coalesce(contact_name, '(ไม่ระบุคู่ค้า)')
               else coalesce(product_name, '(ไม่ระบุสินค้า)') end as key_name,
    sum(quantity)                   as qty,
    sum(line_amount)                as amount,
    sum(cost_amount)                as cost,
    count(distinct contact_id)      as party_count
  from lines
  group by 1, 2
)
select json_build_object(
  'rows', coalesce((
    select jsonb_agg(jsonb_build_object(
      'code', key_code, 'name', key_name,
      'qty', qty, 'amount', round(amount, 2), 'cost', round(cost, 2),
      'margin', round(amount - cost, 2),
      'margin_pct', case when amount <> 0 then round((amount - cost) / amount * 100, 1) else null end,
      'party_count', party_count
    ) order by amount desc)
    from (select * from grouped order by amount desc limit least(greatest(coalesce(p_limit,50),1),500)) x
  ), '[]'::jsonb),
  'total', json_build_object(
    'amount', coalesce((select round(sum(amount),2) from grouped), 0),
    'cost',   coalesce((select round(sum(cost),2) from grouped), 0),
    'margin', coalesce((select round(sum(amount) - sum(cost),2) from grouped), 0),
    'keys',   (select count(*) from grouped)
  )
);
$$;

grant execute on function public.rpt_sales_analysis(uuid, date, date, text, text, int) to authenticated;

-- =====================================================================
-- การจองสินค้า
-- =====================================================================

do $$ begin
  create type reservation_status as enum ('active','released','fulfilled');
exception when duplicate_object then null; end $$;

create table if not exists public.stock_reservations (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  document_id  uuid references public.documents(id) on delete cascade,
  product_id   uuid not null references public.products(id),
  warehouse_id uuid not null references public.warehouses(id),
  qty          numeric(18,4) not null check (qty > 0),
  status       reservation_status not null default 'active',
  expires_at   date,
  note         text,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists reservations_active_idx
  on public.stock_reservations (company_id, product_id, warehouse_id) where status = 'active';

alter table public.stock_reservations enable row level security;
alter table public.stock_reservations force  row level security;

drop policy if exists "resv_sel" on public.stock_reservations;
create policy "resv_sel" on public.stock_reservations for select to authenticated
  using (app.has_perm(company_id, 'products.inventory', 'view'));
drop policy if exists "resv_all" on public.stock_reservations;
create policy "resv_all" on public.stock_reservations for all to authenticated
  using (app.has_perm(company_id, 'products.inventory', 'edit'))
  with check (app.has_perm(company_id, 'products.inventory', 'edit'));

-- ------------------------------------------------------------------------
-- จองสินค้าตามเอกสาร
--
-- จองได้ไม่เกินของที่ยังพร้อมขาย ไม่งั้นการจองจะกลายเป็นตัวเลขลอย ๆ
-- ที่ไม่มีของรองรับ แล้วฝ่ายขายจะรับปากลูกค้าเกินของที่มี
-- ------------------------------------------------------------------------
create or replace function public.reserve_stock(
  p_company   uuid,
  p_product   uuid,
  p_warehouse uuid,
  p_qty       numeric,
  p_document  uuid default null,
  p_expires   date default null,
  p_note      text default null
)
returns json
language plpgsql
security definer
set search_path = public, app
as $$
declare v_onhand numeric; v_reserved numeric; v_available numeric; v_id uuid;
begin
  if not app.has_perm(p_company, 'products.inventory', 'edit') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์จองสินค้า';
  end if;
  if p_qty is null or p_qty <= 0 then raise exception 'INVALID_QTY: จำนวนต้องมากกว่าศูนย์'; end if;
  if not exists (select 1 from public.warehouses where id = p_warehouse and company_id = p_company) then
    raise exception 'WAREHOUSE_NOT_FOUND: ไม่พบคลังที่ระบุ';
  end if;

  select coalesce(sum(qty_in - qty_out), 0) into v_onhand
  from public.inventory_moves
  where company_id = p_company and product_id = p_product and warehouse_id = p_warehouse;

  select coalesce(sum(qty), 0) into v_reserved
  from public.stock_reservations
  where company_id = p_company and product_id = p_product
    and warehouse_id = p_warehouse and status = 'active';

  v_available := v_onhand - v_reserved;
  if p_qty > v_available then
    raise exception 'NOT_ENOUGH: ของพร้อมขายเหลือ % ชิ้น จองเกินไม่ได้', v_available;
  end if;

  insert into public.stock_reservations
    (company_id, document_id, product_id, warehouse_id, qty, expires_at, note, created_by)
  values (p_company, p_document, p_product, p_warehouse, p_qty, p_expires, p_note, auth.uid())
  returning id into v_id;

  return json_build_object('ok', true, 'id', v_id, 'available_before', v_available);
end $$;

grant execute on function public.reserve_stock(uuid, uuid, uuid, numeric, uuid, date, text) to authenticated;

-- ปล่อยการจอง — ใช้ตอนลูกค้ายกเลิก หรือของถูกส่งมอบไปแล้ว
create or replace function public.release_reservation(
  p_reservation uuid,
  p_fulfilled   boolean default false
)
returns json
language plpgsql
security definer
set search_path = public, app
as $$
declare v_company uuid;
begin
  select company_id into v_company from public.stock_reservations where id = p_reservation;
  if v_company is null then raise exception 'RESERVATION_NOT_FOUND'; end if;

  if not app.has_perm(v_company, 'products.inventory', 'edit') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์จัดการการจอง';
  end if;

  update public.stock_reservations
     set status = (case when p_fulfilled then 'fulfilled' else 'released' end)::reservation_status,
         updated_at = now()
   where id = p_reservation and status = 'active';
  if not found then raise exception 'NOT_ACTIVE: การจองนี้ถูกปิดไปแล้ว'; end if;

  return json_build_object('ok', true);
end $$;

grant execute on function public.release_reservation(uuid, boolean) to authenticated;

-- ------------------------------------------------------------------------
-- ยอดคงเหลือที่แยก "ของที่มี" กับ "ของที่พร้อมขาย"
--
-- ต้อง drop ก่อนเพราะเพิ่มคอลัมน์ในผลลัพธ์ ถือเป็นฟังก์ชันคนละตัว
-- ------------------------------------------------------------------------
drop function if exists public.rpt_stock_balance(uuid, date, uuid);

create or replace function public.rpt_stock_balance(
  p_company uuid, p_as_of date default current_date, p_warehouse uuid default null
)
returns table (
  product_id uuid, sku text, product_name text, unit text,
  qty_in numeric, qty_out numeric, qty_on_hand numeric,
  stock_value numeric, avg_unit_cost numeric,
  qty_reserved numeric, qty_available numeric
) language sql stable security definer set search_path = public, app as $$
  with mv as (
    select m.product_id,
           sum(m.qty_in)  as qin,
           sum(m.qty_out) as qout,
           sum(m.value_in) - sum(m.value_out) as val
    from public.inventory_moves m
    where m.company_id = p_company and m.move_date <= p_as_of
      and (p_warehouse is null or m.warehouse_id = p_warehouse)
    group by m.product_id
  ),
  rv as (
    select r.product_id, sum(r.qty) as qty
    from public.stock_reservations r
    where r.company_id = p_company and r.status = 'active'
      and (p_warehouse is null or r.warehouse_id = p_warehouse)
    group by r.product_id
  )
  select p.id, p.sku, p.name, p.unit,
         coalesce(mv.qin,0), coalesce(mv.qout,0),
         coalesce(mv.qin,0) - coalesce(mv.qout,0),
         round(coalesce(mv.val,0), 2),
         case when coalesce(mv.qin,0) - coalesce(mv.qout,0) > 0
              then round(coalesce(mv.val,0) / (coalesce(mv.qin,0) - coalesce(mv.qout,0)), 4)
              else 0 end,
         coalesce(rv.qty, 0),
         coalesce(mv.qin,0) - coalesce(mv.qout,0) - coalesce(rv.qty, 0)
  from public.products p
  left join mv on mv.product_id = p.id
  left join rv on rv.product_id = p.id
  where p.company_id = p_company
    and p.track_inventory
    and (app.has_perm(p_company,'products.inventory','view') or app.has_perm(p_company,'report','view'))
    and (mv.product_id is not null or p.is_active)
  order by p.sku;
$$;

grant execute on function public.rpt_stock_balance(uuid, date, uuid) to authenticated;

-- รายการจองที่ยังค้างอยู่
create or replace function public.rpt_reservations(p_company uuid, p_only_active boolean default true)
returns json
language sql
stable
set search_path = public, app
as $$
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', r.id, 'qty', r.qty, 'status', r.status::text,
      'expires_at', r.expires_at, 'note', r.note, 'created_at', r.created_at,
      'sku', p.sku, 'product_name', p.name, 'unit', p.unit,
      'warehouse_code', w.code, 'warehouse_name', w.name,
      'doc_number', d.doc_number, 'document_id', d.id,
      'contact_name', coalesce(c.name, d.contact_snapshot->>'name'),
      'expired', (r.expires_at is not null and r.expires_at < current_date and r.status = 'active')
    ) as x
    from public.stock_reservations r
    join public.products p on p.id = r.product_id
    join public.warehouses w on w.id = r.warehouse_id
    left join public.documents d on d.id = r.document_id
    left join public.contacts c on c.id = d.contact_id
    where r.company_id = p_company
      and (not p_only_active or r.status = 'active')
  ) t;
$$;

grant execute on function public.rpt_reservations(uuid, boolean) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['stock_reservations'] loop
    execute format('drop trigger if exists trg_audit_%1$s on public.%1$s', t);
    execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$s '
                   'for each row execute function app.audit_trigger()', t);
    execute format('drop trigger if exists trg_touch_%1$s on public.%1$s', t);
    execute format('create trigger trg_touch_%1$s before update on public.%1$s '
                   'for each row execute function app.touch_updated_at()', t);
  end loop;
end $$;

comment on table public.stock_reservations is
  'การจองสินค้า — ไม่แตะสต๊อกจริงและไม่ลงบัญชี แต่ลดยอดพร้อมขายในรายงาน';
