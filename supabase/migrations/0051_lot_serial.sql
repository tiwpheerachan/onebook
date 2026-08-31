-- =====================================================================
-- 0051 : ทะเบียนหมายเลขสินค้า — ล็อตและหมายเลขเครื่อง
--
--  ช่องว่างที่เจอ : ตอนนี้ตามรอยสินค้าได้ลึกสุดแค่ระดับรหัสสินค้ากับคลัง
--  รู้ว่ามีของกี่ชิ้นอยู่คลังไหน แต่ไม่รู้ว่าชิ้นไหนไปอยู่กับลูกค้าคนไหน
--  พอต้องเรียกคืนสินค้าทั้งล็อตหรือเคลมประกันจึงตอบไม่ได้
--  Express มีเมนู 2.ขาย → 9. ทะเบียนหมายเลขสินค้า ไว้ทำเรื่องนี้โดยเฉพาะ
--
--  ขอบเขตที่เลือกและเหตุผล
--
--  ทะเบียนนี้เป็น "ชั้นตามรอย" ที่วางขนานกับระบบต้นทุน ไม่ใช่มิติของต้นทุน
--  ต้นทุนยังคิดแบบ FIFO ตาม inventory_layers เหมือนเดิมทุกประการ
--  เพราะการเปลี่ยนให้คิดต้นทุนรายล็อตต้องรื้อเครื่องคิดต้นทุนทั้งตัว
--  ซึ่งเสี่ยงกว่าประโยชน์ที่ได้มาก และของเดิมทำงานถูกอยู่แล้ว
--
--  ผลที่ตามมาคือทะเบียนกับสต๊อกอาจไม่ตรงกันได้ถ้าคนลืมระบุล็อต
--  จึงมีรายงานกระทบยอดไว้ให้เห็นส่วนต่าง แทนที่จะบังคับจนใช้งานไม่ได้
--
--  ล็อตกับหมายเลขเครื่องใช้โครงสร้างเดียวกัน หมายเลขเครื่องคือล็อตที่มีของชิ้นเดียว
--  แยกเป็นสองตารางไม่ได้ประโยชน์อะไรนอกจากโค้ดซ้ำสองชุด
-- =====================================================================

-- สินค้าแต่ละตัวเลือกได้ว่าจะตามรอยระดับไหน
alter table public.products
  add column if not exists tracking text not null default 'none';

alter table public.products drop constraint if exists products_tracking_chk;
alter table public.products add constraint products_tracking_chk
  check (tracking in ('none','lot','serial'));

comment on column public.products.tracking is
  'ระดับการตามรอย — none ไม่ตาม, lot ตามเป็นล็อต, serial ตามเป็นชิ้นด้วยหมายเลขเครื่อง';

-- ------------------------------------------------------------------------
-- ทะเบียนล็อต / หมายเลขเครื่อง
-- ------------------------------------------------------------------------
create table if not exists public.product_lots (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  product_id   uuid not null references public.products(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id),
  lot_no       text not null,
  mfg_date     date,
  expiry_date  date,
  -- ยอดรับและยอดจ่ายสะสม ทริกเกอร์คำนวณจาก lot_movements ห้ามแก้มือ
  qty_received numeric(18,4) not null default 0,
  qty_issued   numeric(18,4) not null default 0,
  note         text,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- หมายเลขห้ามซ้ำภายในบริษัทเดียวกัน ไม่แยกตามคลัง
  -- เพราะของชิ้นเดิมย้ายคลังได้ แต่ยังเป็นชิ้นเดิม
  unique (company_id, product_id, lot_no)
);

create index if not exists product_lots_stock_idx
  on public.product_lots (company_id, product_id, warehouse_id)
  where qty_received > qty_issued;
create index if not exists product_lots_expiry_idx
  on public.product_lots (company_id, expiry_date)
  where expiry_date is not null;
create index if not exists product_lots_no_idx
  on public.product_lots (company_id, lot_no);

