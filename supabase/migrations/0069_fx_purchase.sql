-- =====================================================================
-- 0069 : เงินตราต่างประเทศฝั่งซื้อ
--
--  ซื้อของจากจีนหรืออเมริกา ใบกำกับมาเป็นหยวนหรือดอลลาร์
--  ต้องคีย์ยอดตามใบจริง ใส่อัตราแลกเปลี่ยน แล้วให้ระบบคิดเป็นบาทให้
--
-- ---------------------------------------------------------------------
--  สิ่งที่ตัดสินใจไว้ชัด : บัญชียังเป็นบาททั้งหมด
--
--  คอลัมน์ยอดเงินเดิมทุกตัว (subtotal, vat_amount, grand_total, line_amount)
--  ยังเป็นเงินบาทเหมือนเดิม ไม่แตะเลย
--  ยอดเงินตราต่างประเทศเก็บในคอลัมน์ fx_* แยกต่างหาก
--
--  เหตุผล
--    - เอนจินลงบัญชี รายงานภาษี อายุหนี้ แดชบอร์ด ทุกตัวทำงานต่อได้ทันที
--      ไม่ต้องแก้อะไรเลย และไม่มีความเสี่ยงว่าตัวไหนลืมแปลงค่า
--    - ตรงกับวิธีปฏิบัติจริง : บันทึกบัญชีเป็นบาท แสดงยอดต่างประเทศกำกับไว้
--    - ภาษีซื้อคิดจากฐานภาษีเป็นบาทอยู่แล้ว ตามที่กรมศุลกากรประเมิน
--
--  ยังไม่ทำผลต่างอัตราแลกเปลี่ยนตอนจ่ายเงินจริง (realized FX gain/loss)
--  กับการตีราคาใหม่ตอนปิดงวด สองเรื่องนั้นเป็นงานคนละขนาด
--  และต้องมีบัญชีกำไรขาดทุนจากอัตราแลกเปลี่ยนที่ผังบัญชีมีอยู่แล้ว (4230)
--
-- ---------------------------------------------------------------------
--  อัตราแลกเปลี่ยนจากธนาคารแห่งประเทศไทย
--
--  เก็บทั้งอัตราซื้อและอัตราขาย แต่ฝั่งซื้อสินค้าใช้ "อัตราขาย"
--  เพราะเราต้องซื้อเงินตราต่างประเทศจากธนาคารเพื่อไปจ่ายผู้ขาย
--
--  ธปท. ไม่ประกาศอัตราในวันหยุด ตัวอ่านจึงถอยไปหาวันทำการล่าสุดก่อนหน้าให้
--  ไม่ใช่คืนค่าว่าง ซึ่งจะทำให้คีย์เอกสารวันเสาร์ไม่ได้
-- =====================================================================

-- ------------------------------------------------------------------------
-- 1) ตารางอัตราแลกเปลี่ยน
--
--  ไม่ผูกกับบริษัท เพราะอัตราของ ธปท. เป็นค่ากลางของประเทศ
--  ทุกบริษัทในระบบใช้ชุดเดียวกัน
-- ------------------------------------------------------------------------
create table if not exists public.exchange_rates (
  currency   char(3) not null,
  rate_date  date not null,
  rate_buy   numeric(18,6),
  rate_sell  numeric(18,6),
  source     text not null default 'manual',
  fetched_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  primary key (currency, rate_date),
  constraint fx_rate_positive_chk check (
    (rate_buy is null or rate_buy > 0) and (rate_sell is null or rate_sell > 0)
  )
);

create index if not exists exchange_rates_cur_idx on public.exchange_rates (currency, rate_date desc);

comment on table public.exchange_rates is
  'อัตราแลกเปลี่ยนรายวัน — เป็นค่ากลางของประเทศ ไม่แยกตามบริษัท source บอกว่ามาจาก ธปท. หรือกรอกเอง';
comment on column public.exchange_rates.rate_sell is
  'อัตราขายของธนาคาร (บาทต่อ 1 หน่วยต่างประเทศ) — ฝั่งซื้อสินค้าใช้ตัวนี้ เพราะต้องซื้อเงินตราไปจ่าย';

alter table public.exchange_rates enable row level security;
alter table public.exchange_rates force row level security;

-- ทุกคนที่ล็อกอินอ่านได้ เพราะเป็นข้อมูลสาธารณะและไม่ผูกบริษัท
drop policy if exists "exchange_rates_sel" on public.exchange_rates;
create policy "exchange_rates_sel" on public.exchange_rates for select to authenticated
  using (true);

-- เขียนได้เฉพาะคนที่แก้เอกสารซื้อได้ในบริษัทใดบริษัทหนึ่ง
drop policy if exists "exchange_rates_all" on public.exchange_rates;
create policy "exchange_rates_all" on public.exchange_rates for all to authenticated
  using (exists (
    select 1 from public.user_companies uc
    where uc.user_id = auth.uid() and uc.is_active
      and app.has_perm(uc.company_id, 'documents', 'edit')))
  with check (exists (
    select 1 from public.user_companies uc
    where uc.user_id = auth.uid() and uc.is_active
      and app.has_perm(uc.company_id, 'documents', 'edit')));

