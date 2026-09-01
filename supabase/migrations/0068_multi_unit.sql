-- =====================================================================
-- 0068 : หน่วยนับหลายหน่วย
--
--  products.unit เป็นข้อความเดียว ไม่มีตารางแปลงหน่วย
--  ธุรกิจค้าส่งซื้อเข้าเป็นลัง ขายออกเป็นชิ้น ตอนนี้ทำไม่ได้เลย
--  ต้องคีย์จำนวนเป็นชิ้นทุกครั้งแล้วคูณเอง ซึ่งผิดง่ายและตรวจย้อนไม่ได้
--
--  บริษัทในกลุ่มนี้สองแห่งเป็นดิสทริบิวชั่นโดยตรง จึงเป็นเรื่องที่ใช้ทุกวัน
--
-- ---------------------------------------------------------------------
--  วิธีเก็บ
--
--  หน่วยผูกกับสินค้า ไม่ใช่ตารางหน่วยกลาง
--  เพราะ "ลัง" ของสินค้า A กับสินค้า B บรรจุไม่เท่ากัน ตารางกลางจึงใช้ไม่ได้
--
--    factor = จำนวนหน่วยฐานใน 1 หน่วยนี้
--    หน่วยฐาน factor = 1 มีได้หน่วยเดียวต่อสินค้า
--
--  สต๊อกทั้งหมดเก็บเป็นหน่วยฐานเสมอ ไม่แตะ inventory_layers หรือ FIFO
--  แค่แปลงจำนวนก่อนส่งเข้าไป
--
-- ---------------------------------------------------------------------
--  ทำไมเก็บ base_quantity ไว้บนบรรทัด ไม่คำนวณสด
--
--  ตัวคูณแก้ได้ทีหลัง ถ้าคำนวณสดทุกครั้ง เอกสารเก่าจะเปลี่ยนจำนวนสต๊อก
--  ย้อนหลังเมื่อมีคนแก้ตัวคูณ ซึ่งทำให้บัญชีคุมสินค้าไม่ตรงกับของจริง
--  จึงตรึงค่าไว้ตอนบันทึกด้วยทริกเกอร์ เหมือนที่ contact_snapshot ทำกับผู้ติดต่อ
--
--  บรรทัดเก่าที่ไม่มีค่าจะ fallback ไปใช้ quantity ตามเดิม เข้ากันได้ย้อนหลัง
-- =====================================================================

-- ------------------------------------------------------------------------
-- 1) หน่วยของสินค้า
-- ------------------------------------------------------------------------
create table if not exists public.product_units (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  code        text not null,
  factor      numeric(18,6) not null default 1,
  barcode     text,
  sale_price  numeric(18,4),
  is_base     boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint product_units_factor_chk check (factor > 0),
  constraint product_units_base_chk   check (not is_base or factor = 1),
  unique (product_id, code)
);

create index if not exists product_units_product_idx on public.product_units (product_id, is_active);
create index if not exists product_units_company_idx on public.product_units (company_id);

-- หน่วยฐานมีได้หน่วยเดียวต่อสินค้า
create unique index if not exists product_units_one_base_idx
  on public.product_units (product_id) where is_base;

comment on table public.product_units is
  'หน่วยนับของสินค้าแต่ละตัว — factor คือจำนวนหน่วยฐานใน 1 หน่วยนี้ เช่น ลัง factor 24 แปลว่า 1 ลัง = 24 ชิ้น';
comment on column public.product_units.sale_price is
  'ราคาขายต่อหน่วยนี้ ถ้าไม่ระบุจะคิดจากราคาต่อหน่วยฐานคูณตัวคูณ';

alter table public.product_units enable row level security;
alter table public.product_units force row level security;

drop policy if exists "product_units_sel" on public.product_units;
create policy "product_units_sel" on public.product_units for select to authenticated
  using (app.has_perm(company_id, 'products', 'view'));

drop policy if exists "product_units_all" on public.product_units;
create policy "product_units_all" on public.product_units for all to authenticated
  using (app.has_perm(company_id, 'products', 'edit'))
  with check (app.has_perm(company_id, 'products', 'edit'));

drop trigger if exists trg_product_units_touch on public.product_units;
create trigger trg_product_units_touch before update on public.product_units
  for each row execute function app.touch_updated_at();

drop trigger if exists trg_audit_product_units on public.product_units;
create trigger trg_audit_product_units
  after insert or update or delete on public.product_units
  for each row execute function app.audit_trigger();

-- ------------------------------------------------------------------------
-- 2) หน่วยฐานของสินค้าที่มีอยู่แล้ว
--
--  สร้างให้ทุกตัวจาก products.unit เพื่อให้ของเดิมมีหน่วยฐานครบตั้งแต่แรก
-- ------------------------------------------------------------------------
insert into public.product_units (company_id, product_id, code, factor, is_base)
select p.company_id, p.id, coalesce(nullif(btrim(p.unit), ''), '-'), 1, true
from public.products p
where not exists (select 1 from public.product_units u where u.product_id = p.id and u.is_base);

