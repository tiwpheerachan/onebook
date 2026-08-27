-- =====================================================================
-- 0036 : หลายคลังสินค้า
--
--  เดิมทั้งระบบมีคลังเดียวโดยปริยาย ทั้ง inventory_moves และ inventory_layers
--  ไม่มีคอลัมน์บอกว่าอยู่คลังไหน ของที่รับเข้าคลัง A ตัดออกจากคลัง B ได้หมด
--
--  หัวใจของงานนี้คือ "ชั้นต้นทุน FIFO ต้องแยกตามคลัง"
--  ถ้าแยกแค่ยอดคงเหลือแต่ชั้นต้นทุนยังรวมกัน เวลาตัดขายจากคลังหนึ่ง
--  จะไปกินชั้นต้นทุนของอีกคลังได้ ต้นทุนขายจะผิดโดยไม่มีใครสังเกต
--
--  แนวทางที่ใช้เพื่อไม่ให้ของเดิมพัง
--    · พารามิเตอร์คลังของทุกฟังก์ชันมีค่าเริ่มต้น เป็น null = คลังหลัก
--      ผู้เรียกเดิมทั้งหมดจึงทำงานต่อได้โดยไม่ต้องแก้
--    · ย้ายข้อมูลเก่าเข้าคลังหลักที่สร้างให้อัตโนมัติ แล้วค่อยบังคับ not null
-- =====================================================================

