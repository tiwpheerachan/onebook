-- ============================================================================
-- ONEBOOK 0002 : Organisation, users, roles, security
-- ============================================================================

-- ------------------------------------------------------------------ companies
create table if not exists public.companies (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  parent_id         uuid references public.companies(id) on delete restrict,
  name_th           text not null,
  name_en           text,
  name_zh           text,
  legal_form        text default 'บริษัทจำกัด',
  tax_id            text,                        -- เลขประจำตัวผู้เสียภาษี 13 หลัก
  branch_code       text default '00000',        -- สำนักงานใหญ่ = 00000
  branch_name       text default 'สำนักงานใหญ่',
  address_th        text,
  address_en        text,
  phone             text,
  email             text,
  website           text,
  logo_url          text,
  vat_registered    boolean not null default true,
  vat_rate          numeric(5,2) not null default 7.00,
  fiscal_year_start smallint not null default 1,  -- เดือนเริ่มรอบบัญชี
  base_currency     char(3) not null default 'THB',
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint companies_taxid_chk check (tax_id is null or tax_id ~ '^[0-9]{13}$'),
  constraint companies_fy_chk check (fiscal_year_start between 1 and 12)
);
create index if not exists companies_parent_idx on public.companies(parent_id);

-- ------------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          citext not null,
  full_name      text not null default '',
  employee_code  text,
  phone          text,
  locale         text not null default 'th' check (locale in ('th','en','zh')),
  is_group_admin boolean not null default false,   -- ผู้ดูแลระดับกลุ่มบริษัท
  is_active      boolean not null default true,
  mfa_enforced   boolean not null default true,
  last_login_at  timestamptz,
  last_login_ip  inet,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------- roles
create table if not exists public.roles (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references public.companies(id) on delete cascade, -- null = role กลาง ใช้ได้ทุกบริษัท
  code        text not null,
  name_th     text not null,
  name_en     text,
  name_zh     text,
  description text,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (company_id, code)
);

-- สิทธิ์ระดับละเอียด : 1 แถว = 1 ทรัพยากร
-- actions: view, create, edit, delete, approve, post, void, export, unlock
create table if not exists public.role_permissions (
  id          uuid primary key default gen_random_uuid(),
  role_id     uuid not null references public.roles(id) on delete cascade,
  resource    text not null,          -- เช่น 'sales','purchase','journal','report.pl','settings.users'
  actions     text[] not null default '{}',
  field_mask  text[] not null default '{}',  -- ฟิลด์ที่ "ซ่อน" จากบทบาทนี้ เช่น {'unit_price','total'}
  row_filter  jsonb,                  -- เงื่อนไขจำกัดแถวเพิ่มเติม เช่น {"created_by":"self"}
  unique (role_id, resource)
);

-- ------------------------------------------------------- membership per company
create table if not exists public.user_companies (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles(id) on delete cascade,
  company_id             uuid not null references public.companies(id) on delete cascade,
  role_id                uuid not null references public.roles(id) on delete restrict,
  can_view_subsidiaries  boolean not null default false, -- มองทะลุถึงบริษัทลูก
  is_default             boolean not null default false,
  is_active              boolean not null default true,
  valid_from             date,
  valid_to               date,
  created_at             timestamptz not null default now(),
  unique (user_id, company_id)
);
create index if not exists user_companies_user_idx on public.user_companies(user_id);
create index if not exists user_companies_company_idx on public.user_companies(company_id);

-- ------------------------------------------------- freeze / ปิดงวดบัญชี
create table if not exists public.period_locks (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  locked_through date not null,             -- ห้ามแก้ไขข้อมูลที่วันที่ <= ค่านี้
  scope          text not null default 'all' check (scope in ('all','sales','purchase','journal','payroll')),
  reason         text,
  locked_by      uuid references public.profiles(id),
  locked_at      timestamptz not null default now(),
  released_by    uuid references public.profiles(id),
  released_at    timestamptz,
  is_active      boolean not null default true
);
create index if not exists period_locks_company_idx on public.period_locks(company_id, is_active);

-- ------------------------------------------------------------------ audit log
create table if not exists public.audit_logs (
  id          bigserial primary key,
  company_id  uuid references public.companies(id) on delete set null,
  user_id     uuid,
  user_email  text,
  action      text not null,       -- insert / update / delete / login / login_failed / export / unlock
  resource    text not null,
  record_id   text,
  before_data jsonb,
  after_data  jsonb,
  ip_address  inet,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists audit_logs_company_idx on public.audit_logs(company_id, created_at desc);
create index if not exists audit_logs_resource_idx on public.audit_logs(resource, record_id);

-- ------------------------------------------------------------- ip allow list
create table if not exists public.ip_allowlist (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade, -- null = ทั้งกลุ่ม
  cidr       cidr not null,
  label      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------- document numbering
create table if not exists public.doc_sequences (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  doc_kind    doc_kind not null,
  prefix      text not null,
  pattern     text not null default '{PREFIX}{YY}{MM}-{SEQ:4}',
  next_number int not null default 1,
  reset_cycle text not null default 'monthly' check (reset_cycle in ('never','yearly','monthly')),
  last_period text,
  unique (company_id, doc_kind)
);
