-- =====================================================================
-- 0037 : ตรวจนับสินค้า
--
--  ขั้นตอนจริงในคลัง
--    1) เปิดใบตรวจนับของคลังหนึ่ง ระบบ "แช่แข็ง" ยอดตามบัญชี ณ วินาทีนั้นไว้ในใบ
--    2) เดินนับของจริง แล้วกรอกจำนวนที่นับได้ทีละรายการ
--    3) ยืนยัน ระบบปรับสต๊อกตามผลต่างและลงบัญชีให้
--
--  ทำไมต้องแช่แข็งยอดตามบัญชีไว้ในใบ ไม่คำนวณสดตอนยืนยัน
--    ระหว่างเดินนับอาจมีการขายหรือรับของเข้ามา ถ้าไปคำนวณสดตอนยืนยัน
--    ผลต่างจะรวมรายการที่เกิดหลังเริ่มนับเข้าไปด้วย กลายเป็นปรับสต๊อกผิด
--    และไม่มีใครย้อนอธิบายได้ว่าตัวเลขมาจากไหน
--
--  ความปลอดภัยที่สำคัญที่สุด : ยืนยันซ้ำไม่ได้
--    ถ้ายืนยันสองครั้ง สต๊อกจะถูกปรับสองรอบ ซึ่งกู้คืนยาก
--    จึงล็อกด้วยการเปลี่ยนสถานะภายในทรานแซกชันเดียวกันก่อนเริ่มปรับ
-- =====================================================================

do $$ begin
  create type stock_count_status as enum ('draft','counting','confirmed','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.stock_counts (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id),
  count_number text not null,
  count_date   date not null default current_date,
  status       stock_count_status not null default 'draft',
  note         text,
  created_by   uuid references public.profiles(id),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  journal_entry_id uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (company_id, count_number)
);

