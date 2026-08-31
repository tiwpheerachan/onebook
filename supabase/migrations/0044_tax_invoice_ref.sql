-- =====================================================================
-- 0044 : เลขที่และวันที่ใบกำกับภาษีซื้อ และกรอบ 6 เดือนที่บังคับจริง
--
--  สิ่งที่ 0034 มองข้าม : สมมติว่า doc_date คือวันที่ในใบกำกับภาษีเสมอ
--  แต่ของจริงบิลซื้อมักถูกตั้งจาก "ใบแจ้งหนี้" ตั้งแต่ยังไม่ได้รับใบกำกับภาษี
--  เลขที่และวันที่ของใบกำกับจึงเป็นคนละตัวกับเลขที่และวันที่ของเอกสารที่ตั้งไว้
--
--  ผลที่ตามมาคือคำนวณกรอบ 6 เดือนผิด เพราะนับจากวันที่ใบแจ้งหนี้
--  และรายงานภาษีซื้อแสดงเลขที่ใบแจ้งหนี้แทนเลขที่ใบกำกับ ซึ่งใช้ยื่นไม่ได้
--
--  จึงเพิ่มสองช่องนี้แยกออกมา
--    tax_invoice_number  เลขที่ใบกำกับภาษีที่ได้รับจริง
--    tax_invoice_date    วันที่ในใบกำกับภาษี
--  ทั้งคู่ว่างได้ ถ้าว่างแปลว่าเอกสารนี้เป็นใบกำกับในตัวเอง ใช้ค่าของเอกสารแทน
--  ของเดิมที่ไม่เคยกรอกจึงไม่เปลี่ยนพฤติกรรมแม้แต่นิดเดียว
--
--  เรื่องกรอบ 6 เดือน : 0034 เลือกเตือนอย่างเดียวไม่บล็อก
--  แต่ตามมาตรา 82/5 และประกาศอธิบดีฯ ภาษีซื้อใช้สิทธิ์ได้ในเดือนภาษีที่ระบุ
--  ในใบกำกับ หรือภายในหกเดือนถัดจากนั้น เกินกว่านั้นต้องไปทางกรมสรรพากร
--  ไม่ใช่เรื่องที่กดในระบบได้ จึงเปลี่ยนเป็นบล็อกจริง และนับจากวันที่ใบกำกับ
-- =====================================================================

alter table public.documents
  add column if not exists tax_invoice_number text,
  add column if not exists tax_invoice_date   date;

comment on column public.documents.tax_invoice_number is
  'เลขที่ใบกำกับภาษีที่ได้รับจริง — null = ใช้เลขที่ของเอกสารนี้เอง';
comment on column public.documents.tax_invoice_date is
  'วันที่ในใบกำกับภาษี — null = ใช้วันที่ของเอกสารนี้เอง เป็นจุดตั้งต้นของกรอบ 6 เดือน';

-- ค้นด้วยเลขที่ใบกำกับได้ ตอนกระทบยอดกับใบที่ผู้ขายส่งมา
create index if not exists documents_tax_invoice_no_idx
  on public.documents (company_id, tax_invoice_number)
  where tax_invoice_number is not null;

-- ------------------------------------------------------------------------
-- จุดตั้งต้นของกรอบ 6 เดือน
--
-- แยกเป็นฟังก์ชันเพราะมีสามที่ที่ต้องใช้กติกาเดียวกัน
-- (ตอนบันทึก ตอนออกรายการค้าง และตอนออกรายงานภาษีซื้อ)
-- ถ้าเขียนซ้ำสามที่แล้ววันหนึ่งแก้ไม่ครบ ตัวเลขจะเพี้ยนแบบหาไม่เจอ
-- ------------------------------------------------------------------------
create or replace function app.vat_anchor_month(p_doc_date date, p_ti_date date)
returns date
language sql
immutable
as $$ select date_trunc('month', coalesce(p_ti_date, p_doc_date))::date; $$;