create table if not exists public.warehouses (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code       text not null,
  name       text not null,
  address    text,
  note       text,
  is_default boolean not null default false,
  is_active  boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

-- คลังหลักมีได้บริษัทละหนึ่งแห่งเท่านั้น ใช้เป็นปลายทางเวลาไม่ระบุคลัง
create unique index if not exists warehouses_default_idx
  on public.warehouses (company_id) where is_default;

alter table public.warehouses enable row level security;
alter table public.warehouses force  row level security;

drop policy if exists "warehouses_sel" on public.warehouses;
create policy "warehouses_sel" on public.warehouses for select to authenticated
  using (app.has_perm(company_id, 'products.inventory', 'view'));
drop policy if exists "warehouses_all" on public.warehouses;
create policy "warehouses_all" on public.warehouses for all to authenticated
  using (app.has_perm(company_id, 'products.inventory', 'edit'))
  with check (app.has_perm(company_id, 'products.inventory', 'edit'));

-- ------------------------------------------------------------- สร้างคลังหลัก
-- ทุกบริษัทต้องมีคลังหลักเสมอ ไม่งั้นการรับของโดยไม่ระบุคลังจะไม่มีที่ลง
insert into public.warehouses (company_id, code, name, is_default, sort_order)
select c.id, 'MAIN', 'คลังหลัก', true, 0
from public.companies c
where not exists (select 1 from public.warehouses w where w.company_id = c.id)
on conflict (company_id, code) do nothing;

create or replace function app.default_warehouse(p_company uuid)
returns uuid language sql stable set search_path = public, app as $$
  select id from public.warehouses
  where company_id = p_company and is_default and is_active
  limit 1;
$$;

-- ------------------------------------------------------- เพิ่มคลังเข้าตารางสต๊อก
alter table public.inventory_moves  add column if not exists warehouse_id uuid references public.warehouses(id);
alter table public.inventory_layers add column if not exists warehouse_id uuid references public.warehouses(id);
alter table public.documents        add column if not exists warehouse_id uuid references public.warehouses(id);

-- ย้ายข้อมูลเดิมเข้าคลังหลัก ก่อนบังคับ not null
update public.inventory_moves m
   set warehouse_id = app.default_warehouse(m.company_id)
 where m.warehouse_id is null;
update public.inventory_layers l
   set warehouse_id = app.default_warehouse(l.company_id)
 where l.warehouse_id is null;

alter table public.inventory_moves  alter column warehouse_id set not null;
alter table public.inventory_layers alter column warehouse_id set not null;

create index if not exists inventory_moves_wh_idx
  on public.inventory_moves (company_id, warehouse_id, product_id, move_date);
-- ดัชนีนี้สำคัญกับความเร็วของการตัด FIFO เพราะต้องหาชั้นเก่าสุดของคลังนั้น
create index if not exists inventory_layers_wh_idx
  on public.inventory_layers (company_id, warehouse_id, product_id, received_at)
  where qty_remaining > 0;

-- =====================================================================
-- ฟังก์ชัน FIFO ที่รู้จักคลัง
--
-- ต้องลบลายเซ็นเดิมทิ้งก่อน ไม่ใช่แค่ create or replace
-- เพราะการเพิ่มพารามิเตอร์ถือเป็นฟังก์ชันคนละตัว จะกลายเป็นสองตัวซ้อนกัน
-- แล้วผู้เรียกเดิมที่ส่งพารามิเตอร์เท่าเดิมจะเจอ error ว่าเลือกไม่ถูกว่าจะเรียกตัวไหน
-- =====================================================================

drop function if exists app.inv_receive(uuid,uuid,date,numeric,numeric,uuid,text);
drop function if exists app.inv_issue(uuid,uuid,date,numeric,uuid,text);
drop function if exists public.inv_adjust(uuid,uuid,date,numeric,numeric,text);
drop function if exists public.rpt_stock_balance(uuid,date);
drop function if exists public.rpt_stock_card(uuid,uuid,date,date);

create or replace function app.inv_receive(
  p_company uuid, p_product uuid, p_date date,
  p_qty numeric, p_unit_cost numeric,
  p_document uuid default null, p_note text default null,
  p_warehouse uuid default null
) returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_move uuid; v_wh uuid;
begin
  if p_qty is null or p_qty <= 0 then return null; end if;
  v_wh := coalesce(p_warehouse, app.default_warehouse(p_company));
  if v_wh is null then raise exception 'NO_WAREHOUSE: บริษัทนี้ยังไม่มีคลังสินค้า'; end if;

  insert into public.inventory_moves(company_id, product_id, move_date, document_id,
    qty_in, qty_out, unit_cost, value_in, value_out, kind, note, created_by, warehouse_id)
  values (p_company, p_product, p_date, p_document,
    p_qty, 0, coalesce(p_unit_cost,0), round(p_qty * coalesce(p_unit_cost,0), 2), 0,
    'receive', p_note, auth.uid(), v_wh)
  returning id into v_move;

  insert into public.inventory_layers(company_id, product_id, move_id, document_id,
    received_at, qty, qty_remaining, unit_cost, note, warehouse_id)
  values (p_company, p_product, v_move, p_document,
    p_date, p_qty, p_qty, coalesce(p_unit_cost,0), p_note, v_wh);

  return v_move;
end $$;

create or replace function app.inv_issue(
  p_company uuid, p_product uuid, p_date date,
  p_qty numeric, p_document uuid default null, p_note text default null,
  p_warehouse uuid default null
) returns numeric language plpgsql security definer set search_path = public, app as $$
declare
  v_move      uuid;
  v_wh        uuid;
  v_left      numeric(18,4) := p_qty;
  v_total     numeric(18,2) := 0;
  v_take      numeric(18,4);
  v_fallback  numeric(18,6);
  l           record;
begin
  if p_qty is null or p_qty <= 0 then return 0; end if;
  v_wh := coalesce(p_warehouse, app.default_warehouse(p_company));
  if v_wh is null then raise exception 'NO_WAREHOUSE: บริษัทนี้ยังไม่มีคลังสินค้า'; end if;

  insert into public.inventory_moves(company_id, product_id, move_date, document_id,
    qty_in, qty_out, unit_cost, value_in, value_out, kind, note, created_by, warehouse_id)
  values (p_company, p_product, p_date, p_document, 0, p_qty, 0, 0, 0, 'issue', p_note, auth.uid(), v_wh)
  returning id into v_move;

  -- ตัดจากชั้นเก่าสุด "ของคลังนี้เท่านั้น"
  -- ถ้าไม่กรองคลัง ของที่ขายจากคลังหนึ่งจะไปกินต้นทุนของอีกคลัง ต้นทุนขายจะผิด
  for l in
    select id, qty_remaining, unit_cost
    from public.inventory_layers
    where company_id = p_company and product_id = p_product
      and warehouse_id = v_wh and qty_remaining > 0
    order by received_at, created_at, id
    for update
  loop
    exit when v_left <= 0;
    v_take := least(v_left, l.qty_remaining);

    update public.inventory_layers set qty_remaining = qty_remaining - v_take where id = l.id;

    insert into public.inventory_layer_uses(company_id, move_id, layer_id, qty, unit_cost, cost_amount)
    values (p_company, v_move, l.id, v_take, l.unit_cost, round(v_take * l.unit_cost, 2));

    v_total := v_total + round(v_take * l.unit_cost, 2);
    v_left  := v_left - v_take;
  end loop;

  -- ตัดเกินที่มีในคลังนี้ : ใช้ราคาชั้นล่าสุดของคลังเดียวกันก่อน
  -- ถ้าคลังนี้ไม่เคยมีของเลย ค่อยถอยไปดูคลังอื่นแล้วจึงใช้ราคาซื้อของสินค้า
  if v_left > 0 then
    select unit_cost into v_fallback
    from public.inventory_layers
    where company_id = p_company and product_id = p_product and warehouse_id = v_wh
    order by received_at desc, created_at desc limit 1;

    if v_fallback is null then
      select unit_cost into v_fallback
      from public.inventory_layers
      where company_id = p_company and product_id = p_product
      order by received_at desc, created_at desc limit 1;
    end if;

    if v_fallback is null then
      select purchase_price into v_fallback from public.products where id = p_product;
    end if;
    v_fallback := coalesce(v_fallback, 0);

    insert into public.inventory_layer_uses(company_id, move_id, layer_id, qty, unit_cost, cost_amount, is_shortfall)
    values (p_company, v_move, null, v_left, v_fallback, round(v_left * v_fallback, 2), true);

    v_total := v_total + round(v_left * v_fallback, 2);
  end if;

  update public.inventory_moves
     set value_out = v_total,
         unit_cost = case when p_qty > 0 then round(v_total / p_qty, 4) else 0 end
   where id = v_move;

  return v_total;
end $$;

-- ------------------------------------------------------------- ปรับปรุงสต๊อก
create or replace function public.inv_adjust(
  p_company uuid, p_product uuid, p_date date,
  p_qty_delta numeric, p_unit_cost numeric default null, p_note text default null,
  p_warehouse uuid default null
) returns json language plpgsql security definer set search_path = public, app as $$
declare v_move uuid; v_cost numeric; v_wh uuid;
begin
  if not app.has_perm(p_company, 'products.inventory', 'edit') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์ปรับปรุงสต๊อก';
  end if;
  perform app.assert_period_open(p_company, p_date);

  v_wh := coalesce(p_warehouse, app.default_warehouse(p_company));

  if p_qty_delta > 0 then
    v_cost := coalesce(p_unit_cost, (select purchase_price from public.products where id = p_product), 0);
    v_move := app.inv_receive(p_company, p_product, p_date, p_qty_delta, v_cost, null,
                              coalesce(p_note, 'ปรับปรุงสต๊อก'), v_wh);
  elsif p_qty_delta < 0 then
    perform app.inv_issue(p_company, p_product, p_date, -p_qty_delta, null,
                          coalesce(p_note, 'ปรับปรุงสต๊อก'), v_wh);
  end if;

  return json_build_object('ok', true);
end $$;

grant execute on function public.inv_adjust(uuid,uuid,date,numeric,numeric,text,uuid) to authenticated;

-- ------------------------------------------------------------- โอนย้ายระหว่างคลัง
-- ตัดออกจากคลังต้นทางตามต้นทุน FIFO แล้วรับเข้าคลังปลายทางด้วยต้นทุนเดียวกัน
-- มูลค่ารวมของกิจการไม่เปลี่ยน จึงไม่ต้องลงบัญชีกำไรขาดทุนใด ๆ
create or replace function public.inv_transfer(
  p_company uuid, p_product uuid, p_date date, p_qty numeric,
  p_from uuid, p_to uuid, p_note text default null
) returns json language plpgsql security definer set search_path = public, app as $$
declare v_cost numeric;
begin
  if not app.has_perm(p_company, 'products.inventory', 'edit') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์ย้ายสินค้า';
  end if;
  perform app.assert_period_open(p_company, p_date);

  if p_qty is null or p_qty <= 0 then raise exception 'INVALID_QTY: จำนวนต้องมากกว่าศูนย์'; end if;
  if p_from = p_to then raise exception 'SAME_WAREHOUSE: คลังต้นทางและปลายทางต้องต่างกัน'; end if;
  if not exists (select 1 from public.warehouses where id = p_from and company_id = p_company)
     or not exists (select 1 from public.warehouses where id = p_to and company_id = p_company) then
    raise exception 'WAREHOUSE_NOT_FOUND: ไม่พบคลังที่ระบุ';
  end if;

  v_cost := app.inv_issue(p_company, p_product, p_date, p_qty, null,
                          coalesce(p_note, 'โอนย้ายระหว่างคลัง'), p_from);

  perform app.inv_receive(p_company, p_product, p_date, p_qty,
                          case when p_qty > 0 then round(v_cost / p_qty, 4) else 0 end,
                          null, coalesce(p_note, 'โอนย้ายระหว่างคลัง'), p_to);

  return json_build_object('ok', true, 'cost', v_cost);
end $$;

grant execute on function public.inv_transfer(uuid,uuid,date,numeric,uuid,uuid,text) to authenticated;

-- =====================================================================
-- รายงานที่กรองตามคลังได้
-- =====================================================================

create or replace function public.rpt_stock_balance(
  p_company uuid, p_as_of date default current_date, p_warehouse uuid default null
)
returns table (
  product_id uuid, sku text, product_name text, unit text,
  qty_in numeric, qty_out numeric, qty_on_hand numeric,
  stock_value numeric, avg_unit_cost numeric
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
  )
  select p.id, p.sku, p.name, p.unit,
         coalesce(mv.qin,0), coalesce(mv.qout,0),
         coalesce(mv.qin,0) - coalesce(mv.qout,0),
         round(coalesce(mv.val,0), 2),
         case when coalesce(mv.qin,0) - coalesce(mv.qout,0) > 0
              then round(coalesce(mv.val,0) / (coalesce(mv.qin,0) - coalesce(mv.qout,0)), 4)
              else 0 end
  from public.products p
  left join mv on mv.product_id = p.id
  where p.company_id = p_company
    and p.track_inventory
    and (app.has_perm(p_company,'products.inventory','view') or app.has_perm(p_company,'report','view'))
    and (mv.product_id is not null or p.is_active)
  order by p.sku;
$$;

grant execute on function public.rpt_stock_balance(uuid, date, uuid) to authenticated;

-- ยอดคงเหลือแยกรายคลังของสินค้าตัวหนึ่ง — ใช้ตอบคำถาม "ของอยู่คลังไหนบ้าง"
create or replace function public.rpt_stock_by_warehouse(
  p_company uuid, p_product uuid default null, p_as_of date default current_date
)
returns json language sql stable set search_path = public, app as $$
  select coalesce(jsonb_agg(x order by x->>'warehouse_code'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'warehouse_id', w.id,
      'warehouse_code', w.code,
      'warehouse_name', w.name,
      'qty_on_hand', coalesce(sum(m.qty_in - m.qty_out), 0),
      'stock_value', round(coalesce(sum(m.value_in - m.value_out), 0), 2),
      'sku_count', count(distinct m.product_id) filter (where m.product_id is not null)
    ) as x
    from public.warehouses w
    left join public.inventory_moves m
      on m.warehouse_id = w.id
     and m.move_date <= p_as_of
     and (p_product is null or m.product_id = p_product)
    where w.company_id = p_company and w.is_active
    group by w.id, w.code, w.name
  ) t;
$$;

grant execute on function public.rpt_stock_by_warehouse(uuid, uuid, date) to authenticated;

create or replace function public.rpt_stock_card(
  p_company uuid, p_product uuid, p_from date, p_to date, p_warehouse uuid default null
) returns table (
  move_date date, kind text, doc_number text, note text,
  qty_in numeric, qty_out numeric, unit_cost numeric,
  value_in numeric, value_out numeric, warehouse_code text
) language sql stable security definer set search_path = public, app as $$
  select m.move_date, m.kind::text, d.doc_number, m.note,
         m.qty_in, m.qty_out, m.unit_cost, m.value_in, m.value_out, w.code
  from public.inventory_moves m
  left join public.documents d on d.id = m.document_id
  left join public.warehouses w on w.id = m.warehouse_id
  where m.company_id = p_company and m.product_id = p_product
    and m.move_date between p_from and p_to
    and (p_warehouse is null or m.warehouse_id = p_warehouse)
    and (app.has_perm(p_company,'products.inventory','view') or app.has_perm(p_company,'report','view'))
  order by m.move_date, m.created_at;
$$;

grant execute on function public.rpt_stock_card(uuid, uuid, date, date, uuid) to authenticated;

comment on table public.warehouses is
  'คลังสินค้า — ชั้นต้นทุน FIFO แยกตามคลัง การตัดขายจากคลังหนึ่งจะไม่กินต้นทุนของอีกคลัง';
