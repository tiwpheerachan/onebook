-- =====================================================================
-- 0034 : ภาษีซื้อยังไม่ถึงกำหนด และการเลือกเดือนภาษีที่จะใช้สิทธิ์
--
--  ปัญหาจริง : ใบกำกับภาษีซื้อมาถึงช้ากว่ารอบยื่น หรือของยังไม่ได้รับ
--  จึงยังใช้สิทธิ์ภาษีซื้อในเดือนนั้นไม่ได้ ต้องพักไว้ก่อนแล้วค่อยยกไปใช้เดือนหลัง
--
--  เดิม rpt_vat อิงเดือนของ doc_date อย่างเดียว ย้ายเดือนภาษีไม่ได้เลย
--  ต้องไปแก้วันที่เอกสารซึ่งผิด เพราะวันที่ใบกำกับเป็นข้อเท็จจริงที่แก้ไม่ได้
--
--  ทางออก : แยก "วันที่เอกสาร" ออกจาก "เดือนภาษีที่ใช้สิทธิ์"
--    vat_tax_month  เดือนที่จะเอาไปแสดงในรายงานภาษี (null = เดือนของ doc_date)
--    vat_deferred   พักไว้ ยังไม่ใช้สิทธิ์เดือนไหน
--
--  หมายเหตุเรื่องกฎหมาย : ภาษีซื้อใช้สิทธิ์ได้ภายใน 6 เดือนนับจากเดือนที่ระบุ
--  ในใบกำกับภาษี ระบบจึงคำนวณระยะห่างไว้ให้เตือน แต่ไม่บล็อก
--  เพราะมีข้อยกเว้นที่ระบบไม่รู้ และคนทำบัญชีต้องเป็นผู้ตัดสิน
-- =====================================================================

alter table public.documents
  add column if not exists vat_tax_month date,
  add column if not exists vat_deferred  boolean not null default false,
  add column if not exists vat_note      text;

comment on column public.documents.vat_tax_month is
  'เดือนภาษีที่ใช้สิทธิ์ (วันที่ 1 ของเดือน) — null = ใช้เดือนของ doc_date ตามปกติ';
comment on column public.documents.vat_deferred is
  'พักภาษีซื้อไว้ก่อน ยังไม่นำไปแสดงในรายงานภาษีเดือนใด';

-- เก็บเป็นวันที่ 1 ของเดือนเสมอ กันข้อมูลเพี้ยนตั้งแต่ต้นทาง
alter table public.documents drop constraint if exists documents_vat_month_chk;
alter table public.documents add constraint documents_vat_month_chk
  check (vat_tax_month is null or vat_tax_month = date_trunc('month', vat_tax_month)::date);

create index if not exists documents_vat_deferred_idx
  on public.documents (company_id) where vat_deferred;

-- ------------------------------------------------------------------------
-- รายงานภาษีซื้อ-ขาย : อิง "เดือนภาษี" แทนเดือนของวันที่เอกสาร
--
-- เอกสารที่ไม่เคยตั้งค่าอะไรจะได้เดือนของ doc_date เหมือนเดิมทุกประการ
-- ของเดิมจึงไม่เปลี่ยนพฤติกรรม ส่วนที่พักไว้จะหายออกจากรายงานจนกว่าจะกำหนดเดือน
-- ------------------------------------------------------------------------
create or replace function public.rpt_vat(p_company uuid, p_year int, p_month int, p_side text default 'output')
returns table (
  seq bigint, doc_date date, doc_number text, contact_name text, tax_id text,
  branch text, base_amount numeric, vat_amount numeric
) language sql stable security definer set search_path = public, app as $$
  select row_number() over (order by d.doc_date, d.doc_number),
         d.doc_date, d.doc_number,
         coalesce(c.name, d.contact_snapshot->>'name'),
         coalesce(c.tax_id, d.contact_snapshot->>'tax_id'),
         coalesce(c.branch_code, '00000'),
         d.vat_base, d.vat_amount
  from public.documents d
  left join public.contacts c on c.id = d.contact_id
  where d.company_id = p_company
    and d.status <> 'void'
    and not d.vat_deferred
    and coalesce(d.vat_tax_month, date_trunc('month', d.doc_date)::date)
        = make_date(p_year, p_month, 1)
    and d.vat_amount <> 0
    and (case when p_side = 'output' then d.kind::text in ('tax_invoice','invoice','receipt','credit_note','debit_note')
              else d.kind::text in ('bill','expense','purchase_credit_note','purchase_debit_note') end)
    and (app.has_perm(p_company,'tax','view') or app.has_perm(p_company,'report','view'))
  order by 2, 3;
$$;

