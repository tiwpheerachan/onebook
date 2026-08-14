-- ============================================================================
-- ONEBOOK 0015 : ทะเบียนสินทรัพย์ถาวรและค่าเสื่อมราคา
--
--   fixed_assets            ทะเบียนสินทรัพย์ (ราคาทุน อายุการใช้งาน บัญชีที่เกี่ยวข้อง)
--   asset_depreciations     ค่าเสื่อมที่คิดแล้วรายงวด ผูกกับสมุดรายวันที่ลงบัญชีให้
--
--   run_depreciation()      คิดค่าเสื่อมของทุกสินทรัพย์ในงวดที่ระบุ แล้วลงบัญชีให้ 1 ชุด
--                           เดบิต ค่าเสื่อมราคา / เครดิต ค่าเสื่อมราคาสะสม
--   dispose_asset()         ตัดจำหน่าย/ขายสินทรัพย์ พร้อมบันทึกกำไร-ขาดทุน
--
--   วิธีคิด : เส้นตรง (straight_line) และยอดลดลงทวีคูณ (declining_balance)
--   คิดเป็นรายเดือน เริ่มเดือนที่ได้มา และไม่คิดเกินราคาทุนหักมูลค่าซาก
--
--   สิทธิ์ : resource 'accounting.assets' ครอบคลุมโดยสิทธิ์ 'accounting' เดิม
-- ============================================================================

do $$ begin
  create type depreciation_method as enum ('straight_line','declining_balance','none');
exception when duplicate_object then null; end $$;

do $$ begin
  create type asset_status as enum ('draft','active','fully_depreciated','disposed');
exception when duplicate_object then null; end $$;

create table if not exists public.fixed_assets (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies(id) on delete cascade,
  code               text not null,
  name               text not null,
  name_en            text,
  category           text,
  serial_no          text,
  location           text,
  supplier_id        uuid references public.contacts(id),
  document_id        uuid references public.documents(id),

  acquired_date      date not null,
  in_service_date    date,                                  -- วันเริ่มใช้งาน (เริ่มคิดค่าเสื่อม)
  cost               numeric(18,2) not null default 0,
  salvage_value      numeric(18,2) not null default 0,
  useful_life_months int not null default 60,
  method             depreciation_method not null default 'straight_line',
  declining_rate     numeric(9,4) not null default 0,       -- ใช้เมื่อ method = declining_balance

  -- ยอดยกมา (กรณีนำสินทรัพย์เดิมเข้าระบบกลางคัน)
  opening_accum_dep  numeric(18,2) not null default 0,

  asset_account_id       uuid references public.accounts(id),  -- บัญชีสินทรัพย์
  accum_dep_account_id   uuid references public.accounts(id),  -- ค่าเสื่อมราคาสะสม
  expense_account_id     uuid references public.accounts(id),  -- ค่าเสื่อมราคา (ค่าใช้จ่าย)
  dimension_id           uuid references public.dimensions(id),

  status             asset_status not null default 'active',
  disposed_date      date,
  disposal_proceeds  numeric(18,2),
  disposal_note      text,

  note               text,
  is_active          boolean not null default true,
  created_by         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (company_id, code)
);
create index if not exists fixed_assets_company_idx on public.fixed_assets(company_id, status, code);

create table if not exists public.asset_depreciations (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  asset_id     uuid not null references public.fixed_assets(id) on delete cascade,
  period_end   date not null,                    -- วันสิ้นงวดที่คิดค่าเสื่อม
  amount       numeric(18,2) not null,
  accum_after  numeric(18,2) not null,           -- ค่าเสื่อมสะสมหลังงวดนี้
  book_value   numeric(18,2) not null,           -- มูลค่าตามบัญชีหลังงวดนี้
  entry_id     uuid references public.journal_entries(id) on delete set null,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  unique (asset_id, period_end)
);
create index if not exists asset_dep_company_idx on public.asset_depreciations(company_id, period_end);

alter table public.fixed_assets        enable row level security;
alter table public.asset_depreciations enable row level security;