grant execute on function app.vat_anchor_month(date, date) to authenticated;

-- ------------------------------------------------------------------------
-- รายงานภาษีซื้อ-ขาย : ฝั่งซื้อใช้เลขที่และวันที่ของใบกำกับ
--
-- ฝั่งขายไม่แตะ เพราะเอกสารที่เราออกเองเป็นใบกำกับอยู่แล้ว
-- coalesce ทำให้ใบที่ไม่เคยกรอกได้ค่าเดิมทุกใบ
-- ------------------------------------------------------------------------
create or replace function public.rpt_vat(p_company uuid, p_year int, p_month int, p_side text default 'output')
returns table (
  seq bigint, doc_date date, doc_number text, contact_name text, tax_id text,
  branch text, base_amount numeric, vat_amount numeric
) language sql stable security definer set search_path = public, app as $$
  with src as (
    select
      case when p_side = 'output' then d.doc_date
           else coalesce(d.tax_invoice_date, d.doc_date) end as show_date,
      case when p_side = 'output' then d.doc_number
           else coalesce(d.tax_invoice_number, d.doc_number) end as show_number,
      coalesce(c.name, d.contact_snapshot->>'name') as contact_name,
      coalesce(c.tax_id, d.contact_snapshot->>'tax_id') as tax_id,
      coalesce(c.branch_code, '00000') as branch,
      d.vat_base, d.vat_amount
    from public.documents d
    left join public.contacts c on c.id = d.contact_id
    where d.company_id = p_company
      and d.status <> 'void'
      and not d.vat_deferred
      -- จุดตั้งต้นจากใบกำกับใช้กับฝั่งซื้อเท่านั้น
      -- เอกสารขายเราออกเองและเป็นใบกำกับในตัวอยู่แล้ว ต้องเข้าเดือนตามวันที่เอกสารเสมอ
      -- ถ้าปล่อยให้ใช้สูตรเดียวกัน เอกสารขายที่บังเอิญมีค่าในสองช่องนี้จะย้ายเดือนภาษีเงียบ ๆ
      and coalesce(d.vat_tax_month,
                   case when p_side = 'output' then date_trunc('month', d.doc_date)::date
                        else app.vat_anchor_month(d.doc_date, d.tax_invoice_date) end)
          = make_date(p_year, p_month, 1)
      and d.vat_amount <> 0
      and (case when p_side = 'output' then d.kind::text in ('tax_invoice','invoice','receipt','credit_note','debit_note')
                else d.kind::text in ('bill','expense','purchase_credit_note','purchase_debit_note') end)
      and (app.has_perm(p_company,'tax','view') or app.has_perm(p_company,'report','view'))
  )
  select row_number() over (order by show_date, show_number),
         show_date, show_number, contact_name, tax_id, branch, vat_base, vat_amount
  from src
  order by 2, 3;
$$;

