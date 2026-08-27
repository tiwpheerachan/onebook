-- =====================================================================
-- 0038 : ต้นทุนแฝง (ใบปรับต้นทุนสินค้า)
--
--  ค่าขนส่ง อากรขาเข้า ภาษีสรรพสามิต ค่าผ่านท่า เป็นต้นทุนของสินค้า
--  ไม่ใช่ค่าใช้จ่ายประจำงวด ถ้าไม่ผลักเข้าต้นทุน กำไรขั้นต้นจะสูงเกินจริงตลอด
--
--  จุดที่ยากจริงและมักทำผิดกัน : ของบางส่วนขายไปแล้ว
--    ถ้าเอาต้นทุนที่เพิ่มไปบวกเข้าชั้น FIFO ทั้งก้อน
--    ส่วนที่ขายไปแล้วจะไม่มีวันถูกตัดเป็นต้นทุนขาย เพราะชั้นนั้นถูกใช้ไปแล้ว
--    มูลค่าสินค้าคงเหลือจะบวมเกินจริงและไม่มีวันหายไป
--
--    วิธีที่ถูกคือแยกตามสัดส่วน
--      ส่วนที่ยังอยู่ในคลัง → บวกเข้าต้นทุนของชั้นนั้น (สินค้าคงเหลือเพิ่ม)
--      ส่วนที่ขายไปแล้ว    → รับรู้เป็นต้นทุนขายทันที
--
--  การปันส่วนต้องลงตัวพอดีกับยอดค่าใช้จ่าย
--    ปัดเศษทีละรายการแล้วผลรวมจะขาดหรือเกินไม่กี่สตางค์ สมุดรายวันจะไม่สมดุล
--    จึงยกเศษที่เหลือทั้งหมดไปไว้ที่รายการใหญ่สุดรายการเดียว
-- =====================================================================

-- น้ำหนักใช้ปันส่วนค่าขนส่ง ซึ่งคิดตามน้ำหนักเป็นปกติ
alter table public.products add column if not exists weight_kg numeric(18,4);

do $$ begin
  create type landed_cost_status as enum ('draft','confirmed','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type landed_cost_method as enum ('value','qty','weight');
exception when duplicate_object then null; end $$;

create table if not exists public.landed_costs (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  doc_number   text not null,
  doc_date     date not null default current_date,
  -- เอกสารรับของที่ต้นทุนก้อนนี้จะไปเกาะ
  source_document_id uuid references public.documents(id),
  method       landed_cost_method not null default 'value',
  status       landed_cost_status not null default 'draft',
  note         text,
  journal_entry_id uuid,
  created_by   uuid references public.profiles(id),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (company_id, doc_number)
);

-- ค่าใช้จ่ายที่จะผลักเข้าต้นทุน พร้อมบัญชีที่ค่าใช้จ่ายนั้นนอนอยู่ตอนนี้
create table if not exists public.landed_cost_charges (
  id          uuid primary key default gen_random_uuid(),
  landed_id   uuid not null references public.landed_costs(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  description text not null,
  amount      numeric(18,2) not null check (amount > 0),
  account_id  uuid not null references public.accounts(id),
  contact_id  uuid references public.contacts(id),
  created_at  timestamptz not null default now()
);

create index if not exists landed_costs_company_idx on public.landed_costs (company_id, doc_date desc);
create index if not exists landed_cost_charges_idx on public.landed_cost_charges (landed_id);

alter table public.landed_costs        enable row level security;
alter table public.landed_costs        force  row level security;
alter table public.landed_cost_charges enable row level security;
alter table public.landed_cost_charges force  row level security;

drop policy if exists "lc_sel" on public.landed_costs;
create policy "lc_sel" on public.landed_costs for select to authenticated
  using (app.has_perm(company_id, 'products.inventory', 'view'));
drop policy if exists "lc_all" on public.landed_costs;
create policy "lc_all" on public.landed_costs for all to authenticated
  using (app.has_perm(company_id, 'products.inventory', 'edit'))
  with check (app.has_perm(company_id, 'products.inventory', 'edit'));

drop policy if exists "lcc_sel" on public.landed_cost_charges;
create policy "lcc_sel" on public.landed_cost_charges for select to authenticated
  using (app.has_perm(company_id, 'products.inventory', 'view'));
drop policy if exists "lcc_all" on public.landed_cost_charges;
create policy "lcc_all" on public.landed_cost_charges for all to authenticated
  using (app.has_perm(company_id, 'products.inventory', 'edit'))
  with check (app.has_perm(company_id, 'products.inventory', 'edit'));

-- ใบที่ยืนยันแล้วห้ามแตะ กันที่ฐานข้อมูล ไม่ใช่แค่ซ่อนปุ่ม
create or replace function app.lc_guard_confirmed()
returns trigger language plpgsql as $$
declare v_status landed_cost_status;
begin
  if tg_table_name = 'landed_costs' then
    if tg_op = 'UPDATE' and old.status = 'confirmed'
       and (new.status is distinct from old.status or new.method is distinct from old.method
            or new.doc_date is distinct from old.doc_date) then
      raise exception 'LC_CONFIRMED: ใบปรับต้นทุนที่ยืนยันแล้วแก้ไขไม่ได้';
    end if;
    if tg_op = 'DELETE' and old.status = 'confirmed' then
      raise exception 'LC_CONFIRMED: ใบปรับต้นทุนที่ยืนยันแล้วลบไม่ได้';
    end if;
    return coalesce(new, old);
  end if;

  select status into v_status from public.landed_costs where id = coalesce(new.landed_id, old.landed_id);
  if v_status = 'confirmed' then
    raise exception 'LC_CONFIRMED: ใบปรับต้นทุนที่ยืนยันแล้วแก้ไขไม่ได้';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists lc_guard on public.landed_costs;
create trigger lc_guard before update or delete on public.landed_costs
  for each row execute function app.lc_guard_confirmed();

drop trigger if exists lcc_guard on public.landed_cost_charges;
create trigger lcc_guard before insert or update or delete on public.landed_cost_charges
  for each row execute function app.lc_guard_confirmed();

-- ------------------------------------------------------------------------
-- ชั้นต้นทุนของเอกสารรับของใบหนึ่ง ใช้เป็นฐานปันส่วน
-- ------------------------------------------------------------------------
create or replace function public.rpt_landed_cost_base(
  p_company uuid, p_document uuid, p_method landed_cost_method default 'value'
)
returns json
language sql
stable
set search_path = public, app
as $$
  with layers as (
    select l.id as layer_id, l.product_id, p.sku, p.name, p.unit,
           l.qty, l.qty_remaining, l.unit_cost,
           round(l.qty * l.unit_cost, 2) as layer_value,
           coalesce(p.weight_kg, 0) * l.qty as layer_weight,
           w.code as warehouse_code
    from public.inventory_layers l
    join public.products p on p.id = l.product_id
    left join public.warehouses w on w.id = l.warehouse_id
    where l.company_id = p_company and l.document_id = p_document
  )
  select json_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'layer_id', layer_id, 'product_id', product_id, 'sku', sku, 'name', name, 'unit', unit,
        'warehouse_code', warehouse_code,
        'qty', qty, 'qty_remaining', qty_remaining, 'qty_used', qty - qty_remaining,
        'unit_cost', unit_cost, 'layer_value', layer_value, 'layer_weight', layer_weight,
        'basis', case p_method when 'qty' then qty
                               when 'weight' then layer_weight
                               else layer_value end
      ) order by sku) from layers
    ), '[]'::jsonb),
    'total_basis', coalesce((
      select sum(case p_method when 'qty' then qty when 'weight' then layer_weight else layer_value end)
      from layers), 0),
    'layer_count', (select count(*) from layers)
  );