-- ------------------------------------------------------------------------
-- การเคลื่อนไหวของแต่ละล็อต — หัวใจของการตามรอย
-- ------------------------------------------------------------------------
create table if not exists public.lot_movements (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  lot_id      uuid not null references public.product_lots(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  move_date   date not null default current_date,
  qty_in      numeric(18,4) not null default 0,
  qty_out     numeric(18,4) not null default 0,
  note        text,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  constraint lot_move_one_side check ((qty_in > 0 and qty_out = 0) or (qty_out > 0 and qty_in = 0))
);

create index if not exists lot_moves_lot_idx on public.lot_movements (lot_id, move_date);
create index if not exists lot_moves_doc_idx on public.lot_movements (document_id);

alter table public.product_lots  enable row level security;
alter table public.product_lots  force  row level security;
alter table public.lot_movements enable row level security;
alter table public.lot_movements force  row level security;

drop policy if exists "lots_sel" on public.product_lots;
create policy "lots_sel" on public.product_lots for select to authenticated
  using (app.has_perm(company_id, 'products.inventory', 'view'));
drop policy if exists "lots_all" on public.product_lots;
create policy "lots_all" on public.product_lots for all to authenticated
  using (app.has_perm(company_id, 'products.inventory', 'edit'))
  with check (app.has_perm(company_id, 'products.inventory', 'edit'));

drop policy if exists "lotmv_sel" on public.lot_movements;
create policy "lotmv_sel" on public.lot_movements for select to authenticated
  using (app.has_perm(company_id, 'products.inventory', 'view'));
drop policy if exists "lotmv_all" on public.lot_movements;
create policy "lotmv_all" on public.lot_movements for all to authenticated
  using (app.has_perm(company_id, 'products.inventory', 'edit'))
  with check (app.has_perm(company_id, 'products.inventory', 'edit'));

do $$
declare t text;
begin
  foreach t in array array['product_lots','lot_movements'] loop
    execute format('drop trigger if exists trg_audit_%1$s on public.%1$s', t);
    execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$s '
                   'for each row execute function app.audit_trigger()', t);
  end loop;
end $$;

drop trigger if exists trg_touch_product_lots on public.product_lots;
create trigger trg_touch_product_lots before update on public.product_lots
  for each row execute function app.touch_updated_at();

-- ------------------------------------------------------------------------
-- ยอดสะสมของล็อตคำนวณจากการเคลื่อนไหวเสมอ
--
-- เก็บเป็นยอดสะสมเพื่อให้ค้นเร็ว แต่แหล่งความจริงคือ lot_movements
-- ------------------------------------------------------------------------
create or replace function app.sync_lot_totals()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare v_lot uuid;
begin
  v_lot := coalesce(new.lot_id, old.lot_id);
  update public.product_lots l
     set qty_received = coalesce((select sum(m.qty_in)  from public.lot_movements m where m.lot_id = v_lot), 0),
         qty_issued   = coalesce((select sum(m.qty_out) from public.lot_movements m where m.lot_id = v_lot), 0),
         updated_at   = now()
   where l.id = v_lot;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_lot_totals on public.lot_movements;
create trigger trg_lot_totals
  after insert or update or delete on public.lot_movements
  for each row execute function app.sync_lot_totals();

-- ------------------------------------------------------------------------
-- รับของเข้าทะเบียน
--
-- หมายเลขเครื่องรับซ้ำไม่ได้เด็ดขาด เพราะของชิ้นเดียวมีหมายเลขเดียว
-- ถ้ายอมให้รับซ้ำ การตามรอยจะชี้ไปสองที่พร้อมกันและเชื่อถือไม่ได้อีกเลย
-- ------------------------------------------------------------------------
create or replace function public.lot_receive(
  p_company   uuid,
  p_product   uuid,
  p_warehouse uuid,
  p_lot_no    text,
  p_qty       numeric,
  p_expiry    date default null,
  p_document  uuid default null,
  p_mfg       date default null,
  p_note      text default null
)
returns json
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_track text;
  v_lot   uuid;
  v_no    text;
  v_exists numeric;
