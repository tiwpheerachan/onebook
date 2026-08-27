-- =====================================================================
-- 0040 : กลุ่มสินค้า วัตถุดิบ และการตรวจสอบย้อนหลังของโมดูลใหม่
--
--  1) กลุ่มสินค้าที่กำหนดผังบัญชีร่วมกันได้
--     เดิมมีแค่ category ที่เป็นข้อความล้วน จัดกลุ่มดูได้แต่ไม่มีผลกับการลงบัญชี
--     ต้องไปตั้งบัญชีทีละตัวสินค้า ซึ่งพอมีสินค้าหลายร้อยตัวก็ตั้งไม่ไหวและตั้งไม่ตรงกัน
--
--     กลุ่มทำหน้าที่เป็น "แม่แบบ" ไม่ใช่ตัวตัดสินตอนลงบัญชี
--     เพราะบัญชีที่ผูกกับตัวสินค้าโดยตรงคือสิ่งที่ผู้ทำบัญชีเห็นและตรวจได้
--     ถ้าให้กลุ่มไปตัดสินตอนลงบัญชี เวลามีคนแก้กลุ่ม เอกสารเก่ากับใหม่จะลงคนละบัญชี
--     โดยไม่มีร่องรอย ตรงนี้จึงเลือกให้กลุ่มเติมค่าให้ตอนสร้างหรือแก้สินค้าแทน
--     และมีปุ่มให้กดใช้ผังของกลุ่มกับสินค้าทั้งกลุ่มเมื่อจงใจจะทำ
--
--  2) เพิ่มประเภท "วัตถุดิบ" ซึ่งเดิมไม่มี
--
--  3) โมดูลที่เพิ่มมาใหม่ยังไม่มีการบันทึกประวัติการแก้ไข
--     ทั้งที่ทะเบียนเช็คและใบตรวจนับกระทบเงินและสต๊อกโดยตรง
-- =====================================================================