$$;

grant execute on function public.rpt_landed_cost_base(uuid, uuid, landed_cost_method) to authenticated;

-- ------------------------------------------------------------------------
-- ยืนยันใบปรับต้นทุน
-- ------------------------------------------------------------------------
create or replace function public.confirm_landed_cost(p_landed uuid)
returns json
language plpgsql
security definer
set search_path = public, app
as $$
declare
  lc          public.landed_costs%rowtype;
  v_total     numeric(18,2);
  v_basis     numeric(18,6);
  v_entry     uuid;
  v_line      int := 0;
  v_to_stock  numeric(18,2) := 0;   -- ส่วนที่บวกเข้าสินค้าคงเหลือ
  v_to_cogs   numeric(18,2) := 0;   -- ส่วนที่ของขายไปแล้ว รับรู้เป็นต้นทุนขาย
  v_alloc_sum numeric(18,2) := 0;
  v_big       uuid;
  v_inv       uuid;
  v_cogs      uuid;
  r           record;
  v_alloc     numeric(18,2);
  v_stock_part numeric(18,2);
begin
  select * into lc from public.landed_costs where id = p_landed;
  if not found then raise exception 'LC_NOT_FOUND'; end if;

  if not app.has_perm(lc.company_id, 'products.inventory', 'edit') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์ปรับต้นทุนสินค้า';
  end if;
  if lc.status <> 'draft' then raise exception 'LC_NOT_DRAFT: ใบนี้ไม่ได้อยู่ในสถานะร่าง'; end if;
  if lc.source_document_id is null then raise exception 'LC_NO_SOURCE: ยังไม่ได้เลือกเอกสารรับของ'; end if;
  perform app.assert_period_open(lc.company_id, lc.doc_date);

  select coalesce(sum(amount), 0) into v_total
  from public.landed_cost_charges where landed_id = p_landed;
  if v_total <= 0 then raise exception 'LC_NO_CHARGE: ยังไม่ได้ใส่ค่าใช้จ่ายที่จะปันส่วน'; end if;

  -- ล็อกสถานะก่อนเริ่มปรับ กันยืนยันซ้ำจากสองหน้าจอพร้อมกัน
  update public.landed_costs
     set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now(), updated_at = now()
   where id = p_landed and status = 'draft';
  if not found then raise exception 'LC_RACE: ใบนี้ถูกยืนยันไปแล้ว'; end if;

  -- คำนวณการปันส่วนทั้งหมดลงตารางชั่วคราวก่อน แล้วค่อยแก้เศษทีเดียว
  -- ทำเป็นสองรอบแบบนี้อ่านง่ายและตรวจสอบได้ ดีกว่าพยายามคิดเศษระหว่างวน
  create temp table _lc_alloc on commit drop as
  select l.id as layer_id, l.qty, l.qty_remaining, l.unit_cost,
         case lc.method
           when 'qty'    then l.qty
           when 'weight' then coalesce(p.weight_kg, 0) * l.qty
           else round(l.qty * l.unit_cost, 2)
         end as basis,
         0::numeric(18,2) as alloc
  from public.inventory_layers l
  join public.products p on p.id = l.product_id
  where l.company_id = lc.company_id and l.document_id = lc.source_document_id;

  select coalesce(sum(basis), 0) into v_basis from _lc_alloc;
  if v_basis <= 0 then
    raise exception 'LC_NO_BASIS: เอกสารนี้ไม่มีฐานให้ปันส่วน (อาจไม่มีสินค้าที่ติดตามสต๊อก)';
  end if;

  update _lc_alloc set alloc = round(v_total * (basis / v_basis), 2);

  -- ปัดเศษทีละรายการทำให้ผลรวมขาดหรือเกินไม่กี่สตางค์ สมุดรายวันจะไม่สมดุล
  -- จึงยกส่วนต่างทั้งหมดไปไว้ที่รายการใหญ่สุดรายการเดียว
  select coalesce(sum(alloc), 0) into v_alloc_sum from _lc_alloc;
  select layer_id into v_big from _lc_alloc order by basis desc, layer_id limit 1;
  if v_alloc_sum <> v_total then
    update _lc_alloc set alloc = alloc + (v_total - v_alloc_sum) where layer_id = v_big;
  end if;

  v_inv  := app.acc(lc.company_id, 'inventory');
  v_cogs := app.acc(lc.company_id, 'cogs');

  for r in select * from _lc_alloc where alloc <> 0 order by basis desc, layer_id loop
    -- แบ่งตามสัดส่วนของที่ยังเหลือกับที่ขายไปแล้ว
    v_stock_part := case when r.qty > 0
                         then round(r.alloc * (r.qty_remaining / r.qty), 2)
                         else 0 end;

    if r.qty_remaining > 0 and v_stock_part <> 0 then
      update public.inventory_layers
         set unit_cost = round(((qty_remaining * unit_cost) + v_stock_part) / qty_remaining, 4)
       where id = r.layer_id;
    end if;

    v_to_stock := v_to_stock + v_stock_part;
    v_to_cogs  := v_to_cogs + (r.alloc - v_stock_part);
  end loop;

  -- กันเศษจากการแบ่งสองส่วน ให้สองข้างรวมกันเท่ากับค่าใช้จ่ายจริงเสมอ
  if v_to_stock + v_to_cogs <> v_total then
    v_to_cogs := v_total - v_to_stock;
  end if;

  insert into public.journal_entries(company_id, entry_number, entry_date, book, description,
    source_type, source_id, status, is_auto, created_by, posted_by, posted_at)
  values (lc.company_id, app.next_entry_number(lc.company_id, 'ADJ', lc.doc_date), lc.doc_date,
    'ADJ', 'ปรับต้นทุนสินค้า ' || lc.doc_number, 'landed_cost', p_landed,
    'posted', true, auth.uid(), auth.uid(), now())
  returning id into v_entry;

  if v_to_stock <> 0 then
    v_line := v_line + 1;
    insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
    values (v_entry, lc.company_id, v_line, v_inv, 'ต้นทุนแฝงเข้าสินค้าคงเหลือ', v_to_stock, 0);
  end if;
  if v_to_cogs <> 0 then
    v_line := v_line + 1;
    insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
    values (v_entry, lc.company_id, v_line, v_cogs, 'ต้นทุนแฝงของสินค้าที่ขายไปแล้ว', v_to_cogs, 0);
  end if;

  -- เครดิตคืนบัญชีที่ค่าใช้จ่ายนอนอยู่ ทีละรายการเพื่อให้ตามรอยได้
  for r in select * from public.landed_cost_charges where landed_id = p_landed order by created_at loop
    v_line := v_line + 1;
    insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
    values (v_entry, lc.company_id, v_line, r.account_id, r.description, 0, r.amount, r.contact_id);
  end loop;

  update public.landed_costs set journal_entry_id = v_entry where id = p_landed;

  return json_build_object('ok', true, 'total', v_total,
                           'to_inventory', v_to_stock, 'to_cogs', v_to_cogs,
                           'journal_entry_id', v_entry);
end $$;

grant execute on function public.confirm_landed_cost(uuid) to authenticated;

comment on function public.confirm_landed_cost is
  'ปันส่วนต้นทุนแฝงเข้าชั้น FIFO — ส่วนที่ยังอยู่ในคลังบวกเข้าต้นทุน ส่วนที่ขายไปแล้วรับรู้เป็นต้นทุนขายทันที';