begin
  if not app.has_perm(p_company, 'products.inventory', 'edit') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์จัดการทะเบียนสินค้า';
  end if;

  v_no := nullif(btrim(coalesce(p_lot_no, '')), '');
  if v_no is null then raise exception 'LOT_NO_REQUIRED: ต้องระบุหมายเลขล็อตหรือหมายเลขเครื่อง'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'INVALID_QTY: จำนวนต้องมากกว่าศูนย์'; end if;

  select tracking into v_track from public.products
  where id = p_product and company_id = p_company;
  if v_track is null then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if v_track = 'none' then
    raise exception 'NOT_TRACKED: สินค้านี้ไม่ได้ตั้งให้ตามรอยด้วยล็อตหรือหมายเลขเครื่อง';
  end if;
  if v_track = 'serial' and p_qty <> 1 then
    raise exception 'SERIAL_QTY: หมายเลขเครื่องหนึ่งหมายเลขต่อของหนึ่งชิ้นเท่านั้น';
  end if;

  if not exists (select 1 from public.warehouses where id = p_warehouse and company_id = p_company) then
    raise exception 'WAREHOUSE_NOT_FOUND: ไม่พบคลังที่ระบุ';
  end if;

  select id into v_lot from public.product_lots
  where company_id = p_company and product_id = p_product and lot_no = v_no;

  if v_lot is null then
    insert into public.product_lots
      (company_id, product_id, warehouse_id, lot_no, mfg_date, expiry_date, note, created_by)
    values (p_company, p_product, p_warehouse, v_no, p_mfg, p_expiry, p_note, auth.uid())
    returning id into v_lot;
  else
    if v_track = 'serial' then
      raise exception 'SERIAL_EXISTS: หมายเลขเครื่อง % มีอยู่แล้วในทะเบียน', v_no;
    end if;
  end if;

  insert into public.lot_movements
    (company_id, lot_id, document_id, qty_in, note, created_by)
  values (p_company, v_lot, p_document, p_qty, p_note, auth.uid());

  return json_build_object('ok', true, 'lot_id', v_lot, 'lot_no', v_no);
end $$;

grant execute on function public.lot_receive(uuid, uuid, uuid, text, numeric, date, uuid, date, text) to authenticated;

-- ------------------------------------------------------------------------
-- จ่ายของออกจากทะเบียน — ผูกกับเอกสารที่ส่งของ
-- ------------------------------------------------------------------------
create or replace function public.lot_issue(
  p_company  uuid,
  p_product  uuid,
  p_lot_no   text,
  p_qty      numeric,
  p_document uuid default null,
  p_note     text default null
)
returns json
language plpgsql
security definer
set search_path = public, app
as $$
declare v_lot record; v_remaining numeric;
begin
  if not app.has_perm(p_company, 'products.inventory', 'edit') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์จัดการทะเบียนสินค้า';
  end if;
  if p_qty is null or p_qty <= 0 then raise exception 'INVALID_QTY: จำนวนต้องมากกว่าศูนย์'; end if;

  select id, qty_received, qty_issued into v_lot
  from public.product_lots
  where company_id = p_company and product_id = p_product
    and lot_no = btrim(coalesce(p_lot_no, ''));
  if v_lot.id is null then
    raise exception 'LOT_NOT_FOUND: ไม่พบหมายเลข % ในทะเบียน', p_lot_no;
  end if;

  v_remaining := v_lot.qty_received - v_lot.qty_issued;
  if p_qty > v_remaining then
    raise exception 'LOT_NOT_ENOUGH: ล็อต % เหลือ % จ่ายเกินไม่ได้', p_lot_no, v_remaining;
  end if;

  insert into public.lot_movements
    (company_id, lot_id, document_id, qty_out, note, created_by)
  values (p_company, v_lot.id, p_document, p_qty, p_note, auth.uid());

  return json_build_object('ok', true, 'lot_id', v_lot.id, 'remaining', v_remaining - p_qty);
end $$;

grant execute on function public.lot_issue(uuid, uuid, text, numeric, uuid, text) to authenticated;

