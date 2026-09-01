-- =====================================================================
-- 0053 : พนักงานขายและเขตการขาย
--
--  ช่องว่างจากคู่มือ Express : แฟ้มลูกค้าของเขาผูกพนักงานขายและเขตการขาย
--  ไว้กับลูกค้าแต่ละราย (2.ขาย → 6. รายละเอียดลูกค้า และ 8. รายละเอียดพนักงานขาย)
--  ทำให้คิดค่าคอมมิชชันและดูยอดขายรายคนรายเขตได้ ของเราไม่มีทั้งสองอย่าง
--
--  ข้อตัดสินใจสำคัญ : เก็บพนักงานขายไว้ที่ "เอกสาร" ไม่ใช่แค่ที่ลูกค้า
--
--  ถ้าเก็บที่ลูกค้าอย่างเดียว แล้ววันหนึ่งเปลี่ยนผู้ดูแลลูกค้ารายนั้น
--  ยอดขายย้อนหลังทั้งหมดจะย้ายไปเป็นของคนใหม่ทันที ค่าคอมมิชชันที่จ่ายไปแล้ว
--  จะไม่ตรงกับรายงานอีกเลย และไม่มีร่องรอยว่าเคยเป็นของใคร
--
--  จึงให้ลูกค้าเก็บ "ผู้ดูแลปัจจุบัน" ไว้เป็นค่าตั้งต้น แล้วคัดลอกลงเอกสาร
--  ตอนสร้าง เอกสารที่ออกไปแล้วจึงตรึงว่าเป็นยอดของใคร ณ วันนั้น
--  หลักเดียวกับ contact_snapshot ที่ระบบนี้ใช้อยู่แล้ว
-- =====================================================================

-- ------------------------------------------------------------------------
-- 1) พนักงานขาย
--
-- ไม่ผูกกับ profiles เพราะพนักงานขายหลายรายไม่มีบัญชีผู้ใช้ในระบบ
-- แต่เชื่อมได้ถ้ามี เพื่อให้ดูยอดของตัวเองได้ในอนาคต
-- ------------------------------------------------------------------------
create table if not exists public.sales_reps (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code       text not null,
  name       text not null,
  user_id    uuid references public.profiles(id),
  phone      text,
  email      text,
  -- อัตราคอมมิชชันตั้งต้นเป็นร้อยละของยอดขายก่อนภาษี
  commission_rate numeric(6,3) not null default 0
    check (commission_rate >= 0 and commission_rate <= 100),
  is_active  boolean not null default true,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

-- ------------------------------------------------------------------------
-- 2) เขตการขาย
-- ------------------------------------------------------------------------
create table if not exists public.sales_zones (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code       text not null,
  name       text not null,
  is_active  boolean not null default true,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

-- ------------------------------------------------------------------------
-- 3) ผูกเข้ากับลูกค้าและเอกสาร
-- ------------------------------------------------------------------------
alter table public.contacts
  add column if not exists sales_rep_id  uuid references public.sales_reps(id),
  add column if not exists sales_zone_id uuid references public.sales_zones(id);

alter table public.documents
  add column if not exists sales_rep_id  uuid references public.sales_reps(id),
  add column if not exists sales_zone_id uuid references public.sales_zones(id);

comment on column public.contacts.sales_rep_id is
  'ผู้ดูแลลูกค้ารายนี้ในปัจจุบัน — ใช้เป็นค่าตั้งต้นของเอกสารใหม่เท่านั้น';
comment on column public.documents.sales_rep_id is
  'พนักงานขายของเอกสารใบนี้ ณ วันที่ออก — ตรึงไว้เพื่อให้ยอดย้อนหลังไม่เปลี่ยนเมื่อสลับผู้ดูแล';

create index if not exists documents_rep_idx  on public.documents (company_id, sales_rep_id)
  where sales_rep_id is not null;
create index if not exists documents_zone_idx on public.documents (company_id, sales_zone_id)
  where sales_zone_id is not null;

-- ------------------------------------------------------------------------
-- 4) เอกสารใหม่รับพนักงานขายและเขตจากลูกค้าให้เอง
--
-- เติมเฉพาะตอนสร้างและเฉพาะช่องที่ยังว่าง ค่าที่ระบุมาเองจึงมีผลเหนือกว่า
-- ------------------------------------------------------------------------
create or replace function app.doc_fill_sales_rep()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare c record;
begin
  if new.contact_id is null then return new; end if;
  if new.sales_rep_id is not null and new.sales_zone_id is not null then return new; end if;

  select sales_rep_id, sales_zone_id into c
  from public.contacts where id = new.contact_id;

  new.sales_rep_id  := coalesce(new.sales_rep_id,  c.sales_rep_id);
  new.sales_zone_id := coalesce(new.sales_zone_id, c.sales_zone_id);
  return new;
end $$;

drop trigger if exists trg_doc_sales_rep on public.documents;
create trigger trg_doc_sales_rep
  before insert on public.documents
  for each row execute function app.doc_fill_sales_rep();

