-- =====================================================================
-- 0059 : ใบส่งของ + ปิดช่องลงบัญชีซ้ำตอนแปลงเอกสาร
--
--  ต้องรัน 0058 ให้จบก่อน ไม่งั้นค่า enum ใหม่ยังใช้ไม่ได้
--
-- ---------------------------------------------------------------------
--  เรื่องที่ 1 : ลงบัญชีซ้ำตอนแปลงเอกสาร  ← ร้ายแรง แก้ก่อน
--
--  post_document รับรู้ลูกหนี้ รายได้ ภาษีขาย และต้นทุนขาย "เต็มจำนวน"
--  ให้ทุกใบที่อยู่ในชุด ('invoice','tax_invoice','receipt') โดยไม่สนใจว่า
--  ใบนั้นแปลงต่อมาจากใบที่ลงบัญชีไปแล้วหรือไม่
--
--  ปุ่มแปลงเอกสารบนหน้าจอเปิดทางให้ทำแบบนี้อยู่แล้ว
--  (ใบแจ้งหนี้ → ใบกำกับภาษี → ใบเสร็จรับเงิน)
--
--  ทดสอบจริงบน PostgreSQL 17 ขายของ 1,000 บาท ครั้งเดียว แล้วแปลงตามปุ่ม
--      รายได้      3,000 บาท   (ควรเป็น 1,000)
--      ลูกหนี้      3,210 บาท   (ควรเป็น 1,070)
--      ภาษีขาย       210 บาท   (ควรเป็น 70)
--      ต้นทุนขาย   1,800 บาท   (ควรเป็น 600)
--      สต๊อก      ตัดออก 30 ชิ้น (ควรเป็น 10)
--
--  ฝั่งซื้อเป็นแบบเดียวกัน ใบรับสินค้า → ซื้อสินค้า รับสต๊อกเข้าสองรอบ
--  และตั้งเจ้าหนี้สองเท่า
--
--  วิธีแก้ : ใบที่แปลงต่อจากใบที่ลงบัญชีแล้ว ถือเป็น "รายการเดิม"
--  ไม่สร้างสมุดรายวันใหม่ แต่ชี้กลับไปที่ใบที่ถือรายการบัญชีผ่าน
--  accounting_doc_id เพื่อให้ยังตรวจย้อนกลับได้ว่าตัวเลขอยู่ที่ใบไหน
--
--  ใบลดหนี้ ใบเพิ่มหนี้ และใบมัดจำไม่เข้าเงื่อนไขนี้ เพราะเป็นเหตุการณ์ใหม่จริง
--
-- ---------------------------------------------------------------------
--  เรื่องที่ 2 : ใบส่งของ
--
--  สายขายเดิมข้ามจากใบสั่งขายไปใบกำกับภาษีเลย ทำให้ส่งของบางส่วน
--  ของค้างส่ง และการตัดสต๊อก ณ วันที่ส่งจริงทำไม่ได้
--
--  ใบส่งของตัดสต๊อกแบบ FIFO และลง เดบิต ต้นทุนขาย / เครดิต สินค้าคงเหลือ
--  ตามวันที่ส่งของ แต่ยังไม่รับรู้รายได้และยังไม่ใช่จุดความรับผิดทางภาษี
--  ใบกำกับที่ตามมาจึงรับรู้รายได้กับภาษีขาย แต่ไม่ตัดสต๊อกซ้ำ
--
--  เหตุผลที่ตัดสต๊อกตอนส่ง ไม่ใช่ตอนออกใบกำกับ : ของออกจากคลังไปแล้วจริง
--  ถ้ารอใบกำกับ ยอดในบัญชีคุมสินค้าจะไม่ตรงกับของที่นับได้ในคลัง
-- =====================================================================

-- ------------------------------------------------------------------------
-- 1) คอลัมน์ชี้ว่าใบไหนถือรายการบัญชีของสายนี้
-- ------------------------------------------------------------------------
alter table public.documents
  add column if not exists accounting_doc_id uuid references public.documents(id);

comment on column public.documents.accounting_doc_id is
  'ถ้าไม่ null แปลว่าเอกสารใบนี้แปลงต่อจากใบที่ลงบัญชีไปแล้ว รายการบัญชีอยู่ที่ใบนั้น ไม่ใช่ใบนี้';