-- ------------------------------------------------------------------------
-- ล็อตคงเหลือ
-- ------------------------------------------------------------------------
create or replace function public.rpt_lot_balance(
  p_company uuid,
  p_product uuid default null,
  p_q       text default null
)
returns json
language sql
stable
set search_path = public, app
as $$
  with args as (
    select '%' || replace(replace(btrim(coalesce(p_q,'')),'%','\%'),'_','\_') || '%' as pat,
           nullif(btrim(coalesce(p_q,'')),'') as raw
  )
  select coalesce(jsonb_agg(x order by x->>'expiry_date' nulls last, x->>'lot_no'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', l.id, 'lot_no', l.lot_no,
      'product_id', l.product_id, 'sku', p.sku, 'product_name', p.name,
      'tracking', p.tracking,
      'warehouse_id', l.warehouse_id, 'warehouse', w.name,
      'mfg_date', l.mfg_date, 'expiry_date', l.expiry_date,
      'qty_received', l.qty_received, 'qty_issued', l.qty_issued,
      'qty_remaining', l.qty_received - l.qty_issued,
      -- นับเป็นหมดอายุแล้วก็ต่อเมื่อยังมีของเหลืออยู่จริง
      'expired', (l.expiry_date is not null and l.expiry_date < current_date
                  and l.qty_received > l.qty_issued)
    ) as x
    from public.product_lots l
    join public.products p on p.id = l.product_id
    left join public.warehouses w on w.id = l.warehouse_id
    cross join args a
    where l.company_id = p_company
      and (p_product is null or l.product_id = p_product)
      and (a.raw is null or l.lot_no ilike a.pat or p.sku ilike a.pat or p.name ilike a.pat)
  ) t;
$$;

grant execute on function public.rpt_lot_balance(uuid, uuid, text) to authenticated;

-- ------------------------------------------------------------------------
-- ตามรอยล็อต — เหตุผลทั้งหมดที่ต้องมีทะเบียนนี้
--
-- ตอบคำถามว่า "ของล็อตนี้ไปอยู่กับใครบ้าง" ซึ่งจำเป็นตอนต้องเรียกคืน
-- หรือตอนลูกค้าเคลมประกันแล้วต้องพิสูจน์ว่าซื้อไปเมื่อไรจากบิลใบไหน
-- ------------------------------------------------------------------------
create or replace function public.rpt_lot_trace(p_company uuid, p_lot uuid)
returns json
language sql
stable
set search_path = public, app
as $$
  select json_build_object(
    'lot', (
      select jsonb_build_object(
        'id', l.id, 'lot_no', l.lot_no, 'sku', p.sku, 'product_name', p.name,
        'tracking', p.tracking, 'warehouse', w.name,
        'mfg_date', l.mfg_date, 'expiry_date', l.expiry_date,
        'qty_received', l.qty_received, 'qty_issued', l.qty_issued,
        'qty_remaining', l.qty_received - l.qty_issued)
      from public.product_lots l
      join public.products p on p.id = l.product_id
      left join public.warehouses w on w.id = l.warehouse_id
      where l.id = p_lot and l.company_id = p_company
    ),
    'movements', coalesce((
      select jsonb_agg(y order by y->>'move_date', y->>'created_at')
      from (
        select jsonb_build_object(
          'id', m.id, 'move_date', m.move_date,
          'qty_in', m.qty_in, 'qty_out', m.qty_out, 'note', m.note,
          'document_id', d.id, 'doc_number', d.doc_number, 'doc_kind', d.kind::text,
          'contact_name', coalesce(c.name, d.contact_snapshot->>'name'),
          'created_at', m.created_at
        ) as y
        from public.lot_movements m
        left join public.documents d on d.id = m.document_id
        left join public.contacts c on c.id = d.contact_id
        where m.lot_id = p_lot and m.company_id = p_company
      ) z), '[]'::jsonb)
  );
$$;

grant execute on function public.rpt_lot_trace(uuid, uuid) to authenticated;

-- ------------------------------------------------------------------------
-- ล็อตที่ใกล้หมดอายุหรือหมดอายุแล้วและยังมีของเหลือ
-- ------------------------------------------------------------------------
create or replace function public.rpt_lots_expiring(p_company uuid, p_days int default 90)
returns json
language sql
stable
set search_path = public, app
as $$
  select coalesce(jsonb_agg(x order by x->>'expiry_date'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', l.id, 'lot_no', l.lot_no, 'sku', p.sku, 'product_name', p.name,
      'warehouse', w.name, 'expiry_date', l.expiry_date,
      'qty_remaining', l.qty_received - l.qty_issued,
      'days_left', (l.expiry_date - current_date)
    ) as x
    from public.product_lots l
    join public.products p on p.id = l.product_id
    left join public.warehouses w on w.id = l.warehouse_id
    where l.company_id = p_company
      and l.expiry_date is not null
      and l.qty_received > l.qty_issued
      and l.expiry_date <= current_date + p_days
  ) t;
