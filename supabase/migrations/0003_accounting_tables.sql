-- ============================================================================
-- ONEBOOK 0003 : ผังบัญชี ผู้ติดต่อ สินค้า เอกสาร สมุดรายวัน ภาษี
-- ============================================================================

-- ------------------------------------------------------------- ผังบัญชี (COA)
create table if not exists public.accounts (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  code         text not null,
  name_th      text not null,
  name_en      text,
  name_zh      text,
  type         account_type not null,
  parent_code  text,
  is_header    boolean not null default false,   -- บัญชีหมวด ไม่ให้ลงรายการ
  is_system    boolean not null default false,   -- ห้ามลบ ระบบใช้อ้างอิง
  system_key   text,                             -- เช่น 'ar','ap','vat_input','vat_output','wht_paid'
  normal_side  char(1) not null default 'D' check (normal_side in ('D','C')),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (company_id, code)
);
create index if not exists accounts_company_idx on public.accounts(company_id, code);
create index if not exists accounts_syskey_idx on public.accounts(company_id, system_key);

-- ---------------------------------------------------------------- ผู้ติดต่อ
create table if not exists public.contacts (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  code          text not null,
  kind          contact_kind not null default 'customer',
  name          text not null,
  name_en       text,
  legal_name    text,
  tax_id        text,
  branch_code   text default '00000',
  branch_name   text default 'สำนักงานใหญ่',
  is_juristic   boolean not null default true,   -- นิติบุคคล -> ภ.ง.ด.53, บุคคล -> ภ.ง.ด.3
  address       text,
  district      text,
  province      text,
  postcode      text,
  country       char(2) default 'TH',
  phone         text,
  email         text,
  contact_person text,
  credit_days   int not null default 30,
  credit_limit  numeric(18,2) not null default 0,
  ar_account_id uuid references public.accounts(id),
  ap_account_id uuid references public.accounts(id),
  notes         text,
  is_active     boolean not null default true,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (company_id, code),
  constraint contacts_taxid_chk check (tax_id is null or tax_id ~ '^[0-9]{10,13}$')
);
create index if not exists contacts_company_idx on public.contacts(company_id, kind, is_active);

-- ------------------------------------------------------------------- สินค้า
create table if not exists public.products (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies(id) on delete cascade,
  sku                  text not null,
  barcode              text,
  name                 text not null,
  name_en              text,
  name_zh              text,
  kind                 text not null default 'good' check (kind in ('good','service','asset')),
  unit                 text not null default 'ชิ้น',
  category             text,
  sale_price           numeric(18,4) not null default 0,
  purchase_price       numeric(18,4) not null default 0,
  vat_treatment        vat_treatment not null default 'exclusive',
  track_inventory      boolean not null default true,
  reorder_point        numeric(18,4) default 0,
  income_account_id    uuid references public.accounts(id),
  expense_account_id   uuid references public.accounts(id),
  inventory_account_id uuid references public.accounts(id),
  cogs_account_id      uuid references public.accounts(id),
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (company_id, sku)
);
create index if not exists products_company_idx on public.products(company_id, is_active);

-- ------------------------------------------------------------ ช่องทางการเงิน
create table if not exists public.financial_channels (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  code         text not null,
  name         text not null,
  kind         channel_kind not null default 'bank',
  bank_name    text,
  bank_branch  text,
  account_no   text,
  account_id   uuid references public.accounts(id),
  opening_balance numeric(18,2) not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (company_id, code)
);

-- ---------------------------------------------------------- มิติ/กลุ่มจัดประเภท
create table if not exists public.dimensions (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  group_name text not null default 'แผนก',
  code       text not null,
  name       text not null,
  is_active  boolean not null default true,
  unique (company_id, group_name, code)
);

-- --------------------------------------------------------------------- เอกสาร
create table if not exists public.documents (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  kind           doc_kind not null,
  doc_number     text not null,
  doc_date       date not null,
  due_date       date,
  contact_id     uuid references public.contacts(id),
  contact_snapshot jsonb,                 -- เก็บชื่อ/ที่อยู่/เลขภาษี ณ วันออกเอกสาร
  reference      text,
  ref_document_id uuid references public.documents(id),
  dimension_id   uuid references public.dimensions(id),
  currency       char(3) not null default 'THB',
  exchange_rate  numeric(18,8) not null default 1,
  subtotal       numeric(18,2) not null default 0,
  discount_amount numeric(18,2) not null default 0,
  vat_base       numeric(18,2) not null default 0,
  vat_amount     numeric(18,2) not null default 0,
  wht_amount     numeric(18,2) not null default 0,
  grand_total    numeric(18,2) not null default 0,
  net_payable    numeric(18,2) not null default 0,   -- grand_total - wht
  paid_amount    numeric(18,2) not null default 0,
  status         doc_status not null default 'draft',
  notes          text,
  internal_note  text,
  journal_entry_id uuid,
  created_by     uuid references public.profiles(id),
  approved_by    uuid references public.profiles(id),
  approved_at    timestamptz,
  voided_by      uuid references public.profiles(id),
  voided_at      timestamptz,
  void_reason    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (company_id, kind, doc_number)
);
create index if not exists documents_company_date_idx on public.documents(company_id, doc_date desc);
create index if not exists documents_kind_idx on public.documents(company_id, kind, status);
create index if not exists documents_contact_idx on public.documents(contact_id);