-- ------------------------------------------------------------------------
-- 2b) สินค้าที่สร้างใหม่ต้องมีหน่วยฐานเสมอ
--
--  การเติมย้อนหลังข้างบนครอบคลุมเฉพาะสินค้าที่มีอยู่ ณ ตอนรัน migration
--  สินค้าที่สร้างทีหลังจะไม่มีหน่วยฐาน แล้วข้อจำกัด "หน่วยฐานมีได้หน่วยเดียว"
--  ก็ไม่มีอะไรให้ชน ใครเพิ่มหน่วยฐานเองซ้อนกันก็ได้
--
--  แก้ด้วยทริกเกอร์ ไม่ใช่ให้ฝั่งแอปจำไปสร้างเอง เพราะสินค้าเข้ามาได้หลายทาง
--  ทั้งฟอร์ม การนำเข้า CSV และข้อมูลตัวอย่าง
-- ------------------------------------------------------------------------
create or replace function app.product_ensure_base_unit()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $fn$
begin
  if tg_op = 'INSERT' then
    insert into public.product_units (company_id, product_id, code, factor, is_base)
    values (new.company_id, new.id, coalesce(nullif(btrim(new.unit), ''), '-'), 1, true)
    on conflict (product_id, code) do nothing;
  elsif new.unit is distinct from old.unit then
    -- เปลี่ยนชื่อหน่วยฐานตามสินค้า ตัวคูณยังเป็น 1 เหมือนเดิม
    -- บรรทัดเอกสารเก่าไม่กระทบ เพราะตรึง unit_factor ไว้แล้ว
    update public.product_units
       set code = coalesce(nullif(btrim(new.unit), ''), '-')
     where product_id = new.id and is_base
       and not exists (
         select 1 from public.product_units x
         where x.product_id = new.id and not x.is_base
           and x.code = coalesce(nullif(btrim(new.unit), ''), '-')
       );
  end if;
  return new;
end $fn$;

drop trigger if exists trg_product_base_unit on public.products;
create trigger trg_product_base_unit
  after insert or update of unit on public.products
  for each row execute function app.product_ensure_base_unit();

-- ------------------------------------------------------------------------
-- 3) จำนวนหน่วยฐานบนบรรทัดเอกสาร
-- ------------------------------------------------------------------------
alter table public.document_lines
  add column if not exists unit_factor  numeric(18,6),
  add column if not exists base_quantity numeric(18,4);

comment on column public.document_lines.unit_factor is
  'ตัวคูณของหน่วยที่เลือก ณ ตอนบันทึก ตรึงไว้ไม่ให้เปลี่ยนตามการแก้ตัวคูณภายหลัง';
comment on column public.document_lines.base_quantity is
  'จำนวนในหน่วยฐาน = quantity × unit_factor ใช้เป็นตัวเดียวที่กระทบสต๊อกและการเทียบเอกสาร';

-- ------------------------------------------------------------------------
-- 4) เติมค่าให้อัตโนมัติตอนบันทึกบรรทัด
--
--  หาตัวคูณจากหน่วยที่ผู้ใช้เลือก ถ้าไม่รู้จักถือว่าเป็นหน่วยฐาน (ตัวคูณ 1)
--  ไม่ปฏิเสธการบันทึก เพราะบรรทัดที่ไม่ผูกสินค้า (ค่าบริการ) ไม่มีหน่วยอยู่แล้ว
-- ------------------------------------------------------------------------
create or replace function app.line_fill_unit()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $fn$
declare v_factor numeric;
begin
  if new.product_id is null then
    new.unit_factor := coalesce(new.unit_factor, 1);
    new.base_quantity := new.quantity * new.unit_factor;
    return new;
  end if;

  select u.factor into v_factor
  from public.product_units u
  where u.product_id = new.product_id
    and u.is_active
    and u.code = coalesce(nullif(btrim(new.unit), ''), '-');

  new.unit_factor := coalesce(v_factor, 1);
  new.base_quantity := round(new.quantity * new.unit_factor, 4);
  return new;
end $fn$;

drop trigger if exists trg_line_fill_unit on public.document_lines;
create trigger trg_line_fill_unit
  before insert or update of quantity, unit, product_id on public.document_lines
  for each row execute function app.line_fill_unit();

-- เติมย้อนหลังให้บรรทัดเดิมทั้งหมด หน่วยเดิมคือหน่วยฐาน ตัวคูณจึงเป็น 1
update public.document_lines
   set unit_factor = 1, base_quantity = quantity
 where base_quantity is null;

-- ------------------------------------------------------------------------
-- 5) ราคาต่อหน่วยที่แนะนำ
--
--  ถ้าตั้งราคาต่อหน่วยนั้นไว้ก็ใช้ค่านั้น ไม่งั้นคิดจากราคาต่อหน่วยฐาน × ตัวคูณ
-- ------------------------------------------------------------------------
create or replace function public.rpt_product_units(p_company uuid, p_product uuid)
returns json
language sql
stable
security invoker
set search_path = public, app
as $ru$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', u.id, 'code', u.code, 'factor', u.factor,
    'is_base', u.is_base, 'barcode', u.barcode,
    'sale_price', coalesce(u.sale_price, round(p.sale_price * u.factor, 4)),
    'purchase_price', round(p.purchase_price * u.factor, 4)
  ) order by u.factor), '[]'::jsonb)
  from public.product_units u
  join public.products p on p.id = u.product_id
  where u.product_id = p_product and u.company_id = p_company and u.is_active;
$ru$;

grant execute on function public.rpt_product_units(uuid, uuid) to authenticated;

