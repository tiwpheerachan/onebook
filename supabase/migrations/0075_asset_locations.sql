-- ============================================================================
-- ONEBOOK 0075 : ทะเบียนสถานที่ตั้งทรัพย์สิน (asset locations master)
--
--   asset_locations  รายการสถานที่ต่อบริษัท (อาคาร/ชั้น/ห้อง) ให้เลือกตอนบันทึกทรัพย์สิน
--   สิทธิ์ : resource 'accounting.assets' (view/create/edit/delete)
-- ============================================================================

create table if not exists public.asset_locations (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  code        text not null,
  name        text not null,
  building    text,
  floor       text,
  room        text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, code)
);
create index if not exists asset_locations_company_idx on public.asset_locations(company_id, code);

alter table public.asset_locations enable row level security;

drop policy if exists "aloc_sel" on public.asset_locations;
drop policy if exists "aloc_ins" on public.asset_locations;
drop policy if exists "aloc_upd" on public.asset_locations;
drop policy if exists "aloc_del" on public.asset_locations;
create policy "aloc_sel" on public.asset_locations for select to authenticated
  using (app.has_perm(company_id,'accounting.assets','view'));
create policy "aloc_ins" on public.asset_locations for insert to authenticated
  with check (app.has_perm(company_id,'accounting.assets','create'));
create policy "aloc_upd" on public.asset_locations for update to authenticated
  using (app.has_perm(company_id,'accounting.assets','edit'))
  with check (app.has_perm(company_id,'accounting.assets','edit'));
create policy "aloc_del" on public.asset_locations for delete to authenticated
  using (app.has_perm(company_id,'accounting.assets','delete'));

drop trigger if exists trg_asset_locations_touch on public.asset_locations;
create trigger trg_asset_locations_touch before update on public.asset_locations
  for each row execute function app.touch_updated_at();
