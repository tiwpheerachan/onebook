-- =====================================================================
-- 0060 : จับคู่สามทาง ใบสั่งซื้อ + ใบรับสินค้า + ใบซื้อ
--
--  ปัญหาที่แก้ : ระบบมีเอกสารครบทั้งสามใบและผูกกันด้วย ref_document_id
--  อยู่แล้ว แต่ไม่เคยเทียบตัวเลขระหว่างกันเลย ค้นทั้งฐานข้อมูลแล้วไม่พบ
--  การตรวจใด ๆ จึงจ่ายเงินตามใบที่ผู้ขายส่งมาได้ แม้จำนวนหรือราคาจะไม่ตรง
--  กับที่สั่งและที่รับจริง
--
--  สิ่งที่ตรวจ ต่อสินค้าหนึ่งรายการ
--    รับเกินสั่ง     ใบรับสินค้า > ใบสั่งซื้อ
--    ตั้งหนี้เกินรับ  ใบซื้อ > ใบรับสินค้า      ← จ่ายเงินค่าของที่ยังไม่ได้รับ
--    ราคาไม่ตรง      ราคาต่อหน่วยในใบซื้อ ≠ ใบสั่งซื้อ
--    ยังไม่ได้รับของ  ใบซื้อมีรายการที่ไม่มีในใบรับสินค้า
--    ผู้ขายไม่ตรง     ใบซื้อคนละเจ้ากับใบสั่งซื้อ
--
--  ค่าความคลาดเคลื่อนตั้งได้ที่ระดับบริษัท และ "ถูกอ่านจริง" ในฟังก์ชันตรวจ
--  ไม่ใช่คอลัมน์ที่ตั้งได้แต่ไม่มีใครใช้ ซึ่งเป็นข้อผิดพลาดที่เจอซ้ำในระบบนี้
--
--  โหมดบังคับใช้มีสามระดับ
--    off   ไม่ตรวจเลย
--    warn  ตรวจและแสดงผลบนหน้าเอกสาร แต่ยังอนุมัติได้        ← ค่าตั้งต้น
--    block ตรวจแล้วถ้าพบข้อผิดพลาด อนุมัติไม่ได้
--
--  ตั้งต้นเป็น warn เพื่อไม่ให้ของเดิมที่คีย์ค้างไว้อนุมัติไม่ได้ทันที
--  เมื่อข้อมูลสะอาดแล้วค่อยเปลี่ยนเป็น block
-- =====================================================================

-- ------------------------------------------------------------------------
-- 1) ค่าความคลาดเคลื่อนที่ยอมรับได้ ตั้งแยกรายบริษัท
-- ------------------------------------------------------------------------
alter table public.companies
  add column if not exists match_qty_tolerance_pct   numeric(6,3) not null default 0,
  add column if not exists match_price_tolerance_pct numeric(6,3) not null default 0,
  add column if not exists match_enforce             text not null default 'warn';

do $$ begin
  alter table public.companies
    add constraint companies_match_enforce_chk check (match_enforce in ('off','warn','block'));
exception when duplicate_object then null; end $$;

comment on column public.companies.match_qty_tolerance_pct is
  'ยอมให้จำนวนคลาดเคลื่อนกี่เปอร์เซ็นต์ก่อนถือว่าผิด 0 = ต้องตรงเป๊ะ';
comment on column public.companies.match_price_tolerance_pct is
  'ยอมให้ราคาต่อหน่วยคลาดเคลื่อนกี่เปอร์เซ็นต์ก่อนถือว่าผิด';
comment on column public.companies.match_enforce is
  'off = ไม่ตรวจ, warn = ตรวจและแจ้งเตือน, block = ตรวจแล้วห้ามอนุมัติถ้าพบข้อผิดพลาด';