-- ------------------------------------------------------------------------
-- 6) ยอดคงเหลือแปลงเป็นหน่วยที่อ่านง่าย
--
--  100 ชิ้น เมื่อ 1 ลัง = 24 ชิ้น ควรอ่านว่า "4 ลัง 4 ชิ้น"
--  ไม่ใช่ 4.1667 ลัง ซึ่งไม่มีความหมายในคลัง
-- ------------------------------------------------------------------------
create or replace function public.rpt_stock_in_units(p_company uuid, p_product uuid)
returns json
language sql
stable
security invoker
set search_path = public, app
as $su$
  with onhand as (
    select coalesce(sum(qty_remaining), 0) as qty
    from public.inventory_layers
    where company_id = p_company and product_id = p_product
  ),
  big as (
    -- หน่วยใหญ่สุดที่ยังหารลงตัวได้อย่างน้อยหนึ่งหน่วย
    select u.code, u.factor
    from public.product_units u, onhand
    where u.product_id = p_product and u.is_active and u.factor > 1
      and onhand.qty >= u.factor
    order by u.factor desc limit 1
  ),
  base as (
    select u.code from public.product_units u
    where u.product_id = p_product and u.is_base limit 1
  )
  select json_build_object(
    'base_qty', (select qty from onhand),
    'base_unit', (select code from base),
    'pack_unit', (select code from big),
    'pack_qty', (select floor((select qty from onhand) / factor) from big),
    'loose_qty', (select (select qty from onhand) - floor((select qty from onhand) / factor) * factor from big)
  );
$su$;

grant execute on function public.rpt_stock_in_units(uuid, uuid) to authenticated;

comment on function public.rpt_stock_in_units is
  'ยอดคงเหลือแปลงเป็นหน่วยบรรจุที่อ่านง่าย เช่น 4 ลัง 4 ชิ้น แทน 100 ชิ้น';

