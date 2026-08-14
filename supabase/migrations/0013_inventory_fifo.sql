-- ============================================================================
-- ONEBOOK 0013 : ต้นทุนสินค้าแบบ FIFO (เข้าก่อน-ออกก่อน)
--
-- แนวคิด
--   ทุกครั้งที่รับสินค้าเข้า จะสร้าง "ชั้นต้นทุน" (layer) เก็บจำนวนและต้นทุนต่อหน่วย
--   เมื่อขายออก ระบบตัดจากชั้นที่เก่าที่สุดก่อน แล้วบันทึกว่าตัดจากชั้นไหนไปเท่าไร
--   (inventory_layer_uses) เพื่อให้ยกเลิกเอกสารแล้วคืนค่ากลับได้ตรงชั้นเดิม
--
--   ต้นทุนขายที่คำนวณได้จะถูกลงบัญชีอัตโนมัติตอนอนุมัติเอกสารขาย
--     เดบิต ต้นทุนขาย (cogs)  /  เครดิต สินค้าคงเหลือ (inventory)
--
-- สิทธิ์ : ใช้ resource 'products.inventory' ซึ่งครอบคลุมโดยสิทธิ์ 'products' เดิม
--          (app.has_perm รองรับสิทธิ์แบบลำดับชั้น) จึงไม่ต้องแก้บทบาทที่มีอยู่
-- ============================================================================

-- ---------------------------------------------------------------- ตารางเสริม
alter table public.inventory_moves
  add column if not exists kind       text,
  add column if not exists created_by uuid;

update public.inventory_moves
   set kind = case when qty_in > 0 then 'receive' else 'issue' end
 where kind is null;

alter table public.inventory_moves
  alter column kind set default 'receive';

do $$ begin
  alter table public.inventory_moves
    add constraint inventory_moves_kind_chk check (kind in ('receive','issue','adjust'));
exception when duplicate_object then null; end $$;

