-- ============================================================================
-- ONEBOOK 0074 : คลังความรู้บัญชี/ภาษีทรัพย์สิน (สร้าง/อัปเดตด้วย AI)
--
--   asset_knowledge  บทความความรู้ต่อบริษัท สร้างด้วย AI (DeepSeek) พร้อมแหล่งอ้างอิง
--                    ให้บัญชีอ่านประกอบการตัดสินใจ (เช่น อายุค่าเสื่อมตามกฎหมาย)
--   สิทธิ์ : ใช้ resource 'accounting.assets' เดิม (ดู=view, สร้าง/อัปเดต=create, ลบ=delete)
-- ============================================================================

create table if not exists public.asset_knowledge (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  topic        text not null,
  title        text,
  summary      text,
  content      text,
  sources      jsonb not null default '[]'::jsonb,
  tags         jsonb not null default '[]'::jsonb,
  model        text,
  generated_at timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid,
  unique (company_id, topic)
);
create index if not exists asset_knowledge_company_idx on public.asset_knowledge(company_id, updated_at desc);

alter table public.asset_knowledge enable row level security;

drop policy if exists "akn_sel" on public.asset_knowledge;
drop policy if exists "akn_ins" on public.asset_knowledge;
drop policy if exists "akn_upd" on public.asset_knowledge;
drop policy if exists "akn_del" on public.asset_knowledge;
create policy "akn_sel" on public.asset_knowledge for select to authenticated
  using (app.has_perm(company_id,'accounting.assets','view'));
create policy "akn_ins" on public.asset_knowledge for insert to authenticated
  with check (app.has_perm(company_id,'accounting.assets','create'));
create policy "akn_upd" on public.asset_knowledge for update to authenticated
  using (app.has_perm(company_id,'accounting.assets','create'))
  with check (app.has_perm(company_id,'accounting.assets','create'));
create policy "akn_del" on public.asset_knowledge for delete to authenticated
  using (app.has_perm(company_id,'accounting.assets','delete'));

drop trigger if exists trg_asset_knowledge_touch on public.asset_knowledge;
create trigger trg_asset_knowledge_touch before update on public.asset_knowledge
  for each row execute function app.touch_updated_at();