drop trigger if exists trg_audit_exchange_rates on public.exchange_rates;
create trigger trg_audit_exchange_rates
  after insert or update or delete on public.exchange_rates
  for each row execute function app.audit_trigger();

-- ------------------------------------------------------------------------
-- 2) ยอดเงินตราต่างประเทศบนเอกสาร
-- ------------------------------------------------------------------------
alter table public.documents
  add column if not exists fx_currency    char(3),
  add column if not exists fx_rate        numeric(18,6),
  add column if not exists fx_rate_date   date,
  add column if not exists fx_rate_source text,
  add column if not exists fx_subtotal    numeric(18,2),
  add column if not exists fx_grand_total numeric(18,2);

comment on column public.documents.fx_currency is
  'สกุลเงินบนใบของผู้ขาย null = เป็นเงินบาทล้วน ยอดในคอลัมน์ปกติยังเป็นบาทเสมอ';
comment on column public.documents.fx_rate is
  'บาทต่อ 1 หน่วยของ fx_currency ตรึงไว้ ณ วันที่บันทึก';

alter table public.document_lines
  add column if not exists fx_unit_price numeric(18,4),
  add column if not exists fx_line_amount numeric(18,2);

-- ------------------------------------------------------------------------
-- 3) กันตัวเลขบาทกับตัวเลขต่างประเทศไม่ตรงกัน
--
--  ถ้าปล่อยให้ฝั่งหน้าจอคำนวณอย่างเดียว วันหนึ่งจะมีเอกสารที่ยอดบาท
--  ไม่ตรงกับยอดต่างประเทศคูณอัตรา แล้วไม่มีใครรู้
--  ตรวจที่ฐานข้อมูลจึงเป็นที่เดียวที่กันได้จริง
--
--  ผ่อนผัน 1 บาท เพราะการปัดเศษรายบรรทัดแล้วรวม กับการรวมแล้วปัด ต่างกันได้เล็กน้อย
-- ------------------------------------------------------------------------
create or replace function app.document_fx_guard()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $fn$
begin
  if new.fx_currency is null then
    -- ไม่มีเงินตราต่างประเทศ ต้องไม่มีเศษซากค้างไว้
    new.fx_rate := null;
    new.fx_rate_date := null;
    new.fx_subtotal := null;
    new.fx_grand_total := null;
    return new;
  end if;

  if new.fx_rate is null or new.fx_rate <= 0 then
    raise exception 'FX_RATE_REQUIRED: ต้องระบุอัตราแลกเปลี่ยนที่มากกว่า 0'
      using hint = 'เลือกวันที่แล้วกดดึงอัตราจากธนาคารแห่งประเทศไทย หรือกรอกเอง';
  end if;

  if new.fx_currency = (select base_currency from public.companies where id = new.company_id) then
    raise exception 'FX_SAME_AS_BASE: สกุลเงินต่างประเทศต้องไม่ใช่สกุลหลักของบริษัท';
  end if;

  if new.fx_grand_total is not null
     and abs(round(new.fx_grand_total * new.fx_rate, 2) - new.grand_total) > 1 then
    raise exception
      'FX_TOTAL_MISMATCH: ยอดบาท % ไม่ตรงกับ % × % = %',
      new.grand_total, new.fx_grand_total, new.fx_rate,
      round(new.fx_grand_total * new.fx_rate, 2);
  end if;

  return new;
end $fn$;

drop trigger if exists trg_document_fx on public.documents;
create trigger trg_document_fx
  before insert or update of fx_currency, fx_rate, fx_grand_total, grand_total on public.documents
  for each row execute function app.document_fx_guard();

comment on function app.document_fx_guard is
  'กันยอดบาทกับยอดต่างประเทศไม่ตรงกัน และบังคับให้มีอัตราแลกเปลี่ยนเมื่อระบุสกุลต่างประเทศ';

-- ------------------------------------------------------------------------
-- 4) อ่านอัตราของวันที่ต้องการ
--
--  ธปท. ไม่ประกาศวันหยุด จึงถอยไปหาวันทำการล่าสุดก่อนหน้าให้ ไม่เกิน 10 วัน
--  ถ้าเกินนั้นถือว่าไม่มีข้อมูลจริง ให้ผู้ใช้กรอกเอง ดีกว่าใช้อัตราเก่าเกินไป
-- ------------------------------------------------------------------------
create or replace function public.rpt_exchange_rate(
  p_currency text, p_date date default current_date
)
returns json
language sql
stable
security invoker
set search_path = public, app
as $fx$
  select coalesce(
    (select json_build_object(
       'currency', r.currency, 'rate_date', r.rate_date,
       'rate_buy', r.rate_buy, 'rate_sell', r.rate_sell,
       'source', r.source,
       'is_exact', r.rate_date = p_date
     )
     from public.exchange_rates r
     where r.currency = upper(p_currency)
       and r.rate_date <= p_date
       and r.rate_date >= p_date - 10
       and r.rate_sell is not null
     order by r.rate_date desc
     limit 1),
    json_build_object('currency', upper(p_currency), 'rate_date', null,
                      'rate_buy', null, 'rate_sell', null,
                      'source', null, 'is_exact', false));