create index if not exists documents_acct_doc_idx
  on public.documents (accounting_doc_id) where accounting_doc_id is not null;

-- ------------------------------------------------------------------------
-- 2) ไล่หาใบต้นทางที่ถือรายการบัญชี
--
--  เดินขึ้นตาม ref_document_id ไม่เกิน 10 ชั้น กันสายอ้างวน
-- ------------------------------------------------------------------------
create or replace function app.accounting_source(p_doc uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public, app
as $fn$
declare
  v_kind text; v_ref uuid; v_hops int := 0; r record;
begin
  select kind::text, ref_document_id into v_kind, v_ref
    from public.documents where id = p_doc;
  if v_kind is null then return null; end if;

  -- เอกสารเหล่านี้เป็นเหตุการณ์ใหม่เสมอ ถึงจะแปลงมาจากใบที่ลงบัญชีแล้วก็ตาม
  -- ใบลดหนี้/เพิ่มหนี้คือการแก้ยอดครั้งใหม่ ส่วนใบมัดจำเป็นเงินคนละก้อนกับใบกำกับ
  if v_kind in ('credit_note','debit_note','purchase_credit_note',
                'purchase_debit_note','deposit_receipt','deposit_payment') then
    return null;
  end if;

  while v_ref is not null and v_hops < 10 loop
    select id, kind::text as kind, status::text as status,
           journal_entry_id, ref_document_id, accounting_doc_id
      into r
      from public.documents where id = v_ref;
    exit when not found;

    -- ใบที่รับรู้ลูกหนี้/เจ้าหนี้เต็มจำนวน ถ้าเจอแปลว่าใบล่างเป็นรายการเดิม
    -- ใบส่งของไม่อยู่ในชุดนี้ เพราะลงแค่ต้นทุนขาย ยังไม่มีรายได้
    if r.kind in ('invoice','tax_invoice','receipt','bill','expense','goods_receipt')
       and r.status <> 'void'
       and (r.journal_entry_id is not null or r.accounting_doc_id is not null) then
      return coalesce(r.accounting_doc_id, r.id);
    end if;

    v_ref  := r.ref_document_id;
    v_hops := v_hops + 1;
  end loop;

  return null;
end $fn$;

comment on function app.accounting_source is
  'คืน id ของเอกสารต้นทางที่ถือรายการบัญชีของสายนี้ ถ้าไม่มีคืน null แปลว่าเอกสารนี้ลงบัญชีเองได้';

-- ------------------------------------------------------------------------
-- 3) มีใบส่งของในสายที่ตัดสต๊อกไปแล้วหรือยัง
-- ------------------------------------------------------------------------
create or replace function app.stock_moved_upstream(p_doc uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, app
as $fn$
declare v_ref uuid; v_hops int := 0; r record;
begin
  select ref_document_id into v_ref from public.documents where id = p_doc;
  while v_ref is not null and v_hops < 10 loop
    select id, kind::text as kind, status::text as status, journal_entry_id, ref_document_id
      into r from public.documents where id = v_ref;
    exit when not found;
    if r.kind = 'delivery_order' and r.status <> 'void' and r.journal_entry_id is not null then
      return true;
    end if;
    v_ref := r.ref_document_id;
    v_hops := v_hops + 1;
  end loop;
  return false;
end $fn$;

comment on function app.stock_moved_upstream is
  'จริงเมื่อมีใบส่งของที่ตัดสต๊อกไปแล้วอยู่ในสายต้นทาง ใบกำกับที่ตามมาจะได้ไม่ตัดซ้ำ';

-- ------------------------------------------------------------------------
-- 4) เลขที่เอกสารของใบส่งของ
-- ------------------------------------------------------------------------
insert into public.doc_sequences (company_id, doc_kind, prefix)
select c.id, 'delivery_order', 'DO' from public.companies c
on conflict (company_id, doc_kind) do nothing;