drop policy if exists "assets_sel" on public.fixed_assets;
drop policy if exists "assets_ins" on public.fixed_assets;
drop policy if exists "assets_upd" on public.fixed_assets;
drop policy if exists "assets_del" on public.fixed_assets;
create policy "assets_sel" on public.fixed_assets for select to authenticated
  using (app.has_perm(company_id,'accounting.assets','view'));
create policy "assets_ins" on public.fixed_assets for insert to authenticated
  with check (app.has_perm(company_id,'accounting.assets','create'));
create policy "assets_upd" on public.fixed_assets for update to authenticated
  using (app.has_perm(company_id,'accounting.assets','edit'))
  with check (app.has_perm(company_id,'accounting.assets','edit'));
create policy "assets_del" on public.fixed_assets for delete to authenticated
  using (app.has_perm(company_id,'accounting.assets','delete'));

drop policy if exists "asset_dep_sel" on public.asset_depreciations;
drop policy if exists "asset_dep_all" on public.asset_depreciations;
create policy "asset_dep_sel" on public.asset_depreciations for select to authenticated
  using (app.has_perm(company_id,'accounting.assets','view'));
create policy "asset_dep_all" on public.asset_depreciations for all to authenticated
  using (app.has_perm(company_id,'accounting.assets','post'))
  with check (app.has_perm(company_id,'accounting.assets','post'));

drop trigger if exists trg_fixed_assets_touch on public.fixed_assets;
create trigger trg_fixed_assets_touch before update on public.fixed_assets
  for each row execute function app.touch_updated_at();

-- ------------------------------------------- ค่าเสื่อมต่อเดือนของสินทรัพย์ 1 ตัว
create or replace function app.asset_monthly_depreciation(
  p_asset public.fixed_assets, p_accum numeric
) returns numeric language plpgsql immutable as $$
declare v_base numeric; v_amount numeric; v_bv numeric;
begin
  if p_asset.method = 'none' or p_asset.useful_life_months <= 0 then
    return 0;
  end if;

  v_base := p_asset.cost - p_asset.salvage_value;
  v_bv   := p_asset.cost - p_accum;

  if p_asset.method = 'straight_line' then
    v_amount := round(v_base / p_asset.useful_life_months, 2);
  else
    -- ยอดลดลงทวีคูณ : ถ้าไม่กำหนดอัตรา ใช้ 2 เท่าของวิธีเส้นตรง
    v_amount := round(
      (v_bv * coalesce(nullif(p_asset.declining_rate,0), 2.0 / (p_asset.useful_life_months / 12.0)) ) / 12.0, 2);
  end if;

  -- ห้ามคิดจนมูลค่าตามบัญชีต่ำกว่ามูลค่าซาก
  if v_bv - v_amount < p_asset.salvage_value then
    v_amount := greatest(v_bv - p_asset.salvage_value, 0);
  end if;

  return greatest(v_amount, 0);
end $$;

-- ------------------------------------------------- คิดค่าเสื่อมทั้งบริษัท 1 งวด
-- p_period_end = วันสิ้นเดือนของงวดที่ต้องการคิด (เช่น 2026-08-31)
create or replace function public.run_depreciation(p_company uuid, p_period_end date, p_dry_run boolean default false)
returns json language plpgsql security definer set search_path = public, app as $$
declare
  -- ต้องประกาศเป็น %rowtype เพื่อส่งต่อให้ app.asset_monthly_depreciation ได้
  a           public.fixed_assets%rowtype;
  v_entry     uuid;
  v_line      int := 0;
  v_accum     numeric(18,2);
  v_amount    numeric(18,2);
  v_total     numeric(18,2) := 0;
  v_count     int := 0;
  v_dep_acc   uuid;
  v_period    date := (date_trunc('month', p_period_end) + interval '1 month - 1 day')::date;
  v_start     date := date_trunc('month', p_period_end)::date;
  v_items     json[] := '{}';