-- ------------------------------------------------------------------------
-- 2) ตัวตรวจ
--
--  คืน jsonb ก้อนเดียว ใช้ได้ทั้งตอนอนุมัติและตอนแสดงผลบนหน้าจอ
--  จะได้ไม่มีตรรกะสองชุดที่เพี้ยนจากกัน
-- ------------------------------------------------------------------------
create or replace function app.three_way_check(p_document uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $fn$
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
      select dl.product_id, sum(dl.quantity) qty,
             case when sum(dl.quantity) > 0
                  then sum(dl.line_amount) / sum(dl.quantity) end as price
      from public.document_lines dl
      where dl.document_id = v_po and dl.product_id is not null
      group by dl.product_id
    ),
    gr_l as (
      select dl.product_id, sum(dl.quantity) qty
      from public.document_lines dl
      where dl.document_id = v_gr and dl.product_id is not null
      group by dl.product_id
    ),
    doc_l as (
      select dl.product_id, sum(dl.quantity) qty,
             case when sum(dl.quantity) > 0
                  then sum(dl.line_amount) / sum(dl.quantity) end as price
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
end $fn$;

comment on function app.three_way_check is
  'เทียบใบสั่งซื้อ ใบรับสินค้า และใบซื้อรายสินค้า คืนผลเป็น jsonb ใช้ได้ทั้งตอนอนุมัติและตอนแสดงผล';

-- ------------------------------------------------------------------------
-- 3) เรียกดูผลตรวจจากหน้าจอ
--
--  security invoker เพื่อให้ RLS กรองสิทธิ์เอกสารเอง ตามกติกาของโครงการ
--  ตัว three_way_check เป็น definer เพราะต้องอ่านใบสั่งซื้อที่อาจอยู่นอกตัวกรองแถว
--  จึงต้องตรวจสิทธิ์เอกสารต้นทางก่อนหนึ่งชั้นที่นี่
-- ------------------------------------------------------------------------
create or replace function public.rpt_three_way(p_document uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, app
as $rp$
declare v_ok boolean;
begin
  select true into v_ok from public.documents where id = p_document;
  if not found then return jsonb_build_object('checked', false, 'reason', 'not_found'); end if;
  return app.three_way_check(p_document);
end $rp$;

grant execute on function public.rpt_three_way(uuid) to authenticated;

-- ------------------------------------------------------------------------
-- 4) บังคับใช้ตอนอนุมัติ
--
--  แทรกก่อนทุกอย่าง รวมถึงก่อนตัวกันลงบัญชีซ้ำของ 0059
--  เพื่อให้ใบที่ตัวเลขไม่ตรงถูกปฏิเสธตั้งแต่ต้น ไม่ว่าจะลงบัญชีหรือไม่
-- ------------------------------------------------------------------------
create or replace function app.assert_three_way(p_document uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, app
as $fn$
declare v jsonb; v_first text;
begin
  v := app.three_way_check(p_document);
  if not coalesce((v->>'checked')::boolean, false) then return; end if;
  if v->>'enforce' <> 'block' then return; end if;
  if coalesce((v->>'errors')::int, 0) = 0 then return; end if;

  select f->>'code' into v_first
  from jsonb_array_elements(v->'findings') f
  where f->>'severity' = 'error' limit 1;

  raise exception 'MATCH_FAILED: % (%)', v_first, v->>'errors'
    using hint = 'ใบซื้อไม่ตรงกับใบสั่งซื้อหรือใบรับสินค้า ตรวจที่แผงจับคู่สามทางบนหน้าเอกสาร';
end $fn$;

-- ------------------------------------------------------------------------
-- 5) เอนจินลงบัญชี — เพิ่มการเรียกตัวจับคู่สามทาง
--
--  คัดนิยามจริงหลัง 0059 มาแก้จุดเดียว ไม่ได้พิมพ์ใหม่
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
      for l in select dl.quantity, dl.description, dl.dimension_id, dl.product_id,
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
      for l in select dl.quantity, dl.line_amount, dl.description, dl.dimension_id, dl.product_id,
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
        perform app.inv_receive(d.company_id, l.product_id, d.doc_date, l.quantity,
                                round(l.line_amount / l.quantity, 6), d.id,
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
      for l in select dl.quantity, dl.product_id
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

comment on function public.post_document is
  'ลงบัญชีเอกสาร — ตรวจจับคู่สามทางก่อน ใบที่แปลงต่อจากใบที่ลงบัญชีแล้วไม่ลงซ้ำ และใบส่งของลงเฉพาะต้นทุนขาย';