$fx$;

grant execute on function public.rpt_exchange_rate(text, date) to authenticated;

comment on function public.rpt_exchange_rate is
  'อัตราแลกเปลี่ยนของวันที่ระบุ ถ้าเป็นวันหยุดจะถอยไปหาวันทำการล่าสุดไม่เกิน 10 วัน';

-- ------------------------------------------------------------------------
-- 5) บันทึกอัตราที่ดึงมาหรือกรอกเอง
-- ------------------------------------------------------------------------
create or replace function public.upsert_exchange_rate(
  p_currency text, p_date date,
  p_buy numeric default null, p_sell numeric default null,
  p_source text default 'manual'
)
returns json
language plpgsql
security invoker
set search_path = public, app
as $fn$
begin
  if p_sell is null and p_buy is null then
    raise exception 'RATE_REQUIRED: ต้องระบุอัตราอย่างน้อยหนึ่งด้าน';
  end if;

  insert into public.exchange_rates (currency, rate_date, rate_buy, rate_sell, source, created_by)
  values (upper(p_currency), p_date, p_buy, p_sell, coalesce(p_source, 'manual'), auth.uid())
  on conflict (currency, rate_date) do update
    set rate_buy   = coalesce(excluded.rate_buy, public.exchange_rates.rate_buy),
        rate_sell  = coalesce(excluded.rate_sell, public.exchange_rates.rate_sell),
        source     = excluded.source,
        fetched_at = now();

  return json_build_object('currency', upper(p_currency), 'rate_date', p_date, 'rate_sell', p_sell);
end $fn$;

grant execute on function public.upsert_exchange_rate(text, date, numeric, numeric, text) to authenticated;

-- ------------------------------------------------------------------------
-- 6) เอกสารซื้อที่เป็นเงินตราต่างประเทศ
-- ------------------------------------------------------------------------
create or replace function public.rpt_fx_documents(
  p_company uuid, p_from date, p_to date
)
returns json
language sql
stable
security invoker
set search_path = public, app
as $fd$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'kind', d.kind::text, 'doc_number', d.doc_number, 'doc_date', d.doc_date,
    'contact_name', coalesce(c.name, d.contact_snapshot->>'name'),
    'fx_currency', d.fx_currency, 'fx_rate', d.fx_rate, 'fx_rate_date', d.fx_rate_date,
    'fx_grand_total', d.fx_grand_total, 'grand_total', d.grand_total
  ) order by d.doc_date desc, d.doc_number), '[]'::jsonb)
  from public.documents d
  left join public.contacts c on c.id = d.contact_id
  where d.company_id = p_company
    and d.fx_currency is not null
    and d.doc_date between p_from and p_to;
$fd$;

grant execute on function public.rpt_fx_documents(uuid, date, date) to authenticated;

comment on function public.rpt_fx_documents is
  'เอกสารที่คีย์เป็นเงินตราต่างประเทศ พร้อมอัตราที่ใช้และยอดบาทที่ลงบัญชีจริง';

-- ------------------------------------------------------------------------
-- 7) view ที่ปิดคอลัมน์ต้องตามให้ทัน
--
--  กับดักตัวเดิม รอบนี้เป็นครั้งที่ห้า (0044 0051 0057 0059 และตอนนี้)
--  view ระบุคอลัมน์ทีละตัว เพิ่มคอลัมน์ให้ documents เมื่อไรต้องเติมที่นี่ด้วยเสมอ
--  ตัวตรวจโครงสร้างมีข้อเช็กเรื่องนี้แล้ว จะได้ไม่ต้องจำเอง
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
  d.deposit_applied,
  d.status, d.description, d.notes,
  case when app.field_masked(d.company_id, 'documents', 'internal_note')
       then null else d.internal_note end as internal_note,
  d.journal_entry_id, d.warehouse_id, d.accounting_doc_id,
  d.vat_tax_month, d.vat_deferred, d.vat_note,
  d.tax_invoice_number, d.tax_invoice_date,
  d.sales_rep_id, d.sales_zone_id,
  d.fx_currency, d.fx_rate, d.fx_rate_date, d.fx_rate_source,
  d.fx_subtotal, d.fx_grand_total,
  d.created_by, d.approved_by, d.approved_at,
  d.voided_by, d.voided_at, d.void_reason,
  d.created_at, d.updated_at
from public.documents d;

grant select on public.documents_masked to authenticated;