create table if not exists public.product_groups (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code       text not null,
  name       text not null,
  note       text,
  -- ผังบัญชีประจำกลุ่ม ใช้เป็นค่าตั้งต้นให้สินค้าในกลุ่ม
  income_account_id    uuid references public.accounts(id),
  expense_account_id   uuid references public.accounts(id),
  inventory_account_id uuid references public.accounts(id),
  cogs_account_id      uuid references public.accounts(id),
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

alter table public.products add column if not exists group_id uuid references public.product_groups(id);
create index if not exists products_group_idx on public.products (company_id, group_id);

-- เพิ่มวัตถุดิบเข้าไปในประเภทสินค้า
alter table public.products drop constraint if exists products_kind_check;
alter table public.products add constraint products_kind_check
  check (kind = any (array['good','service','asset','raw_material']));

alter table public.product_groups enable row level security;
alter table public.product_groups force  row level security;

drop policy if exists "pg_sel" on public.product_groups;
create policy "pg_sel" on public.product_groups for select to authenticated
  using (app.has_perm(company_id, 'products', 'view'));
drop policy if exists "pg_all" on public.product_groups;
create policy "pg_all" on public.product_groups for all to authenticated
  using (app.has_perm(company_id, 'products', 'edit'))
  with check (app.has_perm(company_id, 'products', 'edit'));

-- ------------------------------------------------------------------------
-- กลุ่มเติมบัญชีให้สินค้าที่ยังไม่ได้ตั้งเอง
--
-- เติมเฉพาะช่องที่ว่าง ค่าที่ตั้งไว้กับตัวสินค้าเองจึงมีผลเหนือกว่าเสมอ
-- ------------------------------------------------------------------------
create or replace function app.product_fill_from_group()
returns trigger language plpgsql as $$
declare g public.product_groups%rowtype;
begin
  if new.group_id is null then return new; end if;
  select * into g from public.product_groups where id = new.group_id;
  if not found then return new; end if;

  new.income_account_id    := coalesce(new.income_account_id,    g.income_account_id);
  new.expense_account_id   := coalesce(new.expense_account_id,   g.expense_account_id);
  new.inventory_account_id := coalesce(new.inventory_account_id, g.inventory_account_id);
  new.cogs_account_id      := coalesce(new.cogs_account_id,      g.cogs_account_id);
  return new;
end $$;

drop trigger if exists trg_product_group_fill on public.products;
create trigger trg_product_group_fill before insert or update of group_id on public.products
  for each row execute function app.product_fill_from_group();

-- ------------------------------------------------------------------------
-- ใช้ผังบัญชีของกลุ่มกับสินค้าทั้งกลุ่ม
--
-- แยกเป็นปุ่มที่ต้องกดเอง ไม่ทำอัตโนมัติเวลาแก้กลุ่ม
-- เพราะการเปลี่ยนบัญชีของสินค้าหลายร้อยตัวพร้อมกันต้องเป็นการตัดสินใจที่ตั้งใจ
-- p_overwrite = false จะเติมเฉพาะช่องที่ว่าง ไม่ทับค่าที่ตั้งไว้กับตัวสินค้าเอง
-- ------------------------------------------------------------------------
create or replace function public.apply_group_accounts(
  p_group uuid,
  p_overwrite boolean default false
)
returns json
language plpgsql
security definer
set search_path = public, app
as $$
declare g public.product_groups%rowtype; v_n int;
begin
  select * into g from public.product_groups where id = p_group;
  if not found then raise exception 'GROUP_NOT_FOUND'; end if;

  if not app.has_perm(g.company_id, 'products', 'edit') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์แก้ไขสินค้า';
  end if;

  update public.products p set
    income_account_id    = case when p_overwrite then coalesce(g.income_account_id, p.income_account_id)
                                else coalesce(p.income_account_id, g.income_account_id) end,
    expense_account_id   = case when p_overwrite then coalesce(g.expense_account_id, p.expense_account_id)
                                else coalesce(p.expense_account_id, g.expense_account_id) end,
    inventory_account_id = case when p_overwrite then coalesce(g.inventory_account_id, p.inventory_account_id)
                                else coalesce(p.inventory_account_id, g.inventory_account_id) end,
    cogs_account_id      = case when p_overwrite then coalesce(g.cogs_account_id, p.cogs_account_id)
                                else coalesce(p.cogs_account_id, g.cogs_account_id) end,
    updated_at = now()
  where p.company_id = g.company_id and p.group_id = p_group;

  get diagnostics v_n = row_count;
  return json_build_object('ok', true, 'updated', v_n);
end $$;

grant execute on function public.apply_group_accounts(uuid, boolean) to authenticated;

-- ------------------------------------------------------------------------
-- สรุปกลุ่มสินค้าพร้อมจำนวนสินค้าและมูลค่าคงเหลือ
-- ------------------------------------------------------------------------
create or replace function public.rpt_product_groups(p_company uuid)
returns json
language sql
stable
set search_path = public, app
as $$
  select coalesce(jsonb_agg(x order by x->>'code'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', g.id, 'code', g.code, 'name', g.name, 'note', g.note,
      'is_active', g.is_active,
      'income_account', ai.code, 'expense_account', ae.code,
      'inventory_account', av.code, 'cogs_account', ac.code,
      'product_count', (select count(*) from public.products p
                        where p.group_id = g.id and p.is_active),
      'stock_value', coalesce((
        select round(sum(m.value_in - m.value_out), 2)
        from public.inventory_moves m
        join public.products p on p.id = m.product_id
        where p.group_id = g.id and m.company_id = p_company), 0)
    ) as x
    from public.product_groups g
    left join public.accounts ai on ai.id = g.income_account_id
    left join public.accounts ae on ae.id = g.expense_account_id
    left join public.accounts av on av.id = g.inventory_account_id
    left join public.accounts ac on ac.id = g.cogs_account_id
    where g.company_id = p_company
  ) t;
$$;

grant execute on function public.rpt_product_groups(uuid) to authenticated;

-- =====================================================================
-- บันทึกประวัติการแก้ไขของโมดูลที่เพิ่มมาใหม่
--
-- ทะเบียนเช็คและใบตรวจนับกระทบเงินและสต๊อกโดยตรง ต้องตรวจย้อนหลังได้
-- ไม่ใส่ inventory_moves กับ inventory_layers เพราะเกิดถี่มาก
-- และตามรอยได้อยู่แล้วจากเอกสารต้นทางกับการ์ดสินค้า
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['warehouses','stock_counts','stock_count_lines',
                           'landed_costs','landed_cost_charges','cheques','product_groups'] loop
    execute format('drop trigger if exists trg_audit_%1$s on public.%1$s', t);
    execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$s '
                   'for each row execute function app.audit_trigger()', t);
  end loop;
end $$;

-- อัปเดตเวลาแก้ไขอัตโนมัติให้ตารางใหม่ด้วย
do $$
declare t text;
begin
  foreach t in array array['warehouses','stock_counts','landed_costs','cheques','product_groups'] loop
    execute format('drop trigger if exists trg_touch_%1$s on public.%1$s', t);
    execute format('create trigger trg_touch_%1$s before update on public.%1$s '
                   'for each row execute function app.touch_updated_at()', t);
  end loop;
end $$;

comment on table public.product_groups is
  'กลุ่มสินค้า — เป็นแม่แบบผังบัญชี ไม่ใช่ตัวตัดสินตอนลงบัญชี บัญชีที่ผูกกับตัวสินค้ามีผลเหนือกว่าเสมอ';
