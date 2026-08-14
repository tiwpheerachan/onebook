-- ============================================================================
-- ONEBOOK 0017 : e-Tax Invoice / งานนำเข้าเอกสารด้วย OCR-AI / เชื่อม marketplace
--
-- ทั้งสามเรื่องนี้ต้องใช้บริการภายนอกจึงจะทำงานเต็มรูปแบบ
--   e-Tax Invoice : ใบรับรองดิจิทัลจาก CA + ผู้ให้บริการที่ ETDA รับรอง
--   OCR/AI        : บริการ AICOM (FastAPI) + OpenAI API key
--   Marketplace   : app key จาก Shopee / Lazada / TikTok Open Platform
--
-- โครงสร้างข้อมูลและสถานะทั้งหมดพร้อมแล้ว เหลือเพียงเสียบข้อมูลรับรอง/คีย์
-- ที่จุดเชื่อมต่อ (adapter) ในโค้ดฝั่งแอป
-- ============================================================================

-- ============================ 1) e-Tax Invoice & e-Receipt ==================
do $$ begin
  create type etax_status as enum ('draft','signed','submitted','accepted','rejected','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.etax_documents (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  document_id    uuid not null references public.documents(id) on delete cascade,
  -- รหัสประเภทเอกสารตามมาตรฐาน ETDA (388 = ใบกำกับภาษี, 80 = ใบเพิ่มหนี้, 81 = ใบลดหนี้, T02 = ใบเสร็จรับเงิน)
  doc_type_code  text not null default '388',
  status         etax_status not null default 'draft',
  xml_payload    text,                     -- XML ตามมาตรฐาน ETDA (สร้างในระบบ)
  xml_hash       text,                     -- SHA-256 ของ payload ไว้ตรวจว่าไม่ถูกแก้
  signed_xml     text,                     -- XML ที่ลงลายมือชื่อดิจิทัลแล้ว (จากผู้ให้บริการ)
  provider       text,                     -- ชื่อผู้ให้บริการที่ใช้ส่ง
  provider_ref   text,                     -- เลขอ้างอิงจากผู้ให้บริการ / RD
  submitted_at   timestamptz,
  accepted_at    timestamptz,
  error_message  text,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (document_id)
);
create index if not exists etax_company_idx on public.etax_documents(company_id, status, created_at desc);

-- ============================ 2) งานนำเข้าเอกสารด้วย OCR / AI ===============
do $$ begin
  create type ai_job_status as enum ('queued','processing','review','imported','failed','discarded');
exception when duplicate_object then null; end $$;

create table if not exists public.ai_import_jobs (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  file_name      text not null,
  file_size      int,
  storage_path   text,                     -- ที่เก็บไฟล์ต้นฉบับ (Supabase Storage)
  source         text not null default 'upload',   -- upload | email | marketplace
  status         ai_job_status not null default 'queued',
  -- ผลจากตัวจำแนกเอกสาร เช่น shopee / lazada / tiktok / ads_meta / thai_tax_invoice / unknown
  detected_kind  text,
  confidence     numeric(5,2),
  extracted      jsonb,                    -- ข้อมูลดิบที่ดึงได้ทั้งหมด
  mapped         jsonb,                    -- ข้อมูลที่แปลงเป็นรูปแบบเอกสารของ ONEBOOK แล้ว
  document_id    uuid references public.documents(id) on delete set null,
  error_message  text,
  processed_at   timestamptz,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists ai_jobs_idx on public.ai_import_jobs(company_id, status, created_at desc);

-- ============================ 3) เชื่อมช่องทางขายออนไลน์ ====================
do $$ begin
  create type marketplace_kind as enum ('shopee','lazada','tiktok','line_myshop','woocommerce','other');
exception when duplicate_object then null; end $$;