begin
  if not app.has_perm(p_company,'accounting.assets','post') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์คิดค่าเสื่อมราคา';
  end if;
  if not p_dry_run then
    perform app.assert_period_open(p_company, v_period, 'all');
  end if;

  v_dep_acc := app.acc(p_company,'depreciation');

  for a in
    select fa.* from public.fixed_assets fa
    where fa.company_id = p_company
      and fa.status = 'active'
      and fa.method <> 'none'
      and coalesce(fa.in_service_date, fa.acquired_date) <= v_period
      and not exists (
        select 1 from public.asset_depreciations ad
        where ad.asset_id = fa.id and ad.period_end = v_period)
    order by fa.code
  loop
    -- ค่าเสื่อมสะสมถึงก่อนงวดนี้
    select a.opening_accum_dep + coalesce(sum(ad.amount), 0) into v_accum
    from public.asset_depreciations ad
    where ad.asset_id = a.id and ad.period_end < v_period;

    v_amount := app.asset_monthly_depreciation(a, v_accum);
    continue when v_amount <= 0;

    v_total := v_total + v_amount;
    v_count := v_count + 1;
    v_items := v_items || json_build_object(
      'asset_id', a.id, 'code', a.code, 'name', a.name,
      'amount', v_amount, 'accum_after', v_accum + v_amount,
      'book_value', a.cost - (v_accum + v_amount));

    if not p_dry_run then
      if v_entry is null then
        insert into public.journal_entries(company_id, entry_number, entry_date, book, description,
          source_type, status, is_auto, created_by, posted_by, posted_at)
        values (p_company, app.next_entry_number(p_company,'ADJ',v_period), v_period, 'ADJ',
          'ค่าเสื่อมราคาประจำงวด ' || to_char(v_period,'MM/YYYY'), 'depreciation', 'posted', true,
          auth.uid(), auth.uid(), now())
        returning id into v_entry;
      end if;

      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, dimension_id)
      values (v_entry, p_company, v_line, coalesce(a.expense_account_id, v_dep_acc),
              'ค่าเสื่อมราคา - ' || a.code || ' ' || a.name, v_amount, 0, a.dimension_id);

      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, dimension_id)
      values (v_entry, p_company, v_line, a.accum_dep_account_id,
              'ค่าเสื่อมราคาสะสม - ' || a.code || ' ' || a.name, 0, v_amount, a.dimension_id);

      insert into public.asset_depreciations(company_id, asset_id, period_end, amount, accum_after, book_value, entry_id, created_by)
      values (p_company, a.id, v_period, v_amount, v_accum + v_amount, a.cost - (v_accum + v_amount), v_entry, auth.uid());

      -- คิดครบแล้วปิดสถานะ
      if a.cost - (v_accum + v_amount) <= a.salvage_value then
        update public.fixed_assets set status = 'fully_depreciated' where id = a.id;
      end if;
    end if;
  end loop;

  return json_build_object(
    'period_end', v_period, 'period_start', v_start,
    'asset_count', v_count, 'total_amount', v_total,
    'entry_id', v_entry, 'dry_run', p_dry_run,
    'items', coalesce(array_to_json(v_items), '[]'::json));
end $$;

-- ---------------------------------------------------------- ตัดจำหน่ายสินทรัพย์
create or replace function public.dispose_asset(
  p_asset uuid, p_date date, p_proceeds numeric default 0, p_note text default null
) returns uuid language plpgsql security definer set search_path = public, app as $$
declare
  a         record;
  v_accum   numeric(18,2);
  v_bv      numeric(18,2);
  v_entry   uuid;
  v_line    int := 0;
  v_gain    numeric(18,2);
  v_cash    uuid;
  v_other_i uuid;
  v_other_e uuid;