-- ------------------------------------------------------------------------
-- 7) เอนจินและตัวเทียบเอกสาร ต้องคิดด้วยหน่วยฐาน
--
--  ทุกจุดที่กระทบสต๊อกหรือเทียบจำนวนข้ามเอกสาร เปลี่ยนเป็น base_quantity
--  ใช้ coalesce กับ quantity ไว้ เพื่อให้บรรทัดเก่าที่ยังไม่มีค่าทำงานได้เหมือนเดิม
--
--  จุดที่สำคัญที่สุดคือต้นทุนรับเข้า : ซื้อ 1 ลัง 240 บาท เมื่อ 1 ลัง = 24 ชิ้น
--  ต้องได้ 24 ชิ้น ชิ้นละ 10 บาท ไม่ใช่ 1 ชิ้น ชิ้นละ 240 บาท
--
--  คัดนิยามจริงหลัง 0067 มาแก้เฉพาะจุด ไม่ได้พิมพ์ใหม่
-- ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_document(p_document uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
declare
  d record; l record;
  v_entry uuid; v_book text; v_line int := 0;
  v_ar uuid; v_ap uuid; v_vat_out uuid; v_vat_in uuid; v_wht_recv uuid; v_wht_pay uuid;
  v_inv uuid; v_cogs uuid; v_dep_r uuid; v_dep_p uuid;
  v_is_purchase boolean;
  v_stock_out boolean; v_stock_in boolean;
  v_acct_src uuid;
  v_cost numeric(18,2);
  v_unit_cost numeric(18,6);
begin
  select * into d from public.documents where id = p_document;
  if not found then raise exception 'DOC_NOT_FOUND'; end if;
  if not app.has_perm(d.company_id, 'documents', 'approve') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์อนุมัติ/ลงบัญชีเอกสาร';
  end if;
  perform app.assert_period_open(d.company_id, d.doc_date, 'all');

  -- จับคู่สามทางก่อนทุกอย่าง ใบที่ตัวเลขไม่ตรงต้องไม่ผ่านตั้งแต่ต้น
  -- ไม่ว่าจะเป็นใบที่ลงบัญชีเองหรือใบที่แปลงต่อมาก็ตาม
  perform app.assert_three_way(p_document);

  -- เช็กงบก่อนอนุมัติใบขอซื้อ/ใบสั่งซื้อ ก่อนที่ใบจะกลายเป็นภาระผูกพัน
  perform app.assert_budget(p_document);

  -- ต้องผ่านขั้นอนุมัติตามวงเงินให้ครบก่อน จึงจะลงบัญชีได้
  perform app.assert_approved(p_document);

  if d.journal_entry_id is not null then return d.journal_entry_id; end if;

  v_is_purchase := d.kind::text in ('bill','expense','purchase_credit_note','purchase_debit_note','deposit_payment','goods_receipt');
  if d.kind::text in ('quotation','sales_order','purchase_request','purchase_order','billing_note') then
    update public.documents set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_document;
    return null;
  end if;

  -- เอกสารที่แปลงต่อจากใบที่ลงบัญชีไปแล้ว = รายการเดียวกัน ห้ามลงซ้ำ
  -- (ใบแจ้งหนี้ → ใบกำกับภาษี → ใบเสร็จ / ใบรับสินค้า → ซื้อสินค้า)
  v_acct_src := app.accounting_source(d.id);
  if v_acct_src is not null then
    update public.documents
       set accounting_doc_id = v_acct_src, status = 'approved',
           approved_by = auth.uid(), approved_at = now()
     where id = p_document;
    return null;
  end if;

  -- เอกสารที่ทำให้สินค้าเคลื่อนไหว
  v_stock_out := d.kind::text in ('invoice','tax_invoice','receipt','purchase_credit_note','delivery_order');
  v_stock_in  := d.kind::text in ('bill','goods_receipt','expense','credit_note');

  -- ของออกจากคลังตอนส่งของไปแล้ว ใบกำกับที่ตามมาจึงตัดสต๊อกอีกไม่ได้
  if v_stock_out and app.stock_moved_upstream(d.id) then
    v_stock_out := false;
  end if;

  v_book    := case when v_is_purchase then 'PURCHASE' else 'SALE' end;
  v_ar      := app.acc(d.company_id,'ar');
  v_ap      := app.acc(d.company_id,'ap');
  v_vat_out := app.acc(d.company_id,'vat_output');
  v_vat_in  := app.acc(d.company_id,'vat_input');
  v_wht_recv:= app.acc(d.company_id,'wht_receivable');
  v_wht_pay := app.acc(d.company_id,'wht_payable');
  v_inv     := app.acc(d.company_id,'inventory');
  v_dep_r   := app.acc(d.company_id,'deposit_received');
  v_dep_p   := app.acc(d.company_id,'deposit_paid');
  v_cogs    := app.acc(d.company_id,'cogs');

  insert into public.journal_entries(company_id, entry_number, entry_date, book, description,
    source_type, source_id, status, is_auto, created_by, posted_by, posted_at)
  values (d.company_id, app.next_entry_number(d.company_id, v_book, d.doc_date), d.doc_date, v_book,
    coalesce(nullif(btrim(d.description), ''), d.kind::text || ' ' || d.doc_number), 'document', d.id, 'posted', true, auth.uid(), auth.uid(), now())
  returning id into v_entry;

  if not v_is_purchase then
    -- ========== ฝั่งขาย ==========
    -- ใบรับเงินมัดจำยังไม่ใช่รายได้ ต้องขึ้นเป็นหนี้สินจนกว่าจะส่งมอบของ
    -- ถ้าลงเป็นรายได้ตรงนี้ กำไรจะสูงเกินจริง และจะสูงซ้ำอีกรอบตอนออกใบกำกับจริง
    if d.kind::text = 'deposit_receipt' then
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
      values (v_entry, d.company_id, v_line, v_ar, 'ลูกหนี้ - เงินมัดจำ ' || d.doc_number, d.grand_total, 0, d.contact_id);

      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
      values (v_entry, d.company_id, v_line, v_dep_r, 'เงินมัดจำรับ - ' || d.doc_number, 0, d.vat_base, d.contact_id);

      if d.vat_amount <> 0 then
        v_line := v_line + 1;
        insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
        values (v_entry, d.company_id, v_line, v_vat_out, 'ภาษีขาย - เงินมัดจำ', 0, d.vat_amount);
      end if;

      update public.documents set status = 'approved', approved_by = auth.uid(), approved_at = now(),
             journal_entry_id = v_entry where id = p_document;
      return v_entry;
    end if;

    -- ใบส่งของยังไม่รับรู้รายได้ ยังไม่ใช่จุดความรับผิดทางภาษี
    -- ลงเฉพาะต้นทุนขายกับการตัดสินค้าคงเหลือ ส่วนรายได้อยู่ที่ใบกำกับที่ตามมา
    if d.kind::text <> 'delivery_order' then
    v_line := v_line + 1;
    insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
    values (v_entry, d.company_id, v_line, v_ar, 'ลูกหนี้การค้า - ' || d.doc_number, d.grand_total, 0, d.contact_id);

    -- มัดจำที่หักไว้ ต้องแยกส่วนมูลค่าออกจากส่วนภาษี
    --
    -- ตอนรับมัดจำเราออกใบกำกับและนำส่งภาษีขายไปแล้ว พอออกใบกำกับใบจริง
    -- ระบบคิดภาษีขายจากมูลค่าเต็มอีกครั้ง ถ้าหักมัดจำเป็นก้อนเดียวเข้าบัญชี
    -- เงินมัดจำรับทั้งจำนวน ภาษีของงวดมัดจำจะค้างอยู่ในบัญชีตลอดไป
    -- และภาษีขายจะถูกนำส่งซ้ำสองรอบสำหรับเงินก้อนเดียวกัน
    --
    -- จึงกลับภาษีขายของงวดมัดจำออกตามสัดส่วน เหลือภาษีขายสุทธิเท่ากับ
    -- 7% ของมูลค่าเต็มพอดี และบัญชีเงินมัดจำรับกลับเป็นศูนย์เมื่อใช้ครบ
    for l in
      select a.amount,
             round(a.amount * (dep.vat_amount / nullif(dep.grand_total, 0)), 2) as vat_part,
             dep.doc_number as dep_number
      from public.deposit_applications a
      join public.documents dep on dep.id = a.deposit_document_id
      where a.target_document_id = d.id
    loop
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
      values (v_entry, d.company_id, v_line, v_dep_r,
              'ล้างเงินมัดจำรับ - ' || l.dep_number,
              l.amount - coalesce(l.vat_part, 0), 0, d.contact_id);

      if coalesce(l.vat_part, 0) <> 0 then
        v_line := v_line + 1;
        insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
        values (v_entry, d.company_id, v_line, v_vat_out,
                'กลับภาษีขายของเงินมัดจำ - ' || l.dep_number, l.vat_part, 0);
      end if;

      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
      values (v_entry, d.company_id, v_line, v_ar,
              'ลดลูกหนี้จากเงินมัดจำ - ' || l.dep_number, 0, l.amount, d.contact_id);
    end loop;

    for l in select dl.*, coalesce(dl.account_id, p.income_account_id, app.acc(d.company_id,'sales_revenue')) as post_acc
             from public.document_lines dl
             left join public.products p on p.id = dl.product_id
             where dl.document_id = d.id order by dl.line_no loop
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, dimension_id)
      values (v_entry, d.company_id, v_line, l.post_acc, l.description, 0, l.line_amount, l.dimension_id);
    end loop;

    if d.vat_amount <> 0 then
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
      values (v_entry, d.company_id, v_line, v_vat_out, 'ภาษีขาย 7%', 0, d.vat_amount);
    end if;
    if d.wht_amount <> 0 then
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
      values (v_entry, d.company_id, v_line, v_wht_recv, 'ภาษีถูกหัก ณ ที่จ่าย', d.wht_amount, 0, d.contact_id);
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
      values (v_entry, d.company_id, v_line, v_ar, 'ลดลูกหนี้จากภาษีถูกหัก ณ ที่จ่าย', 0, d.wht_amount, d.contact_id);
    end if;
    end if;

    -- ---------- ตัดสต๊อก FIFO + ลงต้นทุนขาย ----------
    if v_stock_out then
      for l in select coalesce(dl.base_quantity, dl.quantity) as quantity,
                      dl.description, dl.dimension_id, dl.product_id,
                      coalesce(p.cogs_account_id, v_cogs)      as cogs_acc,
                      coalesce(p.inventory_account_id, v_inv)  as inv_acc
               from public.document_lines dl
               join public.products p on p.id = dl.product_id
               where dl.document_id = d.id and p.track_inventory and dl.quantity > 0
               order by dl.line_no loop

        v_cost := app.inv_issue(d.company_id, l.product_id, d.doc_date, l.quantity, d.id,
                                'ขายตามเอกสาร ' || d.doc_number);

        if v_cost is not null and v_cost <> 0 and l.cogs_acc is not null and l.inv_acc is not null then
          v_line := v_line + 1;
          insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, dimension_id)
          values (v_entry, d.company_id, v_line, l.cogs_acc, 'ต้นทุนขาย - ' || l.description, v_cost, 0, l.dimension_id);
          v_line := v_line + 1;
          insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, dimension_id)
          values (v_entry, d.company_id, v_line, l.inv_acc, 'ตัดสินค้าคงเหลือ - ' || l.description, 0, v_cost, l.dimension_id);
        end if;
      end loop;
    end if;

    -- ---------- รับคืนสินค้า (ใบลดหนี้ขาย) ----------
    if v_stock_in then
      for l in select coalesce(dl.base_quantity, dl.quantity) as quantity,
                      dl.line_amount, dl.description, dl.dimension_id, dl.product_id,
                      coalesce(p.cogs_account_id, v_cogs)     as cogs_acc,
                      coalesce(p.inventory_account_id, v_inv) as inv_acc,
                      p.purchase_price
               from public.document_lines dl
               join public.products p on p.id = dl.product_id
               where dl.document_id = d.id and p.track_inventory and dl.quantity > 0
               order by dl.line_no loop

        v_unit_cost := coalesce(
          (select il.unit_cost from public.inventory_layers il
            where il.company_id = d.company_id and il.product_id = l.product_id
            order by il.received_at desc, il.created_at desc limit 1),
          l.purchase_price, 0);

        perform app.inv_receive(d.company_id, l.product_id, d.doc_date, l.quantity, v_unit_cost, d.id,
                                'รับคืนตามเอกสาร ' || d.doc_number);

        v_cost := round(l.quantity * v_unit_cost, 2);
        if v_cost <> 0 and l.cogs_acc is not null and l.inv_acc is not null then
          v_line := v_line + 1;
          insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, dimension_id)
          values (v_entry, d.company_id, v_line, l.inv_acc, 'รับคืนสินค้าคงเหลือ - ' || l.description, v_cost, 0, l.dimension_id);
          v_line := v_line + 1;
          insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, dimension_id)
          values (v_entry, d.company_id, v_line, l.cogs_acc, 'กลับต้นทุนขาย - ' || l.description, 0, v_cost, l.dimension_id);
        end if;
      end loop;
    end if;
  else
    -- ========== ฝั่งซื้อ ==========
    -- ใบจ่ายเงินมัดจำยังไม่ใช่ค่าใช้จ่าย เป็นสินทรัพย์ (เงินมัดจำจ่าย) จนกว่าจะรับของ
    if d.kind::text = 'deposit_payment' then
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
      values (v_entry, d.company_id, v_line, v_dep_p, 'เงินมัดจำจ่าย - ' || d.doc_number, d.vat_base, 0, d.contact_id);

      if d.vat_amount <> 0 then
        v_line := v_line + 1;
        insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
        values (v_entry, d.company_id, v_line, v_vat_in, 'ภาษีซื้อ - เงินมัดจำ', d.vat_amount, 0);
      end if;

      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
      values (v_entry, d.company_id, v_line, v_ap, 'เจ้าหนี้ - เงินมัดจำ ' || d.doc_number, 0, d.grand_total, d.contact_id);

      update public.documents set status = 'approved', approved_by = auth.uid(), approved_at = now(),
             journal_entry_id = v_entry where id = p_document;
      return v_entry;
    end if;

    for l in select dl.*, coalesce(dl.account_id, p.expense_account_id,
                    case when p.track_inventory then coalesce(p.inventory_account_id, app.acc(d.company_id,'inventory')) end,
                    app.acc(d.company_id,'default_expense')) as post_acc,
                    p.track_inventory, p.inventory_account_id
             from public.document_lines dl
             left join public.products p on p.id = dl.product_id
             where dl.document_id = d.id order by dl.line_no loop
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, dimension_id)
      values (v_entry, d.company_id, v_line, l.post_acc, l.description, l.line_amount, 0, l.dimension_id);

      -- รับสต๊อกเฉพาะบรรทัดที่เข้าบัญชีสินค้าคงเหลือจริง เพื่อให้ GL กับสต๊อกตรงกัน
      if v_stock_in and l.product_id is not null and l.track_inventory and l.quantity > 0
         and l.post_acc = coalesce(l.inventory_account_id, v_inv) then
        -- รับเข้าเป็นหน่วยฐานเสมอ ต้นทุนต่อหน่วยจึงหารด้วยจำนวนหน่วยฐาน
        -- ซื้อ 1 ลัง 240 บาท เมื่อ 1 ลัง = 24 ชิ้น ต้องได้ 24 ชิ้น ชิ้นละ 10 บาท
        perform app.inv_receive(d.company_id, l.product_id, d.doc_date,
                                coalesce(l.base_quantity, l.quantity),
                                round(l.line_amount / coalesce(l.base_quantity, l.quantity), 6), d.id,
                                'รับเข้าตามเอกสาร ' || d.doc_number);
      end if;
    end loop;

    if d.vat_amount <> 0 then
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
      values (v_entry, d.company_id, v_line, v_vat_in, 'ภาษีซื้อ 7%', d.vat_amount, 0);
    end if;

    v_line := v_line + 1;
    insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
    values (v_entry, d.company_id, v_line, v_ap, 'เจ้าหนี้การค้า - ' || d.doc_number, 0, d.grand_total, d.contact_id);

    -- มัดจำที่จ่ายไว้ล่วงหน้า แยกส่วนมูลค่าออกจากส่วนภาษีด้วยเหตุผลเดียวกับฝั่งขาย
    -- ภาษีซื้อของงวดมัดจำถูกใช้สิทธิ์ไปแล้ว ต้องกลับออกไม่ให้ใช้สิทธิ์ซ้ำ
    for l in
      select a.amount,
             round(a.amount * (dep.vat_amount / nullif(dep.grand_total, 0)), 2) as vat_part,
             dep.doc_number as dep_number
      from public.deposit_applications a
      join public.documents dep on dep.id = a.deposit_document_id
      where a.target_document_id = d.id
    loop
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
      values (v_entry, d.company_id, v_line, v_ap,
              'ลดเจ้าหนี้จากเงินมัดจำ - ' || l.dep_number, l.amount, 0, d.contact_id);

      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
      values (v_entry, d.company_id, v_line, v_dep_p,
              'ล้างเงินมัดจำจ่าย - ' || l.dep_number,
              0, l.amount - coalesce(l.vat_part, 0), d.contact_id);

      if coalesce(l.vat_part, 0) <> 0 then
        v_line := v_line + 1;
        insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
        values (v_entry, d.company_id, v_line, v_vat_in,
                'กลับภาษีซื้อของเงินมัดจำ - ' || l.dep_number, 0, l.vat_part);
      end if;
    end loop;

    if d.wht_amount <> 0 then
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
      values (v_entry, d.company_id, v_line, v_ap, 'ลดเจ้าหนี้จากภาษีหัก ณ ที่จ่าย', d.wht_amount, 0, d.contact_id);
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
      values (v_entry, d.company_id, v_line, v_wht_pay, 'ภาษีหัก ณ ที่จ่ายค้างจ่าย', 0, d.wht_amount, d.contact_id);
    end if;

    -- ใบลดหนี้ซื้อ (ส่งคืนผู้ขาย) : ตัดสต๊อกออกแบบ FIFO
    if v_stock_out then
      for l in select coalesce(dl.base_quantity, dl.quantity) as quantity, dl.product_id
               from public.document_lines dl
               join public.products p on p.id = dl.product_id
               where dl.document_id = d.id and p.track_inventory and dl.quantity > 0
               order by dl.line_no loop
        perform app.inv_issue(d.company_id, l.product_id, d.doc_date, l.quantity, d.id,
                              'ส่งคืนตามเอกสาร ' || d.doc_number);
      end loop;
    end if;
  end if;

  update public.documents
     set journal_entry_id = v_entry, status = 'approved', approved_by = auth.uid(), approved_at = now()
   where id = p_document;

  return v_entry;