create table if not exists public.marketplace_accounts (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  kind            marketplace_kind not null,
  shop_name       text not null,
  shop_ref        text,                    -- shop id ของแพลตฟอร์ม
  -- ข้อมูลรับรองเก็บฝั่งเซิร์ฟเวอร์เท่านั้น ไม่ส่งออกทาง API ปกติ (ดู RLS ด้านล่าง)
  credentials     jsonb,
  contact_id      uuid references public.contacts(id),
  channel_id      uuid references public.financial_channels(id),
  income_account_id uuid references public.accounts(id),
  fee_account_id    uuid references public.accounts(id),
  last_sync_at    timestamptz,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (company_id, kind, shop_ref)
);

-- รอบการโอนเงินของแพลตฟอร์ม (settlement) : ยอดขาย - ค่าธรรมเนียม = เงินที่โอนเข้าจริง
create table if not exists public.marketplace_settlements (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  account_id       uuid not null references public.marketplace_accounts(id) on delete cascade,
  settlement_ref   text,
  period_from      date,
  period_to        date,
  paid_date        date,
  gross_amount     numeric(18,2) not null default 0,   -- ยอดขายรวม
  fee_amount       numeric(18,2) not null default 0,   -- ค่าธรรมเนียม/ค่าคอมมิชชั่น
  adjustment       numeric(18,2) not null default 0,   -- ปรับปรุงอื่น ๆ
  net_amount       numeric(18,2) not null default 0,   -- ยอดโอนเข้าบัญชี
  order_count      int not null default 0,
  raw              jsonb,
  document_id      uuid references public.documents(id) on delete set null,
  journal_entry_id uuid references public.journal_entries(id) on delete set null,
  ai_job_id        uuid references public.ai_import_jobs(id) on delete set null,
  imported_by      uuid,
  created_at       timestamptz not null default now(),
  unique (company_id, account_id, settlement_ref)
);
create index if not exists mp_settle_idx on public.marketplace_settlements(company_id, paid_date desc);

-- ------------------------------------------------------------------- RLS
alter table public.etax_documents          enable row level security;
alter table public.ai_import_jobs          enable row level security;
alter table public.marketplace_accounts    enable row level security;
alter table public.marketplace_settlements enable row level security;

drop policy if exists "etax_sel" on public.etax_documents;
drop policy if exists "etax_all" on public.etax_documents;
create policy "etax_sel" on public.etax_documents for select to authenticated
  using (app.has_perm(company_id,'tax.etax','view'));
create policy "etax_all" on public.etax_documents for all to authenticated
  using (app.has_perm(company_id,'tax.etax','edit'))
  with check (app.has_perm(company_id,'tax.etax','edit'));

drop policy if exists "ai_jobs_sel" on public.ai_import_jobs;
drop policy if exists "ai_jobs_all" on public.ai_import_jobs;
create policy "ai_jobs_sel" on public.ai_import_jobs for select to authenticated
  using (app.has_perm(company_id,'documents.ai_import','view'));
create policy "ai_jobs_all" on public.ai_import_jobs for all to authenticated
  using (app.has_perm(company_id,'documents.ai_import','edit'))
  with check (app.has_perm(company_id,'documents.ai_import','edit'));

-- ข้อมูลรับรองของ marketplace ให้เฉพาะผู้มีสิทธิ์ตั้งค่าเท่านั้น
drop policy if exists "mp_acc_sel" on public.marketplace_accounts;
drop policy if exists "mp_acc_all" on public.marketplace_accounts;
create policy "mp_acc_sel" on public.marketplace_accounts for select to authenticated
  using (app.has_perm(company_id,'settings.marketplace','view'));
create policy "mp_acc_all" on public.marketplace_accounts for all to authenticated
  using (app.has_perm(company_id,'settings.marketplace','edit'))
  with check (app.has_perm(company_id,'settings.marketplace','edit'));

drop policy if exists "mp_settle_sel" on public.marketplace_settlements;
drop policy if exists "mp_settle_all" on public.marketplace_settlements;
create policy "mp_settle_sel" on public.marketplace_settlements for select to authenticated
  using (app.has_perm(company_id,'documents','view'));