begin
  select * into a from public.fixed_assets where id = p_asset;
  if not found then raise exception 'ASSET_NOT_FOUND'; end if;
  if not app.has_perm(a.company_id,'accounting.assets','post') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์ตัดจำหน่ายสินทรัพย์';
  end if;
  if a.status = 'disposed' then raise exception 'ASSET_ALREADY_DISPOSED'; end if;
  perform app.assert_period_open(a.company_id, p_date, 'all');

  select a.opening_accum_dep + coalesce(sum(ad.amount),0) into v_accum
  from public.asset_depreciations ad where ad.asset_id = a.id;

  v_bv   := a.cost - v_accum;
  v_gain := coalesce(p_proceeds,0) - v_bv;

  v_cash    := app.acc(a.company_id,'cash');
  select id into v_other_i from public.accounts
   where company_id = a.company_id and type = 'other_income' and not is_header order by code limit 1;
  select id into v_other_e from public.accounts
   where company_id = a.company_id and type = 'other_expense' and not is_header order by code limit 1;

  insert into public.journal_entries(company_id, entry_number, entry_date, book, description,
    source_type, source_id, status, is_auto, created_by, posted_by, posted_at)
  values (a.company_id, app.next_entry_number(a.company_id,'ADJ',p_date), p_date, 'ADJ',
    'ตัดจำหน่ายสินทรัพย์ ' || a.code || ' ' || a.name, 'asset_disposal', a.id, 'posted', true,
    auth.uid(), auth.uid(), now())
  returning id into v_entry;

  -- เงินที่ได้รับจากการขาย
  if coalesce(p_proceeds,0) <> 0 and v_cash is not null then
    v_line := v_line + 1;
    insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
    values (v_entry, a.company_id, v_line, v_cash, 'เงินรับจากการขายสินทรัพย์ ' || a.code, p_proceeds, 0);
  end if;

  -- ล้างค่าเสื่อมสะสม
  if v_accum <> 0 and a.accum_dep_account_id is not null then
    v_line := v_line + 1;
    insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
    values (v_entry, a.company_id, v_line, a.accum_dep_account_id, 'ล้างค่าเสื่อมราคาสะสม ' || a.code, v_accum, 0);
  end if;

  -- ล้างราคาทุน
  v_line := v_line + 1;
  insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
  values (v_entry, a.company_id, v_line, a.asset_account_id, 'ล้างราคาทุนสินทรัพย์ ' || a.code, 0, a.cost);

  -- กำไร / ขาดทุนจากการตัดจำหน่าย
  if v_gain > 0 then
    v_line := v_line + 1;
    insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
    values (v_entry, a.company_id, v_line, v_other_i, 'กำไรจากการตัดจำหน่ายสินทรัพย์ ' || a.code, 0, v_gain);
  elsif v_gain < 0 then
    v_line := v_line + 1;
    insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
    values (v_entry, a.company_id, v_line, v_other_e, 'ขาดทุนจากการตัดจำหน่ายสินทรัพย์ ' || a.code, -v_gain, 0);
  end if;

  update public.fixed_assets
     set status = 'disposed', disposed_date = p_date,
         disposal_proceeds = coalesce(p_proceeds,0), disposal_note = p_note
   where id = p_asset;

  return v_entry;
end $$;

-- ------------------------------------------------------- รายงานทะเบียนสินทรัพย์
create or replace function public.rpt_asset_register(p_company uuid, p_as_of date default current_date)
returns table (
  asset_id uuid, code text, name text, category text,
  acquired_date date, cost numeric, salvage_value numeric,
  useful_life_months int, method text,
  accum_dep numeric, book_value numeric, status text, disposed_date date
) language sql stable security definer set search_path = public, app as $$
  select fa.id, fa.code, fa.name, fa.category,
         fa.acquired_date, fa.cost, fa.salvage_value,
         fa.useful_life_months, fa.method::text,
         fa.opening_accum_dep + coalesce(dep.amt, 0),
         fa.cost - (fa.opening_accum_dep + coalesce(dep.amt, 0)),
         fa.status::text, fa.disposed_date
  from public.fixed_assets fa
  left join lateral (
    select sum(ad.amount) as amt from public.asset_depreciations ad
    where ad.asset_id = fa.id and ad.period_end <= p_as_of
  ) dep on true
  where fa.company_id = p_company
    and fa.acquired_date <= p_as_of
    and (app.has_perm(p_company,'accounting.assets','view') or app.has_perm(p_company,'report','view'))
  order by fa.code;
$$;

grant execute on function public.run_depreciation(uuid,date,boolean) to authenticated;
grant execute on function public.dispose_asset(uuid,date,numeric,text) to authenticated;
grant execute on function public.rpt_asset_register(uuid,date) to authenticated;