-- ------------------------------------------------------------------------
-- รายการภาษีซื้อที่ยังไม่ได้ใช้สิทธิ์
--
-- รวมทั้งที่พักไว้เอง และที่ถูกยกไปใช้เดือนอื่นซึ่งยังไม่ถึงเดือนนั้น
-- security invoker ให้ RLS ของ documents กรองสิทธิ์เอง
-- ------------------------------------------------------------------------
create or replace function public.rpt_vat_pending(
  p_company uuid,
  p_filter  text default 'all',   -- all | deferred | moved
  p_q       text default null
)
returns json
language sql
stable
set search_path = public, app
as $$
with args as (
  select '%' || replace(replace(btrim(coalesce(p_q,'')),'%','\%'),'_','\_') || '%' as pat,
         nullif(btrim(coalesce(p_q,'')),'') as raw,
         date_trunc('month', current_date)::date as this_month
),
rows as (
  select
    d.id, d.doc_number, d.doc_date, d.kind::text as kind, d.status::text as status,
    d.vat_base, d.vat_amount, d.vat_deferred, d.vat_tax_month, d.vat_note,
    coalesce(c.name, d.contact_snapshot->>'name') as contact_name,
    coalesce(c.tax_id, d.contact_snapshot->>'tax_id') as tax_id,
    date_trunc('month', d.doc_date)::date as doc_month,
    -- ระยะห่างจากเดือนใบกำกับถึงเดือนที่จะใช้สิทธิ์ ใช้เตือนเรื่องกรอบ 6 เดือน
    case when d.vat_tax_month is not null
         then (extract(year from d.vat_tax_month) - extract(year from d.doc_date)) * 12
            + (extract(month from d.vat_tax_month) - extract(month from d.doc_date))
    end::int as months_shift,
    ((extract(year from a.this_month) - extract(year from d.doc_date)) * 12
   + (extract(month from a.this_month) - extract(month from d.doc_date)))::int as months_aged
  from public.documents d
  left join public.contacts c on c.id = d.contact_id
  cross join args a
  where d.company_id = p_company
    and d.status <> 'void'
    and d.vat_amount <> 0
    and d.kind::text in ('bill','expense','purchase_credit_note','purchase_debit_note')
    and (d.vat_deferred
         or coalesce(d.vat_tax_month, date_trunc('month', d.doc_date)::date) > a.this_month)
    and (a.raw is null or d.doc_number ilike a.pat or c.name ilike a.pat
         or (d.contact_snapshot->>'name') ilike a.pat)
)
select json_build_object(
  'rows', coalesce((
    select jsonb_agg(to_jsonb(x) order by x.doc_date)
    from (
      select * from rows
      where p_filter is null or p_filter = 'all'
         or (p_filter = 'deferred' and vat_deferred)
         or (p_filter = 'moved' and not vat_deferred)
    ) x
  ), '[]'::jsonb),
  'summary', json_build_object(
    'count',        (select count(*) from rows),
    'vat_total',    (select coalesce(sum(vat_amount), 0) from rows),
    'deferred',     (select count(*) from rows where vat_deferred),
    'moved',        (select count(*) from rows where not vat_deferred),
    -- เกินกรอบ 6 เดือนแล้ว เสี่ยงใช้สิทธิ์ไม่ได้ ต้องรีบจัดการ
    'over_six',     (select count(*) from rows where months_aged > 6)
  )
);
$$;

grant execute on function public.rpt_vat_pending(uuid, text, text) to authenticated;

-- ------------------------------------------------------------------------
-- กำหนดเดือนภาษีของเอกสาร หรือพักไว้ก่อน
--
--   p_month = null + p_defer = true   → พักไว้ ไม่แสดงในรายงานเดือนใด
--   p_month = 'YYYY-MM-01'            → ยกไปใช้สิทธิ์เดือนนั้น
--   p_month = null + p_defer = false  → คืนค่าเดิม ใช้เดือนของวันที่เอกสาร
-- ------------------------------------------------------------------------
create or replace function public.set_vat_tax_month(
  p_document uuid,
  p_month    date default null,
  p_defer    boolean default false,
  p_note     text default null
)
returns json
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_company uuid;
  v_date    date;
  v_lock    date;
  v_month   date := case when p_month is null then null else date_trunc('month', p_month)::date end;
begin
  select company_id, doc_date into v_company, v_date
  from public.documents where id = p_document;
  if v_company is null then raise exception 'DOCUMENT_NOT_FOUND'; end if;

  if not app.has_perm(v_company, 'tax', 'edit') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์แก้ไขข้อมูลภาษี';
  end if;

  -- ห้ามยกภาษีเข้าไปในงวดที่ปิดไปแล้ว ตัวเลขที่ยื่นไปแล้วจะไม่ตรงกับระบบ
  -- ใช้ตัวช่วยเดิมจาก 0004 ที่อ่านจาก period_locks ไม่ใช่คอลัมน์บน companies
  v_lock := app.locked_through(v_company, 'all');
  if v_month is not null and v_lock is not null and v_month <= v_lock then
    raise exception 'PERIOD_LOCKED: งวดถึง % ปิดแล้ว ยกภาษีเข้าเดือนนั้นไม่ได้', v_lock;
  end if;

  -- ย้อนไปใช้สิทธิ์ก่อนเดือนของใบกำกับไม่ได้ ผิดหลักการโดยสิ้นเชิง
  if v_month is not null and v_month < date_trunc('month', v_date)::date then
    raise exception 'VAT_MONTH_BEFORE_DOC: เลือกเดือนภาษีก่อนเดือนของใบกำกับไม่ได้';
  end if;

  update public.documents set
    vat_tax_month = case when p_defer then null else v_month end,
    vat_deferred  = coalesce(p_defer, false),
    vat_note      = coalesce(p_note, vat_note),
    updated_at    = now()
  where id = p_document;

  return json_build_object('ok', true, 'vat_tax_month', case when p_defer then null else v_month end);
end $$;

grant execute on function public.set_vat_tax_month(uuid, date, boolean, text) to authenticated;

comment on function public.set_vat_tax_month is
  'กำหนดเดือนภาษีที่จะใช้สิทธิ์ภาษีซื้อ หรือพักไว้ก่อน — แยกจากวันที่เอกสารซึ่งเป็นข้อเท็จจริงที่แก้ไม่ได้';