-- ------------------------------------------------------------------------
-- รายการภาษีซื้อที่ยังไม่ได้ใช้สิทธิ์
--
-- เพิ่มเลขที่/วันที่ใบกำกับ และเดือนสุดท้ายที่ยังใช้สิทธิ์ได้
-- ทุกตัวนับจากวันที่ใบกำกับ ไม่ใช่วันที่เอกสาร
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
    d.tax_invoice_number, d.tax_invoice_date,
    coalesce(c.name, d.contact_snapshot->>'name') as contact_name,
    coalesce(c.tax_id, d.contact_snapshot->>'tax_id') as tax_id,
    app.vat_anchor_month(d.doc_date, d.tax_invoice_date) as anchor_month,
    -- เดือนสุดท้ายที่ยังใช้สิทธิ์ได้ตามกรอบหกเดือนถัดจากเดือนในใบกำกับ
    (app.vat_anchor_month(d.doc_date, d.tax_invoice_date) + interval '6 months')::date as last_month,
    case when d.vat_tax_month is not null
         then (extract(year from d.vat_tax_month) - extract(year from app.vat_anchor_month(d.doc_date, d.tax_invoice_date))) * 12
            + (extract(month from d.vat_tax_month) - extract(month from app.vat_anchor_month(d.doc_date, d.tax_invoice_date)))
    end::int as months_shift,
    ((extract(year from a.this_month) - extract(year from app.vat_anchor_month(d.doc_date, d.tax_invoice_date))) * 12
   + (extract(month from a.this_month) - extract(month from app.vat_anchor_month(d.doc_date, d.tax_invoice_date))))::int as months_aged
  from public.documents d
  left join public.contacts c on c.id = d.contact_id
  cross join args a
  where d.company_id = p_company
    and d.status <> 'void'
    and d.vat_amount <> 0
    and d.kind::text in ('bill','expense','purchase_credit_note','purchase_debit_note')
    and (d.vat_deferred
         or coalesce(d.vat_tax_month, app.vat_anchor_month(d.doc_date, d.tax_invoice_date)) > a.this_month)
    and (a.raw is null or d.doc_number ilike a.pat or c.name ilike a.pat
         or d.tax_invoice_number ilike a.pat
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
    -- แยกสามยอดให้ครบตามที่หน้าภาษีต้องแสดง ยอดก่อนภาษี ภาษี และยอดรวม
    'base_total',   (select coalesce(sum(vat_base), 0) from rows),
    'vat_total',    (select coalesce(sum(vat_amount), 0) from rows),
    'gross_total',  (select coalesce(sum(vat_base + vat_amount), 0) from rows),
    'deferred',     (select count(*) from rows where vat_deferred),
    'moved',        (select count(*) from rows where not vat_deferred),
    -- เกินกรอบแล้ว ใช้สิทธิ์ในระบบไม่ได้อีก ต้องไปทางกรมสรรพากร
    'over_six',     (select count(*) from rows where months_aged > 6)
  )
);
$$;

grant execute on function public.rpt_vat_pending(uuid, text, text) to authenticated;

-- ------------------------------------------------------------------------
-- กำหนดเดือนภาษี พร้อมบันทึกเลขที่และวันที่ใบกำกับที่ได้รับ
--
-- เพิ่มพารามิเตอร์ = เกิดฟังก์ชันซ้อนชื่อ ต้องทิ้งลายเซ็นเดิมก่อน
-- ไม่งั้นการเรียกที่ไม่ระบุชื่อพารามิเตอร์จะกำกวมจนพัง
-- ------------------------------------------------------------------------
drop function if exists public.set_vat_tax_month(uuid, date, boolean, text);

create or replace function public.set_vat_tax_month(
  p_document   uuid,
  p_month      date    default null,
  p_defer      boolean default false,
  p_note       text    default null,
  p_ti_number  text    default null,
  p_ti_date    date    default null
)
returns json
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_company  uuid;
  v_date     date;
  v_lock     date;
  v_ti_no    text;
  v_ti_date  date;
  v_anchor   date;
  v_last     date;
  v_month    date := case when p_month is null then null else date_trunc('month', p_month)::date end;