-- ชั้นต้นทุน FIFO : 1 แถว = การรับเข้า 1 ครั้งของสินค้า 1 ตัว
create table if not exists public.inventory_layers (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  product_id    uuid not null references public.products(id) on delete cascade,
  move_id       uuid references public.inventory_moves(id) on delete cascade,
  document_id   uuid references public.documents(id) on delete cascade,
  received_at   date not null,
  qty           numeric(18,4) not null check (qty > 0),
  qty_remaining numeric(18,4) not null check (qty_remaining >= 0),
  unit_cost     numeric(18,6) not null default 0,
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists inv_layers_fifo_idx
  on public.inventory_layers(company_id, product_id, received_at, created_at)
  where qty_remaining > 0;
create index if not exists inv_layers_doc_idx on public.inventory_layers(document_id);

-- การตัดชั้นต้นทุน : 1 แถว = ตัดจากชั้นไหน จำนวนเท่าไร ต้นทุนเท่าไร
create table if not exists public.inventory_layer_uses (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  move_id     uuid not null references public.inventory_moves(id) on delete cascade,
  layer_id    uuid references public.inventory_layers(id) on delete cascade,
  qty         numeric(18,4) not null,
  unit_cost   numeric(18,6) not null,
  cost_amount numeric(18,2) not null,
  -- true = ตัดขายเกินสต๊อกที่มี ระบบตีต้นทุนด้วยราคาล่าสุดไว้ก่อน
  is_shortfall boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists inv_uses_move_idx  on public.inventory_layer_uses(move_id);
create index if not exists inv_uses_layer_idx on public.inventory_layer_uses(layer_id);

alter table public.inventory_layers     enable row level security;
alter table public.inventory_layer_uses enable row level security;

drop policy if exists "inv_layers_sel" on public.inventory_layers;
drop policy if exists "inv_layers_all" on public.inventory_layers;
create policy "inv_layers_sel" on public.inventory_layers for select to authenticated
  using (app.has_perm(company_id, 'products.inventory', 'view'));
create policy "inv_layers_all" on public.inventory_layers for all to authenticated
  using (app.has_perm(company_id, 'products.inventory', 'edit'))
  with check (app.has_perm(company_id, 'products.inventory', 'edit'));

drop policy if exists "inv_uses_sel" on public.inventory_layer_uses;
drop policy if exists "inv_uses_all" on public.inventory_layer_uses;
create policy "inv_uses_sel" on public.inventory_layer_uses for select to authenticated
  using (app.has_perm(company_id, 'products.inventory', 'view'));
create policy "inv_uses_all" on public.inventory_layer_uses for all to authenticated
  using (app.has_perm(company_id, 'products.inventory', 'edit'))
  with check (app.has_perm(company_id, 'products.inventory', 'edit'));

-- ------------------------------------------------------------- รับสินค้าเข้า
create or replace function app.inv_receive(
  p_company uuid, p_product uuid, p_date date,
  p_qty numeric, p_unit_cost numeric,
  p_document uuid default null, p_note text default null
) returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_move uuid;
begin
  if p_qty is null or p_qty <= 0 then return null; end if;

  insert into public.inventory_moves(company_id, product_id, move_date, document_id,
    qty_in, qty_out, unit_cost, value_in, value_out, kind, note, created_by)
  values (p_company, p_product, p_date, p_document,
    p_qty, 0, coalesce(p_unit_cost,0), round(p_qty * coalesce(p_unit_cost,0), 2), 0,
    'receive', p_note, auth.uid())
  returning id into v_move;

  insert into public.inventory_layers(company_id, product_id, move_id, document_id,
    received_at, qty, qty_remaining, unit_cost, note)
  values (p_company, p_product, v_move, p_document,
    p_date, p_qty, p_qty, coalesce(p_unit_cost,0), p_note);

  return v_move;
end $$;

-- ------------------------------------------------------------- ตัดสินค้าออก
-- คืนค่า : ต้นทุนรวมของจำนวนที่ตัดออก (ใช้ลงบัญชีต้นทุนขาย)
create or replace function app.inv_issue(
  p_company uuid, p_product uuid, p_date date,
  p_qty numeric, p_document uuid default null, p_note text default null
) returns numeric language plpgsql security definer set search_path = public, app as $$
declare
  v_move      uuid;
  v_left      numeric(18,4) := p_qty;
  v_total     numeric(18,2) := 0;
  v_take      numeric(18,4);
  v_fallback  numeric(18,6);
  l           record;
begin
  if p_qty is null or p_qty <= 0 then return 0; end if;

  insert into public.inventory_moves(company_id, product_id, move_date, document_id,
    qty_in, qty_out, unit_cost, value_in, value_out, kind, note, created_by)
  values (p_company, p_product, p_date, p_document, 0, p_qty, 0, 0, 0, 'issue', p_note, auth.uid())
  returning id into v_move;

  -- ตัดจากชั้นเก่าสุดก่อน
  for l in
    select id, qty_remaining, unit_cost
    from public.inventory_layers
    where company_id = p_company and product_id = p_product and qty_remaining > 0
    order by received_at, created_at, id
    for update
  loop
    exit when v_left <= 0;
    v_take := least(v_left, l.qty_remaining);

    update public.inventory_layers
       set qty_remaining = qty_remaining - v_take
     where id = l.id;

    insert into public.inventory_layer_uses(company_id, move_id, layer_id, qty, unit_cost, cost_amount)
    values (p_company, v_move, l.id, v_take, l.unit_cost, round(v_take * l.unit_cost, 2));

    v_total := v_total + round(v_take * l.unit_cost, 2);
    v_left  := v_left - v_take;
  end loop;

  -- ขายเกินสต๊อก : ตีต้นทุนด้วยราคาชั้นล่าสุด ถ้าไม่มีใช้ราคาซื้อของสินค้า
  if v_left > 0 then
    select unit_cost into v_fallback
    from public.inventory_layers
    where company_id = p_company and product_id = p_product
    order by received_at desc, created_at desc limit 1;

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

-- --------------------------------------------- ปรับปรุงสต๊อก (นับสต๊อก/ผลต่าง)
create or replace function public.inv_adjust(
  p_company uuid, p_product uuid, p_date date,
  p_qty_delta numeric, p_unit_cost numeric default null, p_note text default null
) returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_move uuid; v_cost numeric;
begin
  if not app.has_perm(p_company, 'products.inventory', 'edit') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์ปรับปรุงสต๊อก';
  end if;
  perform app.assert_period_open(p_company, p_date, 'all');
  if p_qty_delta is null or p_qty_delta = 0 then return null; end if;

  if p_qty_delta > 0 then
    v_cost := coalesce(p_unit_cost, (select purchase_price from public.products where id = p_product), 0);
    v_move := app.inv_receive(p_company, p_product, p_date, p_qty_delta, v_cost, null,
                              coalesce(p_note, 'ปรับปรุงสต๊อก'));
  else
    perform app.inv_issue(p_company, p_product, p_date, -p_qty_delta, null,
                          coalesce(p_note, 'ปรับปรุงสต๊อก'));
    select id into v_move from public.inventory_moves
     where company_id = p_company and product_id = p_product and kind = 'issue'
     order by created_at desc limit 1;
  end if;

  update public.inventory_moves set kind = 'adjust' where id = v_move;
  return v_move;
end $$;

-- ------------------------------------------- คืนค่าสต๊อกเมื่อยกเลิกเอกสาร
create or replace function app.inv_reverse_document(p_document uuid)
returns void language plpgsql security definer set search_path = public, app as $$
declare u record; m record; v_used numeric;
begin
  -- 1) คืนจำนวนที่เคยตัดออกกลับเข้าชั้นเดิม
  for u in
    select lu.* from public.inventory_layer_uses lu
    join public.inventory_moves mv on mv.id = lu.move_id
    where mv.document_id = p_document
  loop
    if u.layer_id is not null then
      update public.inventory_layers
         set qty_remaining = qty_remaining + u.qty
       where id = u.layer_id;
    end if;
    delete from public.inventory_layer_uses where id = u.id;
  end loop;

  -- 2) ลบชั้นที่เกิดจากเอกสารนี้ (ถ้าถูกตัดไปแล้วบางส่วน ต้องยกเลิกเอกสารที่ตัดก่อน)
  for m in
    select * from public.inventory_layers where document_id = p_document
  loop
    if m.qty_remaining < m.qty then
      v_used := m.qty - m.qty_remaining;
      raise exception 'INVENTORY_LAYER_CONSUMED: สินค้าจากเอกสารนี้ถูกตัดขายไปแล้ว % หน่วย กรุณายกเลิกเอกสารขายที่เกี่ยวข้องก่อน', v_used;
    end if;
    delete from public.inventory_layers where id = m.id;
  end loop;

  delete from public.inventory_moves where document_id = p_document;