create policy "mp_settle_all" on public.marketplace_settlements for all to authenticated
  using (app.has_perm(company_id,'documents','create'))
  with check (app.has_perm(company_id,'documents','create'));

drop trigger if exists trg_etax_touch on public.etax_documents;
create trigger trg_etax_touch before update on public.etax_documents
  for each row execute function app.touch_updated_at();
drop trigger if exists trg_ai_jobs_touch on public.ai_import_jobs;
create trigger trg_ai_jobs_touch before update on public.ai_import_jobs
  for each row execute function app.touch_updated_at();

-- ------------------------------------- ลงบัญชีรอบโอนเงินของ marketplace
-- เดบิต เงินฝากธนาคาร (ยอดสุทธิ) + ค่าธรรมเนียม  /  เครดิต ลูกหนี้หรือรายได้
create or replace function public.post_marketplace_settlement(p_settlement uuid)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare
  st      record;
  acc     record;
  v_entry uuid;
  v_line  int := 0;
  v_bank  uuid;
  v_fee   uuid;
  v_rev   uuid;
begin
  select * into st from public.marketplace_settlements where id = p_settlement;
  if not found then raise exception 'SETTLEMENT_NOT_FOUND'; end if;
  if st.journal_entry_id is not null then return st.journal_entry_id; end if;
  if not app.has_perm(st.company_id,'documents','approve') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์ลงบัญชีรอบโอนเงิน';
  end if;
  perform app.assert_period_open(st.company_id, coalesce(st.paid_date, current_date), 'all');

  select * into acc from public.marketplace_accounts where id = st.account_id;

  select fc.account_id into v_bank from public.financial_channels fc where fc.id = acc.channel_id;
  v_bank := coalesce(v_bank, app.acc(st.company_id,'bank'), app.acc(st.company_id,'cash'));
  v_fee  := coalesce(acc.fee_account_id, app.acc(st.company_id,'default_expense'));
  v_rev  := coalesce(acc.income_account_id, app.acc(st.company_id,'sales_revenue'));

  insert into public.journal_entries(company_id, entry_number, entry_date, book, description,
    source_type, source_id, status, is_auto, created_by, posted_by, posted_at)
  values (st.company_id, app.next_entry_number(st.company_id,'RECEIPT',coalesce(st.paid_date, current_date)),
    coalesce(st.paid_date, current_date), 'RECEIPT',
    'รอบโอนเงิน ' || acc.kind::text || ' ' || coalesce(st.settlement_ref,''),
    'marketplace_settlement', st.id, 'posted', true, auth.uid(), auth.uid(), now())
  returning id into v_entry;

  v_line := v_line + 1;
  insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
  values (v_entry, st.company_id, v_line, v_bank, 'เงินโอนเข้าจากแพลตฟอร์ม', st.net_amount, 0);

  if st.fee_amount <> 0 then
    v_line := v_line + 1;
    insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
    values (v_entry, st.company_id, v_line, v_fee, 'ค่าธรรมเนียมแพลตฟอร์ม', st.fee_amount, 0);
  end if;

  if st.adjustment <> 0 then
    v_line := v_line + 1;
    insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
    -- ยอดสุทธิ = ยอดขาย - ค่าธรรมเนียม + ปรับปรุง : ปรับปรุงบวกลงเครดิต ลบลงเดบิต
    values (v_entry, st.company_id, v_line, v_fee, 'ปรับปรุงอื่น ๆ',
            case when st.adjustment < 0 then -st.adjustment else 0 end,
            case when st.adjustment > 0 then  st.adjustment else 0 end);
  end if;

  v_line := v_line + 1;
  insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
  values (v_entry, st.company_id, v_line, v_rev, 'ยอดขายรวมของรอบโอนเงิน', 0, st.gross_amount);

  update public.marketplace_settlements set journal_entry_id = v_entry where id = p_settlement;
  return v_entry;
end $$;

grant execute on function public.post_marketplace_settlement(uuid) to authenticated;