create or replace function app.seed_doc_sequences(p_company uuid)
returns void language plpgsql security definer set search_path = public, app as $seed$
begin
  insert into public.doc_sequences(company_id, doc_kind, prefix) values
    (p_company,'quotation','QU'),          (p_company,'billing_note','BN'),
    (p_company,'sales_order','SO'),        (p_company,'delivery_order','DO'),
    (p_company,'invoice','IV'),            (p_company,'tax_invoice','TX'),
    (p_company,'receipt','RE'),            (p_company,'credit_note','CN'),
    (p_company,'debit_note','DN'),         (p_company,'deposit_receipt','DR'),
    (p_company,'purchase_request','PR'),   (p_company,'purchase_order','PO'),
    (p_company,'goods_receipt','GR'),      (p_company,'bill','BL'),
    (p_company,'expense','EX'),            (p_company,'purchase_credit_note','PC'),
    (p_company,'purchase_debit_note','PD'),(p_company,'deposit_payment','DP')
  on conflict (company_id, doc_kind) do nothing;
end $seed$;

-- ------------------------------------------------------------------------
-- 5) เอนจินลงบัญชี
--
--  คัดนิยามจริงจากฐานข้อมูล (pg_get_functiondef) แล้วแก้สี่จุด
--  ไม่ได้พิมพ์ใหม่ เพื่อไม่ให้ตรรกะมัดจำและ FIFO ที่ทำไว้ก่อนหน้าเพี้ยน
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
  'ลงบัญชีเอกสาร — ใบที่แปลงต่อจากใบที่ลงบัญชีแล้วจะไม่ลงซ้ำ และใบส่งของลงเฉพาะต้นทุนขาย';

-- ------------------------------------------------------------------------
-- 6) ใบส่งของปิดใบสั่งขายและปลดการจอง เหมือนที่ใบกำกับทำอยู่แล้ว
-- ------------------------------------------------------------------------
create or replace function app.so_fulfil_on_convert()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $fz$
declare v_src record;
begin
  if new.ref_document_id is null then return new; end if;
  if new.kind::text not in ('invoice','tax_invoice','delivery_order') then return new; end if;

  select id, kind::text as kind, status::text as status into v_src
  from public.documents where id = new.ref_document_id;

  if found and v_src.kind = 'sales_order' and v_src.status not in ('void','closed') then
    update public.documents set status = 'closed' where id = v_src.id;
  end if;
  return new;
end $fz$;