-- ------------------------------------------------------------------------
-- 5) RLS — ใช้สิทธิ์ชุดเดียวกับผู้ติดต่อ เพราะเป็นข้อมูลหลักฝั่งขายเหมือนกัน
-- ------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['sales_reps','sales_zones'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force  row level security', t);
    execute format('drop policy if exists "%1$s_sel" on public.%1$I', t);
    execute format('create policy "%1$s_sel" on public.%1$I for select to authenticated '
                   'using (app.has_perm(company_id, ''contacts'', ''view''))', t);
    execute format('drop policy if exists "%1$s_all" on public.%1$I', t);
    execute format('create policy "%1$s_all" on public.%1$I for all to authenticated '
                   'using (app.has_perm(company_id, ''contacts'', ''edit'')) '
                   'with check (app.has_perm(company_id, ''contacts'', ''edit''))', t);
    execute format('drop trigger if exists trg_audit_%1$s on public.%1$I', t);
    execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$I '
                   'for each row execute function app.audit_trigger()', t);
    execute format('drop trigger if exists trg_touch_%1$s on public.%1$I', t);
    execute format('create trigger trg_touch_%1$s before update on public.%1$I '
                   'for each row execute function app.touch_updated_at()', t);
  end loop;
end $$;

-- ------------------------------------------------------------------------
-- 6) รายการพนักงานขายและเขต พร้อมยอดขายสะสม
-- ------------------------------------------------------------------------
create or replace function public.rpt_sales_reps(p_company uuid)
returns json
language sql
stable
set search_path = public, app
as $$
  select coalesce(jsonb_agg(x order by x->>'code'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', r.id, 'code', r.code, 'name', r.name,
      'phone', r.phone, 'email', r.email,
      'commission_rate', r.commission_rate,
      'is_active', r.is_active,
      'customer_count', (select count(*) from public.contacts c
                         where c.sales_rep_id = r.id and c.is_active)
    ) as x
    from public.sales_reps r
    where r.company_id = p_company
  ) t;
$$;

create or replace function public.rpt_sales_zones(p_company uuid)
returns json
language sql
stable
set search_path = public, app
as $$
  select coalesce(jsonb_agg(x order by x->>'code'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', z.id, 'code', z.code, 'name', z.name, 'is_active', z.is_active,
      'customer_count', (select count(*) from public.contacts c
                         where c.sales_zone_id = z.id and c.is_active)
    ) as x
    from public.sales_zones z
    where z.company_id = p_company
  ) t;
$$;

grant execute on function public.rpt_sales_reps(uuid)  to authenticated;
grant execute on function public.rpt_sales_zones(uuid) to authenticated;

-- ------------------------------------------------------------------------
-- 7) ยอดขายและค่าคอมมิชชันรายพนักงาน / รายเขต
--
-- นับเฉพาะเอกสารที่ลงบัญชีแล้วและยังไม่ถูกยกเลิก ตัวเลขจึงตรงกับงบเสมอ
-- ใบลดหนี้เป็นยอดติดลบอยู่แล้ว จึงหักออกให้เองตามเครื่องหมาย
-- ค่าคอมมิชชันคิดจากมูลค่าก่อนภาษี ไม่ใช่ยอดรวม เพราะภาษีไม่ใช่รายได้ของกิจการ
-- ------------------------------------------------------------------------
create or replace function public.rpt_sales_by_rep(
  p_company uuid,
  p_from    date,
  p_to      date,
  p_dim     text default 'rep'      -- rep | zone
)
returns json
language sql
stable
security definer
set search_path = public, app
as $$
  with docs as (
    select
      d.sales_rep_id, d.sales_zone_id,
      d.vat_base, d.grand_total, d.id
    from public.documents d
    where d.company_id = p_company
      and d.status::text not in ('void','draft')
      and d.doc_date between p_from and p_to
      and d.kind::text in ('invoice','tax_invoice','credit_note','debit_note')
      and (app.has_perm(p_company,'report','view'))
  ),
  grouped as (
    select
      case when p_dim = 'zone' then d.sales_zone_id else d.sales_rep_id end as key_id,
      count(*)                as doc_count,
      sum(d.vat_base)         as base_total,
      sum(d.grand_total)      as gross_total
    from docs d
    group by 1
  )
  select coalesce(jsonb_agg(x order by (x->>'base_total')::numeric desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', g.key_id,
      'code', case when p_dim = 'zone' then z.code else r.code end,
      'name', case when p_dim = 'zone' then z.name else r.name end,
      'doc_count', g.doc_count,
      'base_total', round(g.base_total, 2),
      'gross_total', round(g.gross_total, 2),
      'commission_rate', case when p_dim = 'zone' then null else r.commission_rate end,
      'commission', case when p_dim = 'zone' then null
                         else round(g.base_total * coalesce(r.commission_rate, 0) / 100, 2) end
    ) as x
    from grouped g
    left join public.sales_reps  r on r.id = g.key_id and p_dim <> 'zone'
    left join public.sales_zones z on z.id = g.key_id and p_dim = 'zone'
  ) t;
$$;

grant execute on function public.rpt_sales_by_rep(uuid, date, date, text) to authenticated;

comment on function public.rpt_sales_by_rep is
  'ยอดขายและค่าคอมมิชชันรายพนักงานขายหรือรายเขต — คิดคอมจากมูลค่าก่อนภาษี เอกสารที่ไม่ระบุอยู่ในกลุ่ม null';