end $$;

-- ------------------------------------------------------------------ รายงาน
-- ยอดคงเหลือและมูลค่าสินค้าคงคลัง ณ วันที่กำหนด
create or replace function public.rpt_stock_balance(p_company uuid, p_as_of date default current_date)
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

-- การ์ดสินค้า : ความเคลื่อนไหวรายตัว
create or replace function public.rpt_stock_card(
  p_company uuid, p_product uuid, p_from date, p_to date
) returns table (
  move_date date, kind text, doc_number text, note text,
  qty_in numeric, qty_out numeric, unit_cost numeric,
  value_in numeric, value_out numeric, running_qty numeric
) language sql stable security definer set search_path = public, app as $$
  select m.move_date, m.kind, d.doc_number, m.note,
         m.qty_in, m.qty_out, m.unit_cost, m.value_in, m.value_out,
         sum(m.qty_in - m.qty_out) over (order by m.move_date, m.created_at
                                         rows between unbounded preceding and current row)
  from public.inventory_moves m
  left join public.documents d on d.id = m.document_id
  where m.company_id = p_company
    and m.product_id = p_product
    and m.move_date between p_from and p_to
    and (app.has_perm(p_company,'products.inventory','view') or app.has_perm(p_company,'report','view'))
  order by m.move_date, m.created_at;
$$;

grant execute on function public.inv_adjust(uuid,uuid,date,numeric,numeric,text) to authenticated;
grant execute on function public.rpt_stock_balance(uuid,date) to authenticated;
grant execute on function public.rpt_stock_card(uuid,uuid,date,date) to authenticated;