$$;

grant execute on function public.rpt_lots_expiring(uuid, int) to authenticated;

-- ------------------------------------------------------------------------
-- กระทบยอดทะเบียนกับสต๊อกจริง
--
-- ทะเบียนเป็นชั้นตามรอยที่วางขนานกับสต๊อก ไม่ได้บังคับให้ตรงกันเสมอ
-- ถ้าคนลืมระบุล็อตตอนรับหรือจ่าย ตัวเลขจะเริ่มห่างกันเงียบ ๆ
-- รายงานนี้ทำให้ส่วนต่างมองเห็นได้ แทนที่จะบังคับจนคนทำงานไม่ได้
-- ------------------------------------------------------------------------
create or replace function public.rpt_lot_reconcile(p_company uuid)
returns json
language sql
stable
set search_path = public, app
as $$
  select coalesce(jsonb_agg(x order by (x->>'diff')::numeric desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'product_id', p.id, 'sku', p.sku, 'product_name', p.name, 'tracking', p.tracking,
      'stock_qty', coalesce(s.qty, 0),
      'lot_qty', coalesce(lt.qty, 0),
      'diff', round(abs(coalesce(s.qty, 0) - coalesce(lt.qty, 0)), 4)
    ) as x
    from public.products p
    left join lateral (
      select sum(m.qty_in - m.qty_out) as qty
      from public.inventory_moves m
      where m.company_id = p_company and m.product_id = p.id
    ) s on true
    left join lateral (
      select sum(l.qty_received - l.qty_issued) as qty
      from public.product_lots l
      where l.company_id = p_company and l.product_id = p.id
    ) lt on true
    where p.company_id = p_company
      and p.tracking <> 'none'
      and abs(coalesce(s.qty, 0) - coalesce(lt.qty, 0)) > 0.0001
  ) t;
$$;

grant execute on function public.rpt_lot_reconcile(uuid) to authenticated;

comment on table public.product_lots is
  'ทะเบียนล็อตและหมายเลขเครื่อง — ชั้นตามรอยที่วางขนานกับต้นทุน FIFO ไม่ใช่มิติของต้นทุน';
comment on function public.rpt_lot_trace is
  'ล็อตนี้รับมาจากเอกสารใบไหนและไปอยู่กับลูกค้าคนไหนบ้าง — ใช้ตอนเรียกคืนสินค้าและเคลมประกัน';

-- ------------------------------------------------------------------------
-- view ที่ปิดคอลัมน์ตามสิทธิ์ (0042) ระบุคอลัมน์ไว้ทีละตัว
--
-- ถ้าไม่เติม tracking เข้าไป หน้าแก้ไขสินค้าจะอ่านค่าไม่เจอ
-- แล้วบันทึกทับด้วยค่าว่างทุกครั้ง การตั้งค่าตามรอยจะหายไปเงียบ ๆ
-- เป็นกับดักเดียวกับที่เคยเจอตอนเพิ่มคอลัมน์ให้ documents_masked
-- ------------------------------------------------------------------------
drop view if exists public.products_masked;
create view public.products_masked
with (security_invoker = true)
as
select
  p.id, p.company_id, p.sku, p.barcode, p.name, p.name_en, p.name_zh,
  p.kind, p.unit, p.category, p.group_id, p.weight_kg,
  p.sale_price,
  case when app.field_masked(p.company_id, 'products', 'purchase_price')
       then null else p.purchase_price end as purchase_price,
  p.vat_treatment, p.track_inventory, p.tracking, p.reorder_point,
  p.income_account_id, p.expense_account_id, p.inventory_account_id,
  case when app.field_masked(p.company_id, 'products', 'cogs_account_id')
       then null else p.cogs_account_id end as cogs_account_id,
  p.is_active, p.created_at, p.updated_at
from public.products p;

grant select on public.products_masked to authenticated;