begin
  select company_id, doc_date into v_company, v_date
  from public.documents where id = p_document;
  if v_company is null then raise exception 'DOCUMENT_NOT_FOUND'; end if;

  if not app.has_perm(v_company, 'tax', 'edit') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์แก้ไขข้อมูลภาษี';
  end if;

  -- ส่งค่าว่างมา = ล้างค่าเดิมทิ้ง ไม่ใช่ "ไม่แก้"
  -- แยกให้ชัดเพราะคนแก้ผิดแล้วอยากลบออกต้องทำได้
  v_ti_no   := nullif(btrim(coalesce(p_ti_number, '')), '');
  v_ti_date := p_ti_date;

  if v_ti_date is not null and v_ti_date > current_date then
    raise exception 'TI_DATE_FUTURE: วันที่ในใบกำกับภาษีเป็นวันในอนาคตไม่ได้';
  end if;

  v_anchor := app.vat_anchor_month(v_date, v_ti_date);
  v_last   := (v_anchor + interval '6 months')::date;

  -- ห้ามยกภาษีเข้าไปในงวดที่ปิดไปแล้ว ตัวเลขที่ยื่นไปแล้วจะไม่ตรงกับระบบ
  v_lock := app.locked_through(v_company, 'all');
  if v_month is not null and v_lock is not null and v_month <= v_lock then
    raise exception 'PERIOD_LOCKED: งวดถึง % ปิดแล้ว ยกภาษีเข้าเดือนนั้นไม่ได้', v_lock;
  end if;

  if v_month is not null then
    -- ย้อนไปใช้สิทธิ์ก่อนเดือนของใบกำกับไม่ได้ ผิดหลักการโดยสิ้นเชิง
    if v_month < v_anchor then
      raise exception 'VAT_MONTH_BEFORE_DOC: เลือกเดือนภาษีก่อนเดือนของใบกำกับไม่ได้';
    end if;

    -- เกินหกเดือนถัดจากเดือนในใบกำกับ ใช้สิทธิ์ในระบบไม่ได้
    if v_month > v_last then
      raise exception 'VAT_MONTH_OVER_SIX: เลือกได้ถึงเดือน % เท่านั้น (หกเดือนนับจากเดือนในใบกำกับ)',
        to_char(v_last, 'YYYY-MM');
    end if;
  end if;

  update public.documents set
    tax_invoice_number = v_ti_no,
    tax_invoice_date   = v_ti_date,
    vat_tax_month      = case when p_defer then null else v_month end,
    vat_deferred       = coalesce(p_defer, false),
    vat_note           = coalesce(p_note, vat_note),
    updated_at         = now()
  where id = p_document;

  return json_build_object(
    'ok', true,
    'vat_tax_month', case when p_defer then null else v_month end,
    'last_month', to_char(v_last, 'YYYY-MM')
  );
end $$;

grant execute on function public.set_vat_tax_month(uuid, date, boolean, text, text, date) to authenticated;

comment on function public.set_vat_tax_month is
  'กำหนดเดือนภาษีที่ใช้สิทธิ์ภาษีซื้อ พร้อมเลขที่/วันที่ใบกำกับ — กรอบหกเดือนนับจากเดือนในใบกำกับและบล็อกจริง';

-- ------------------------------------------------------------------------
-- view ที่ปิดคอลัมน์ตามสิทธิ์ (0042) ระบุคอลัมน์ไว้ทีละตัว
-- ไม่เติมคอลัมน์ใหม่เข้าไป คนที่อ่านผ่าน view จะไม่เห็นสองช่องนี้เลยแบบเงียบ ๆ
-- ------------------------------------------------------------------------
drop view if exists public.documents_masked;
create view public.documents_masked
with (security_invoker = true)
as
select
  d.id, d.company_id, d.kind, d.doc_number, d.doc_date, d.due_date,
  d.contact_id, d.contact_snapshot, d.reference, d.ref_document_id, d.dimension_id,
  d.currency, d.exchange_rate, d.subtotal, d.discount_amount,
  d.vat_base, d.vat_amount, d.wht_amount, d.grand_total, d.net_payable, d.paid_amount,
  d.status, d.notes,
  case when app.field_masked(d.company_id, 'documents', 'internal_note')
       then null else d.internal_note end as internal_note,
  d.journal_entry_id, d.warehouse_id,
  d.vat_tax_month, d.vat_deferred, d.vat_note,
  d.tax_invoice_number, d.tax_invoice_date,
  d.created_by, d.approved_by, d.approved_at,
  d.voided_by, d.voided_at, d.void_reason,
  d.created_at, d.updated_at
from public.documents d;

grant select on public.documents_masked to authenticated;