end $function$;

CREATE OR REPLACE FUNCTION public.reserve_sales_order(p_document uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
declare
  d record; l record;
  v_wh uuid; v_onhand numeric; v_reserved numeric; v_available numeric;
  v_ok int := 0; v_short int := 0;
  v_details jsonb := '[]'::jsonb;
begin
  select * into d from public.documents where id = p_document;
  if not found then raise exception 'DOC_NOT_FOUND'; end if;
  if d.kind::text <> 'sales_order' then
    raise exception 'NOT_SALES_ORDER: จองได้เฉพาะใบสั่งขาย';
  end if;
  if not app.has_perm(d.company_id, 'products.inventory', 'edit') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์จองสินค้า';
  end if;
  if d.status::text in ('void','closed') then
    raise exception 'DOC_CLOSED: ใบสั่งขายนี้ปิดไปแล้ว';
  end if;

  -- คลังของเอกสาร ถ้าไม่ระบุให้ใช้คลังหลัก
  v_wh := d.warehouse_id;
  if v_wh is null then
    select id into v_wh from public.warehouses
    where company_id = d.company_id and is_default and is_active limit 1;
  end if;
  if v_wh is null then raise exception 'NO_WAREHOUSE: ยังไม่ได้ตั้งคลังหลัก'; end if;

  for l in
    select dl.product_id, p.name as product_name, p.sku, sum(coalesce(dl.base_quantity, dl.quantity)) as qty
    from public.document_lines dl
    join public.products p on p.id = dl.product_id
    where dl.document_id = p_document
      and p.track_inventory
    group by dl.product_id, p.name, p.sku
  loop
    -- ข้ามบรรทัดที่จองไว้แล้วจากการกดซ้ำ ไม่งั้นกดสองครั้งจะจองซ้ำเป็นสองเท่า
    if exists (
      select 1 from public.stock_reservations r
      where r.document_id = p_document and r.product_id = l.product_id and r.status = 'active'
    ) then
      continue;
    end if;

    select coalesce(sum(qty_in - qty_out), 0) into v_onhand
    from public.inventory_moves
    where company_id = d.company_id and product_id = l.product_id and warehouse_id = v_wh;

    select coalesce(sum(qty), 0) into v_reserved
    from public.stock_reservations
    where company_id = d.company_id and product_id = l.product_id
      and warehouse_id = v_wh and status = 'active';

    v_available := v_onhand - v_reserved;

    if v_available >= l.qty then
      insert into public.stock_reservations
        (company_id, document_id, product_id, warehouse_id, qty, note, created_by)
      values (d.company_id, p_document, l.product_id, v_wh, l.qty, d.doc_number, auth.uid());
      v_ok := v_ok + 1;
    else
      v_short := v_short + 1;
      v_details := v_details || jsonb_build_object(
        'sku', l.sku, 'name', l.product_name,
        'wanted', l.qty, 'available', greatest(v_available, 0));
    end if;
  end loop;

  return json_build_object('ok', true, 'reserved', v_ok, 'short', v_short, 'shortages', v_details);
end $function$;

CREATE OR REPLACE FUNCTION public.rpt_open_deliveries(p_company uuid)
 RETURNS json
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'app'
AS $function$
  with so as (
    select d.id, d.doc_number, d.doc_date, d.contact_id,
           coalesce(c.name, d.contact_snapshot->>'name') as contact_name
    from public.documents d
    left join public.contacts c on c.id = d.contact_id
    where d.company_id = p_company
      and d.kind::text = 'sales_order'
      and d.status::text not in ('void')
  ),
  ordered as (
    select so.id as so_id, dl.product_id, sum(coalesce(dl.base_quantity, dl.quantity)) as qty_ordered
    from so join public.document_lines dl on dl.document_id = so.id
    where dl.product_id is not null
    group by so.id, dl.product_id
  ),
  delivered as (
    select dv.ref_document_id as so_id, dl.product_id, sum(coalesce(dl.base_quantity, dl.quantity)) as qty_delivered
    from public.documents dv
    join public.document_lines dl on dl.document_id = dv.id
    where dv.company_id = p_company
      and dv.kind::text = 'delivery_order'
      and dv.status::text not in ('void','draft')
      and dv.ref_document_id is not null
      and dl.product_id is not null
    group by dv.ref_document_id, dl.product_id
  )
  select coalesce(jsonb_agg(x order by x->>'doc_date', x->>'doc_number'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'so_id', so.id,
      'doc_number', so.doc_number,
      'doc_date', so.doc_date,
      'contact_name', so.contact_name,
      'lines', (
        select jsonb_agg(jsonb_build_object(
          'product_id', o.product_id,
          'sku', p.sku,
          'name', p.name,
          'ordered', o.qty_ordered,
          'delivered', coalesce(dv.qty_delivered, 0),
          'remaining', o.qty_ordered - coalesce(dv.qty_delivered, 0)
        ) order by p.sku)
        from ordered o
        join public.products p on p.id = o.product_id
        left join delivered dv on dv.so_id = o.so_id and dv.product_id = o.product_id
        where o.so_id = so.id
          and o.qty_ordered - coalesce(dv.qty_delivered, 0) > 0
      )
    ) as x
    from so
    where exists (
      select 1 from ordered o
      left join delivered dv on dv.so_id = o.so_id and dv.product_id = o.product_id
      where o.so_id = so.id and o.qty_ordered - coalesce(dv.qty_delivered, 0) > 0
    )
  ) t;
$function$;

CREATE OR REPLACE FUNCTION app.three_way_check(p_document uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
declare
  d record; co record; po record;
  v_po uuid; v_gr uuid;
  v_ref uuid; v_hops int := 0; r record;
  v_qty_tol numeric; v_price_tol numeric;
  v_findings jsonb := '[]'::jsonb;
  v_errors int := 0; v_warnings int := 0;
begin
  select * into d from public.documents where id = p_document;
  if not found then return jsonb_build_object('checked', false); end if;

  -- ตรวจเฉพาะเอกสารฝั่งซื้อที่กระทบเจ้าหนี้และสต๊อก
  if d.kind::text not in ('bill','goods_receipt') then
    return jsonb_build_object('checked', false, 'reason', 'kind');
  end if;

  select match_qty_tolerance_pct, match_price_tolerance_pct, match_enforce
    into co from public.companies where id = d.company_id;
  if co.match_enforce = 'off' then
    return jsonb_build_object('checked', false, 'reason', 'off');
  end if;
  v_qty_tol   := coalesce(co.match_qty_tolerance_pct, 0) / 100.0;
  v_price_tol := coalesce(co.match_price_tolerance_pct, 0) / 100.0;

  -- ไล่หาใบสั่งซื้อและใบรับสินค้าในสายต้นทาง
  v_ref := d.ref_document_id;
  while v_ref is not null and v_hops < 10 loop
    select id, kind::text as kind, ref_document_id into r
      from public.documents where id = v_ref;
    exit when not found;
    if r.kind = 'purchase_order' and v_po is null then v_po := r.id; end if;
    if r.kind = 'goods_receipt'  and v_gr is null then v_gr := r.id; end if;
    v_ref  := r.ref_document_id;
    v_hops := v_hops + 1;
  end loop;
  if d.kind::text = 'goods_receipt' then v_gr := d.id; end if;

  -- ไม่มีใบสั่งซื้อในสาย = ซื้อโดยไม่ผ่านการขออนุมัติ เป็นข้อสังเกต ไม่ใช่ข้อผิดพลาด
  if v_po is null then
    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'code', 'NO_PO', 'severity', 'warning'));
    v_warnings := v_warnings + 1;
  else
    select contact_id into po from public.documents where id = v_po;
    if d.contact_id is distinct from po.contact_id then
      v_findings := v_findings || jsonb_build_array(jsonb_build_object(
        'code', 'VENDOR_MISMATCH', 'severity', 'error'));
      v_errors := v_errors + 1;
    end if;
  end if;

  -- เทียบรายสินค้า
  -- บรรทัดที่ไม่ผูกสินค้า (ค่าบริการ ค่าขนส่ง) ข้ามไป เพราะจับคู่ไม่ได้อย่างมั่นใจ
  for r in
    with po_l as (
      select dl.product_id, sum(coalesce(dl.base_quantity, dl.quantity)) qty,
             case when sum(dl.quantity) > 0
                  then sum(dl.line_amount) / sum(coalesce(dl.base_quantity, dl.quantity)) end as price
      from public.document_lines dl
      where dl.document_id = v_po and dl.product_id is not null
      group by dl.product_id
    ),
    gr_l as (
      select dl.product_id, sum(coalesce(dl.base_quantity, dl.quantity)) qty
      from public.document_lines dl
      where dl.document_id = v_gr and dl.product_id is not null
      group by dl.product_id
    ),
    doc_l as (
      select dl.product_id, sum(coalesce(dl.base_quantity, dl.quantity)) qty,
             case when sum(dl.quantity) > 0
                  then sum(dl.line_amount) / sum(coalesce(dl.base_quantity, dl.quantity)) end as price
      from public.document_lines dl
      where dl.document_id = d.id and dl.product_id is not null
      group by dl.product_id
    ),
    keys as (
      select product_id from po_l
      union select product_id from gr_l
      union select product_id from doc_l
    )
    select k.product_id, p.sku, p.name,
           coalesce(po_l.qty, 0)  as po_qty,
           coalesce(gr_l.qty, 0)  as gr_qty,
           coalesce(doc_l.qty, 0) as doc_qty,
           po_l.price             as po_price,
           doc_l.price            as doc_price
    from keys k
    join public.products p on p.id = k.product_id
    left join po_l  on po_l.product_id  = k.product_id
    left join gr_l  on gr_l.product_id  = k.product_id
    left join doc_l on doc_l.product_id = k.product_id
    order by p.sku
  loop
    -- รับเกินที่สั่ง
    if v_po is not null and r.gr_qty > r.po_qty * (1 + v_qty_tol) + 0.0001 then
      v_findings := v_findings || jsonb_build_array(jsonb_build_object(
        'code', 'OVER_RECEIPT', 'severity', 'error',
        'sku', r.sku, 'name', r.name,
        'ordered', r.po_qty, 'received', r.gr_qty));
      v_errors := v_errors + 1;
    end if;

    -- ตั้งหนี้เกินของที่รับจริง — ข้อนี้คือเงินที่จ่ายออกไปเกิน
    if d.kind::text = 'bill' and v_gr is not null
       and r.doc_qty > r.gr_qty * (1 + v_qty_tol) + 0.0001 then
      v_findings := v_findings || jsonb_build_array(jsonb_build_object(
        'code', case when r.gr_qty = 0 then 'NOT_RECEIVED' else 'OVER_BILL' end,
        'severity', 'error',
        'sku', r.sku, 'name', r.name,
        'received', r.gr_qty, 'billed', r.doc_qty));
      v_errors := v_errors + 1;
    end if;

    -- ราคาต่อหน่วยไม่ตรงกับที่สั่ง
    if d.kind::text = 'bill' and r.po_price is not null and r.doc_price is not null
       and r.po_price > 0
       and abs(r.doc_price - r.po_price) / r.po_price > v_price_tol + 0.000001 then
      v_findings := v_findings || jsonb_build_array(jsonb_build_object(
        'code', 'PRICE_VARIANCE', 'severity', 'error',
        'sku', r.sku, 'name', r.name,
        'ordered_price', round(r.po_price, 4), 'billed_price', round(r.doc_price, 4),
        'diff_pct', round((r.doc_price - r.po_price) / r.po_price * 100, 2)));
      v_errors := v_errors + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'checked', true,
    'enforce', co.match_enforce,
    'po_id', v_po, 'gr_id', v_gr,
    'errors', v_errors, 'warnings', v_warnings,
    'findings', v_findings);
end $function$;