-- ------------------------------------------------------------------------
-- 7) รายงานอายุหนี้และเอกสารค้างชำระ ต้องไม่นับใบที่เป็นรายการซ้ำ
--
--  ถ้าไม่กรองตรงนี้ ใบกำกับที่แปลงมาจากใบแจ้งหนี้จะโผล่เป็นลูกหนี้อีกใบ
--  ทั้งที่เป็นหนี้ก้อนเดียวกัน
-- ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpt_aging(p_company uuid, p_as_of date, p_side text DEFAULT 'ar'::text)
 RETURNS TABLE(contact_id uuid, contact_name text, doc_number text, doc_date date, due_date date, outstanding numeric, bucket text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
  select d.contact_id, c.name, d.doc_number, d.doc_date, d.due_date,
         (d.net_payable - d.paid_amount) as outstanding,
         case
           when coalesce(d.due_date, d.doc_date) >= p_as_of then 'current'
           when p_as_of - coalesce(d.due_date, d.doc_date) <= 30 then 'd1_30'
           when p_as_of - coalesce(d.due_date, d.doc_date) <= 60 then 'd31_60'
           when p_as_of - coalesce(d.due_date, d.doc_date) <= 90 then 'd61_90'
           else 'd90_plus' end
  from public.documents d
  left join public.contacts c on c.id = d.contact_id
  where d.company_id = p_company
    and d.accounting_doc_id is null
    and d.status in ('approved','partial','overdue')
    and d.doc_date <= p_as_of
    and (d.net_payable - d.paid_amount) > 0.005
    and (case when p_side = 'ar' then d.kind::text in ('invoice','tax_invoice','debit_note')
              else d.kind::text in ('bill','expense','purchase_debit_note') end)
    and (app.has_perm(p_company,'report','view'))
  order by 6 desc;
$function$;

CREATE OR REPLACE FUNCTION public.rpt_open_documents(p_company uuid, p_contact uuid, p_side text DEFAULT 'receive'::text)
 RETURNS json
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'app'
AS $function$
  select coalesce(jsonb_agg(x order by x->>'due_date' nulls last, x->>'doc_date'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', d.id, 'doc_number', d.doc_number, 'doc_date', d.doc_date, 'due_date', d.due_date,
      'kind', d.kind::text, 'description', d.description,
      'net_payable', d.net_payable, 'paid_amount', d.paid_amount,
      'outstanding', round(d.net_payable - d.paid_amount, 2),
      'overdue', (d.due_date is not null and d.due_date < current_date)
    ) as x
    from public.documents d
    where d.company_id = p_company
    and d.accounting_doc_id is null
      and (p_contact is null or d.contact_id = p_contact)
      and d.status::text in ('approved','partial','overdue')
      and round(d.net_payable - d.paid_amount, 2) > 0.005
      and d.kind::text = any (case when p_side = 'pay'
             then array['bill','expense','purchase_debit_note']
             else array['invoice','tax_invoice','debit_note','billing_note'] end)
  ) t;
$function$;


-- rpt_subledger_reconcile นับยอดเอกสารค้างชำระเทียบกับบัญชีคุม
-- ต้องกรองแบบเดียวกัน ไม่งั้นฝั่งเอกสารจะสูงกว่าบัญชีคุมทันทีที่มีการแปลงเอกสาร
create or replace function public.rpt_subledger_reconcile(p_company uuid, p_as_of date default current_date)
returns json
language sql
stable
security definer
set search_path = public, app
as $sub$
  with allowed as (
    select app.can_access_company(p_company, auth.uid())
       and app.has_perm(p_company, 'report', 'view') as ok
  ),
  gl as (
    select a.system_key,
           sum(case when a.system_key = 'ar' then jl.debit - jl.credit
                    else jl.credit - jl.debit end) as balance
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.entry_id and je.status = 'posted'
    join public.accounts a on a.id = jl.account_id
    cross join allowed
    where allowed.ok
      and jl.company_id = p_company
      and je.entry_date <= p_as_of
      and a.system_key in ('ar','ap')
    group by a.system_key
  ),
  sub as (
    select case when d.kind::text in ('bill','expense','purchase_debit_note') then 'ap' else 'ar' end as side,
           sum(d.net_payable - d.paid_amount) as balance
    from public.documents d
    cross join allowed
    where allowed.ok
      and d.company_id = p_company
      and d.accounting_doc_id is null
      and d.status::text in ('approved','partial','overdue')
      and d.doc_date <= p_as_of
      and d.kind::text in ('invoice','tax_invoice','debit_note',
                           'bill','expense','purchase_debit_note')
    group by 1
  ),
  manual as (
    select a.system_key,
           count(*) as n,
           sum(abs(jl.debit - jl.credit)) as amount
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.entry_id and je.status = 'posted'
    join public.accounts a on a.id = jl.account_id
    cross join allowed
    where allowed.ok
      and jl.company_id = p_company
      and je.entry_date <= p_as_of
      and a.system_key in ('ar','ap')
      and coalesce(je.source_type, '') not in ('document','payment')
    group by a.system_key
  )
  select json_build_object(
    'as_of', p_as_of,
    'allowed', (select ok from allowed),
    'sides', case when (select ok from allowed)
      then coalesce((
        select jsonb_agg(x order by x->>'side')
        from (
          select jsonb_build_object(
            'side', k.side,
            'gl_balance',  round(coalesce(g.balance, 0), 2),
            'sub_balance', round(coalesce(s.balance, 0), 2),
            'diff',        round(coalesce(g.balance, 0) - coalesce(s.balance, 0), 2),
            'manual_entries', coalesce(m.n, 0),
            'manual_amount',  round(coalesce(m.amount, 0), 2)
          ) as x
          from (values ('ar'), ('ap')) as k(side)
          left join gl     g on g.system_key = k.side
          left join sub    s on s.side = k.side
          left join manual m on m.system_key = k.side
        ) t), '[]'::jsonb)
      else '[]'::jsonb end
  );
$sub$;

grant execute on function public.rpt_subledger_reconcile(uuid, date) to authenticated;

-- ------------------------------------------------------------------------
-- 8) ของค้างส่งตามใบสั่งขาย
--
--  เทียบจำนวนที่สั่งกับจำนวนที่ส่งไปแล้วในใบส่งของทุกใบที่อ้างถึงใบสั่งขายนั้น
--  จับคู่บรรทัดด้วยสินค้า เพราะใบส่งของแต่ละใบอาจเรียงบรรทัดไม่ตรงกับใบสั่งขาย
--
--  security invoker เพื่อให้ RLS กรองสิทธิ์เอง ตามกติกาของโครงการ
-- ------------------------------------------------------------------------
create or replace function public.rpt_open_deliveries(p_company uuid)
returns json
language sql
stable
security invoker
set search_path = public, app
as $rd$
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
    select so.id as so_id, dl.product_id, sum(dl.quantity) as qty_ordered
    from so join public.document_lines dl on dl.document_id = so.id
    where dl.product_id is not null
    group by so.id, dl.product_id
  ),
  delivered as (
    select dv.ref_document_id as so_id, dl.product_id, sum(dl.quantity) as qty_delivered
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
$rd$;

grant execute on function public.rpt_open_deliveries(uuid) to authenticated;

comment on function public.rpt_open_deliveries is
  'ของค้างส่งรายบรรทัดตามใบสั่งขาย — จำนวนที่สั่งลบด้วยจำนวนที่ส่งไปแล้ว';

-- ------------------------------------------------------------------------
-- 9) หาเอกสารที่ลงบัญชีซ้ำไปแล้วก่อนมี 0059
--
--  ตัวแก้ข้างบนกันของใหม่ได้ แต่ข้อมูลที่ลงซ้ำไปแล้วยังอยู่
--  ฟังก์ชันนี้ "รายงานอย่างเดียว ไม่แก้ข้อมูล" เพราะการกลับรายการบัญชีจริง
--  ต้องให้คนตัดสินใจเองว่าจะกลับใบไหน ตามกติกาของโครงการ
-- ------------------------------------------------------------------------
create or replace function public.rpt_double_posted(p_company uuid)
returns json
language sql
stable
security invoker
set search_path = public, app
as $dp$
  select coalesce(jsonb_agg(x order by x->>'doc_date', x->>'doc_number'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', d.id,
      'doc_number', d.doc_number,
      'kind', d.kind::text,
      'doc_date', d.doc_date,
      'grand_total', d.grand_total,
      'source_id', src.id,
      'source_number', src.doc_number,
      'source_kind', src.kind::text,
      'journal_entry_id', d.journal_entry_id
    ) as x
    from public.documents d
    join public.documents src on src.id = d.ref_document_id
    where d.company_id = p_company
      and d.journal_entry_id is not null
      and d.accounting_doc_id is null
      and d.status::text <> 'void'
      and src.status::text <> 'void'
      and src.journal_entry_id is not null
      and d.kind::text not in ('credit_note','debit_note','purchase_credit_note',
                               'purchase_debit_note','deposit_receipt','deposit_payment')
      and src.kind::text in ('invoice','tax_invoice','receipt','bill','expense','goods_receipt')
  ) t;
$dp$;

grant execute on function public.rpt_double_posted(uuid) to authenticated;

comment on function public.rpt_double_posted is
  'เอกสารที่ลงบัญชีซ้ำกับใบต้นทางก่อนมี 0059 — รายงานอย่างเดียว ไม่แก้ข้อมูลให้';

-- ------------------------------------------------------------------------
-- 10) view ที่ปิดคอลัมน์ต้องตามให้ทัน
--
--  กับดักตัวเดิมที่เจอมาแล้วสี่รอบ (0044 0051 0057)
--  view นี้ระบุคอลัมน์ทีละตัว เพิ่มคอลัมน์ให้ตารางเมื่อไรต้องเติมที่นี่ด้วย
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
  d.created_by, d.approved_by, d.approved_at,
  d.voided_by, d.voided_at, d.void_reason,
  d.created_at, d.updated_at
from public.documents d;

grant select on public.documents_masked to authenticated;