create table if not exists public.stock_count_lines (
  id          uuid primary key default gen_random_uuid(),
  count_id    uuid not null references public.stock_counts(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  product_id  uuid not null references public.products(id),
  -- ยอดตามบัญชี ณ ตอนเปิดใบ เก็บไว้เป็นหลักฐาน ไม่คำนวณใหม่
  system_qty  numeric(18,4) not null default 0,
  counted_qty numeric(18,4),
  unit_cost   numeric(18,4) not null default 0,
  note        text,
  created_at  timestamptz not null default now(),
  unique (count_id, product_id)
);

create index if not exists stock_counts_company_idx on public.stock_counts (company_id, count_date desc);
create index if not exists stock_count_lines_count_idx on public.stock_count_lines (count_id);

alter table public.stock_counts      enable row level security;
alter table public.stock_counts      force  row level security;
alter table public.stock_count_lines enable row level security;
alter table public.stock_count_lines force  row level security;

drop policy if exists "sc_sel" on public.stock_counts;
create policy "sc_sel" on public.stock_counts for select to authenticated
  using (app.has_perm(company_id, 'products.inventory', 'view'));
drop policy if exists "sc_all" on public.stock_counts;
create policy "sc_all" on public.stock_counts for all to authenticated
  using (app.has_perm(company_id, 'products.inventory', 'edit'))
  with check (app.has_perm(company_id, 'products.inventory', 'edit'));

drop policy if exists "scl_sel" on public.stock_count_lines;
create policy "scl_sel" on public.stock_count_lines for select to authenticated
  using (app.has_perm(company_id, 'products.inventory', 'view'));
drop policy if exists "scl_all" on public.stock_count_lines;
create policy "scl_all" on public.stock_count_lines for all to authenticated
  using (app.has_perm(company_id, 'products.inventory', 'edit'))
  with check (app.has_perm(company_id, 'products.inventory', 'edit'));

-- ใบที่ยืนยันแล้วห้ามแก้ ไม่ว่าจะแก้จากทางไหน
-- ตั้งเป็น trigger ที่ฐานข้อมูล ไม่ใช่เช็คในโค้ดหน้าเว็บ เพราะยิง API ตรงก็ต้องกันได้
create or replace function app.sc_guard_confirmed()
returns trigger language plpgsql as $$
declare v_status stock_count_status;
begin
  if tg_table_name = 'stock_counts' then
    if tg_op = 'UPDATE' and old.status = 'confirmed'
       and (new.status is distinct from old.status or new.count_date is distinct from old.count_date
            or new.warehouse_id is distinct from old.warehouse_id) then
      raise exception 'COUNT_CONFIRMED: ใบตรวจนับที่ยืนยันแล้วแก้ไขไม่ได้';
    end if;
    if tg_op = 'DELETE' and old.status = 'confirmed' then
      raise exception 'COUNT_CONFIRMED: ใบตรวจนับที่ยืนยันแล้วลบไม่ได้';
    end if;
    return coalesce(new, old);
  end if;

  select status into v_status from public.stock_counts
  where id = coalesce(new.count_id, old.count_id);
  if v_status = 'confirmed' then
    raise exception 'COUNT_CONFIRMED: ใบตรวจนับที่ยืนยันแล้วแก้ไขไม่ได้';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists sc_guard on public.stock_counts;
create trigger sc_guard before update or delete on public.stock_counts
  for each row execute function app.sc_guard_confirmed();

drop trigger if exists scl_guard on public.stock_count_lines;
create trigger scl_guard before insert or update or delete on public.stock_count_lines
  for each row execute function app.sc_guard_confirmed();

-- ------------------------------------------------------------------------
-- เปิดใบตรวจนับ พร้อมแช่แข็งยอดตามบัญชีของทุกสินค้าในคลังนั้น
-- ------------------------------------------------------------------------
create or replace function public.open_stock_count(
  p_company   uuid,
  p_warehouse uuid,
  p_date      date default current_date,
  p_note      text default null
)
returns json
language plpgsql
security definer
set search_path = public, app
as $$
declare v_id uuid; v_no text; v_lines int;
begin
  if not app.has_perm(p_company, 'products.inventory', 'edit') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์ตรวจนับสินค้า';
  end if;
  if not exists (select 1 from public.warehouses where id = p_warehouse and company_id = p_company) then
    raise exception 'WAREHOUSE_NOT_FOUND: ไม่พบคลังที่ระบุ';
  end if;
  -- เปิดใบซ้อนกันในคลังเดียวจะทำให้ยอดที่แช่แข็งไว้ขัดกันเอง
  if exists (select 1 from public.stock_counts
             where company_id = p_company and warehouse_id = p_warehouse
               and status in ('draft','counting')) then
    raise exception 'COUNT_OPEN: คลังนี้มีใบตรวจนับที่ยังไม่ปิดอยู่แล้ว';
  end if;

  v_no := 'SC-' || to_char(p_date, 'YYYYMM') || '-' ||
          lpad((1 + (select count(*) from public.stock_counts
                     where company_id = p_company
                       and to_char(count_date,'YYYYMM') = to_char(p_date,'YYYYMM')))::text, 3, '0');

  insert into public.stock_counts (company_id, warehouse_id, count_number, count_date, status, note, created_by)
  values (p_company, p_warehouse, v_no, p_date, 'counting', p_note, auth.uid())
  returning id into v_id;

  -- แช่แข็งยอดตามบัญชีของคลังนี้ ณ วินาทีที่เปิดใบ
  insert into public.stock_count_lines (count_id, company_id, product_id, system_qty, unit_cost)
  select v_id, p_company, p.id,
         coalesce(sum(m.qty_in - m.qty_out), 0),
         case when coalesce(sum(m.qty_in - m.qty_out), 0) > 0
              then round(coalesce(sum(m.value_in - m.value_out), 0)
                         / coalesce(sum(m.qty_in - m.qty_out), 1), 4)
              else coalesce(p.purchase_price, 0) end
  from public.products p
  left join public.inventory_moves m
    on m.product_id = p.id and m.warehouse_id = p_warehouse and m.move_date <= p_date
  where p.company_id = p_company and p.track_inventory and p.is_active
  group by p.id, p.purchase_price;

  get diagnostics v_lines = row_count;
  return json_build_object('ok', true, 'id', v_id, 'count_number', v_no, 'lines', v_lines);
end $$;

grant execute on function public.open_stock_count(uuid, uuid, date, text) to authenticated;

-- ------------------------------------------------------------------------
-- ยืนยันใบตรวจนับ : ปรับสต๊อกตามผลต่าง แล้วลงบัญชี
--
-- ขาด  → เดบิต ต้นทุนขาย   / เครดิต สินค้าคงเหลือ
-- เกิน → เดบิต สินค้าคงเหลือ / เครดิต ต้นทุนขาย
-- ------------------------------------------------------------------------
create or replace function public.confirm_stock_count(p_count uuid)
returns json
language plpgsql
security definer
set search_path = public, app
as $$
declare
  c          public.stock_counts%rowtype;
  l          record;
  v_entry    uuid;
  v_line     int := 0;
  v_short    numeric(18,2) := 0;   -- มูลค่าที่ขาด
  v_over     numeric(18,2) := 0;   -- มูลค่าที่เกิน
  v_adjusted int := 0;
  v_inv      uuid;
  v_cogs     uuid;
begin
  select * into c from public.stock_counts where id = p_count;
  if not found then raise exception 'COUNT_NOT_FOUND'; end if;

  if not app.has_perm(c.company_id, 'products.inventory', 'edit') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์ยืนยันการตรวจนับ';
  end if;
  if c.status <> 'counting' then
    raise exception 'COUNT_NOT_OPEN: ใบนี้ไม่ได้อยู่ในสถานะกำลังนับ';
  end if;
  perform app.assert_period_open(c.company_id, c.count_date);

  -- ล็อกสถานะก่อนเริ่มปรับ กันการยืนยันซ้ำซ้อนจากสองหน้าจอพร้อมกัน
  -- ถ้าอีกทรานแซกชันชิงเปลี่ยนไปแล้ว จำนวนแถวจะเป็นศูนย์ แล้วเราหยุดทันที
  update public.stock_counts
     set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now(), updated_at = now()
   where id = p_count and status = 'counting';
  if not found then raise exception 'COUNT_RACE: ใบนี้ถูกยืนยันไปแล้ว'; end if;

  v_inv  := app.acc(c.company_id, 'inventory');
  v_cogs := app.acc(c.company_id, 'cogs');

  for l in
    select scl.*, (scl.counted_qty - scl.system_qty) as diff
    from public.stock_count_lines scl
    where scl.count_id = p_count and scl.counted_qty is not null
      and scl.counted_qty <> scl.system_qty
    order by scl.created_at
  loop
    -- ปรับสต๊อกจริงผ่านกลไก FIFO เดิม เพื่อให้ชั้นต้นทุนถูกต้องตามไปด้วย
    if l.diff > 0 then
      perform app.inv_receive(c.company_id, l.product_id, c.count_date, l.diff, l.unit_cost,
                              null, 'ตรวจนับ ' || c.count_number, c.warehouse_id);
      v_over := v_over + round(l.diff * l.unit_cost, 2);
    else
      perform app.inv_issue(c.company_id, l.product_id, c.count_date, -l.diff,
                            null, 'ตรวจนับ ' || c.count_number, c.warehouse_id);
      v_short := v_short + round((-l.diff) * l.unit_cost, 2);
    end if;
    v_adjusted := v_adjusted + 1;
  end loop;

  -- ลงบัญชีเฉพาะเมื่อมีผลต่างจริง ไม่งั้นจะได้สมุดรายวันว่างเปล่า
  if v_short <> 0 or v_over <> 0 then
    insert into public.journal_entries(company_id, entry_number, entry_date, book, description,
      source_type, source_id, status, is_auto, created_by, posted_by, posted_at)
    values (c.company_id, app.next_entry_number(c.company_id, 'ADJ', c.count_date), c.count_date,
      'ADJ', 'ผลต่างจากการตรวจนับ ' || c.count_number,
      'stock_count', p_count, 'posted', true, auth.uid(), auth.uid(), now())
    returning id into v_entry;

    if v_short <> 0 then
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
      values (v_entry, c.company_id, v_line, v_cogs, 'สินค้าขาดจากการตรวจนับ', v_short, 0);
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
      values (v_entry, c.company_id, v_line, v_inv, 'สินค้าขาดจากการตรวจนับ', 0, v_short);
    end if;

    if v_over <> 0 then
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
      values (v_entry, c.company_id, v_line, v_inv, 'สินค้าเกินจากการตรวจนับ', v_over, 0);
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
      values (v_entry, c.company_id, v_line, v_cogs, 'สินค้าเกินจากการตรวจนับ', 0, v_over);
    end if;

    update public.stock_counts set journal_entry_id = v_entry where id = p_count;
  end if;

  return json_build_object('ok', true, 'adjusted', v_adjusted,
                           'shortage_value', v_short, 'overage_value', v_over,
                           'journal_entry_id', v_entry);
end $$;

grant execute on function public.confirm_stock_count(uuid) to authenticated;

-- ------------------------------------------------------------------------
-- อ่านใบตรวจนับพร้อมรายการและผลต่าง
-- ------------------------------------------------------------------------
create or replace function public.rpt_stock_count(p_count uuid)
returns json
language sql
stable
set search_path = public, app
as $$
  select json_build_object(
    'count', (
      select to_jsonb(sc) || jsonb_build_object(
        'warehouse_code', w.code, 'warehouse_name', w.name,
        'created_by_name', pc.full_name, 'confirmed_by_name', pf.full_name)
      from public.stock_counts sc
      join public.warehouses w on w.id = sc.warehouse_id
      left join public.profiles pc on pc.id = sc.created_by
      left join public.profiles pf on pf.id = sc.confirmed_by
      where sc.id = p_count
    ),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'product_id', l.product_id, 'sku', p.sku, 'name', p.name, 'unit', p.unit,
        'system_qty', l.system_qty, 'counted_qty', l.counted_qty, 'unit_cost', l.unit_cost,
        'diff', case when l.counted_qty is null then null else l.counted_qty - l.system_qty end,
        'diff_value', case when l.counted_qty is null then null
                           else round((l.counted_qty - l.system_qty) * l.unit_cost, 2) end,
        'note', l.note
      ) order by p.sku)
      from public.stock_count_lines l
      join public.products p on p.id = l.product_id
      where l.count_id = p_count
    ), '[]'::jsonb),
    'summary', (
      select json_build_object(
        'total',    count(*),
        'counted',  count(*) filter (where counted_qty is not null),
        'shortage', count(*) filter (where counted_qty is not null and counted_qty < system_qty),
        'overage',  count(*) filter (where counted_qty is not null and counted_qty > system_qty),
        'diff_value', coalesce(sum(round((counted_qty - system_qty) * unit_cost, 2))
                               filter (where counted_qty is not null), 0)
      )
      from public.stock_count_lines where count_id = p_count
    )
  );
$$;

grant execute on function public.rpt_stock_count(uuid) to authenticated;

comment on table public.stock_counts is
  'ใบตรวจนับสินค้า — แช่แข็งยอดตามบัญชีไว้ตอนเปิดใบ ยืนยันแล้วแก้ไม่ได้และยืนยันซ้ำไม่ได้';