create table if not exists public.document_lines (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.documents(id) on delete cascade,
  company_id    uuid not null references public.companies(id) on delete cascade,
  line_no       int not null default 1,
  product_id    uuid references public.products(id),
  description   text not null default '',
  quantity      numeric(18,4) not null default 1,
  unit          text,
  unit_price    numeric(18,4) not null default 0,
  discount_pct  numeric(9,4) not null default 0,
  discount_amt  numeric(18,2) not null default 0,
  vat_treatment vat_treatment not null default 'exclusive',
  vat_rate      numeric(5,2) not null default 7,
  wht_code      text,                       -- อ้าง wht_types.code
  wht_rate      numeric(5,2) not null default 0,
  line_amount   numeric(18,2) not null default 0,  -- ก่อน VAT หลังส่วนลด
  vat_amount    numeric(18,2) not null default 0,
  wht_amount    numeric(18,2) not null default 0,
  account_id    uuid references public.accounts(id),
  dimension_id  uuid references public.dimensions(id)
);
create index if not exists document_lines_doc_idx on public.document_lines(document_id);

-- -------------------------------------------------------------- การรับ/จ่ายเงิน
create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  direction     text not null check (direction in ('receive','pay')),
  doc_number    text not null,
  doc_date      date not null,
  contact_id    uuid references public.contacts(id),
  channel_id    uuid references public.financial_channels(id),
  amount        numeric(18,2) not null default 0,
  wht_amount    numeric(18,2) not null default 0,
  fee_amount    numeric(18,2) not null default 0,
  note          text,
  status        doc_status not null default 'approved',
  journal_entry_id uuid,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  unique (company_id, direction, doc_number)
);

create table if not exists public.payment_allocations (
  id          uuid primary key default gen_random_uuid(),
  payment_id  uuid not null references public.payments(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  amount      numeric(18,2) not null default 0
);

-- ------------------------------------------------------------- สมุดรายวัน (GL)
create table if not exists public.journal_entries (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  entry_number text not null,
  entry_date   date not null,
  book         text not null default 'GL' check (book in ('GL','SALE','PURCHASE','RECEIPT','PAYMENT','ADJ')),
  description  text,
  source_type  text,
  source_id    uuid,
  status       journal_status not null default 'posted',
  total_debit  numeric(18,2) not null default 0,
  total_credit numeric(18,2) not null default 0,
  is_auto      boolean not null default false,
  reversed_by  uuid references public.journal_entries(id),
  created_by   uuid references public.profiles(id),
  posted_by    uuid references public.profiles(id),
  posted_at    timestamptz,
  created_at   timestamptz not null default now(),
  unique (company_id, entry_number)
);
create index if not exists je_company_date_idx on public.journal_entries(company_id, entry_date desc);

create table if not exists public.journal_lines (
  id           uuid primary key default gen_random_uuid(),
  entry_id     uuid not null references public.journal_entries(id) on delete cascade,
  company_id   uuid not null references public.companies(id) on delete cascade,
  line_no      int not null default 1,
  account_id   uuid not null references public.accounts(id),
  description  text,
  debit        numeric(18,2) not null default 0,
  credit       numeric(18,2) not null default 0,
  contact_id   uuid references public.contacts(id),
  dimension_id uuid references public.dimensions(id)
);
create index if not exists jl_entry_idx on public.journal_lines(entry_id);
create index if not exists jl_account_idx on public.journal_lines(company_id, account_id);

-- --------------------------------------------------------------- สินค้าคงเหลือ
create table if not exists public.inventory_moves (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  move_date   date not null,
  document_id uuid references public.documents(id) on delete cascade,
  qty_in      numeric(18,4) not null default 0,
  qty_out     numeric(18,4) not null default 0,
  unit_cost   numeric(18,4) not null default 0,
  value_in    numeric(18,2) not null default 0,
  value_out   numeric(18,2) not null default 0,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists inv_moves_idx on public.inventory_moves(company_id, product_id, move_date);

-- ------------------------------------------------ ประเภทเงินได้หัก ณ ที่จ่าย
create table if not exists public.wht_types (
  code        text primary key,
  pnd_form    text not null,                 -- ภ.ง.ด.1 / 2 / 3 / 53
  name_th     text not null,
  name_en     text,
  default_rate numeric(5,2) not null,
  applies_to  text not null default 'both' check (applies_to in ('personal','juristic','both')),
  sort_order  int not null default 0
);

create table if not exists public.wht_certificates (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  cert_number text not null,
  cert_date   date not null,
  pnd_form    text not null,
  contact_id  uuid references public.contacts(id),
  payment_id  uuid references public.payments(id) on delete set null,
  tax_id      text,
  base_total  numeric(18,2) not null default 0,
  wht_total   numeric(18,2) not null default 0,
  condition_code smallint not null default 1,  -- 1 หักภาษี ณ ที่จ่าย
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  unique (company_id, cert_number)
);

create table if not exists public.wht_certificate_lines (
  id          uuid primary key default gen_random_uuid(),
  cert_id     uuid not null references public.wht_certificates(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  wht_code    text references public.wht_types(code),
  description text,
  pay_date    date,
  base_amount numeric(18,2) not null default 0,
  rate        numeric(5,2) not null default 0,
  wht_amount  numeric(18,2) not null default 0
);

-- ----------------------------------------------------------------- แนบไฟล์
create table if not exists public.attachments (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  document_id uuid references public.documents(id) on delete cascade,
  storage_path text not null,
  file_name   text not null,
  mime_type   text,
  size_bytes  bigint,
  uploaded_by uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);
