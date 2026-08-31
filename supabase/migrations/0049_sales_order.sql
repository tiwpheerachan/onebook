-- =====================================================================
-- 0049 : ใบสั่งขาย — ทำให้ใช้งานได้จริงและผูกกับการจองสินค้า
--
--  ต้องรัน 0048 ให้จบก่อน ไม่งั้นค่าใหม่ของ enum ยังใช้ไม่ได้
--
--  ตำแหน่งในสายงาน : ใบเสนอราคา → ใบสั่งขาย → ใบแจ้งหนี้/ใบกำกับภาษี
--  ใบสั่งขายเป็นข้อผูกพันกับลูกค้า แต่ยังไม่เกิดรายได้และยังไม่ตัดสต๊อก
--  จึงไม่ลงบัญชี เหมือนใบเสนอราคาและใบสั่งซื้อ
-- =====================================================================

-- ------------------------------------------------------------------------
-- 1) เลขที่เอกสารสำหรับบริษัทที่มีอยู่แล้ว และบริษัทที่จะเปิดใหม่
-- ------------------------------------------------------------------------
insert into public.doc_sequences (company_id, doc_kind, prefix)
select c.id, 'sales_order', 'SO' from public.companies c
on conflict (company_id, doc_kind) do nothing;

create or replace function app.seed_doc_sequences(p_company uuid)
returns void language plpgsql security definer set search_path = public, app as $seed$
begin
  insert into public.doc_sequences(company_id, doc_kind, prefix) values
    (p_company,'quotation','QU'),          (p_company,'billing_note','BN'),
    (p_company,'sales_order','SO'),
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
-- 2) ใบสั่งขายต้องไม่ลงบัญชี
--
-- ถ้าไม่แก้ตรงนี้ การอนุมัติใบสั่งขายจะเดบิตลูกหนี้และรับรู้รายได้ทันที
-- ทั้งที่ยังไม่ได้ส่งของและยังไม่ได้ออกใบกำกับ ตัวเลขในงบจะผิดทันที
--
-- ตัวฟังก์ชันคัดมาจากนิยามจริงในฐานข้อมูล (pg_get_functiondef) แล้วแก้คำเดียว
-- คือเพิ่ม 'sales_order' เข้าไปในรายการชนิดที่ยังไม่กระทบบัญชี
-- ไม่ได้พิมพ์ใหม่จากความจำ เพื่อไม่ให้ตรรกะส่วนอื่นเพี้ยนโดยไม่ตั้งใจ
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
  v_inv uuid; v_cogs uuid;
  v_is_purchase boolean;
  v_stock_out boolean; v_stock_in boolean;
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

  -- เอกสารที่ทำให้สินค้าเคลื่อนไหว
  v_stock_out := d.kind::text in ('invoice','tax_invoice','receipt','purchase_credit_note');
  v_stock_in  := d.kind::text in ('bill','goods_receipt','expense','credit_note');

  v_book    := case when v_is_purchase then 'PURCHASE' else 'SALE' end;
  v_ar      := app.acc(d.company_id,'ar');
  v_ap      := app.acc(d.company_id,'ap');
  v_vat_out := app.acc(d.company_id,'vat_output');
  v_vat_in  := app.acc(d.company_id,'vat_input');
  v_wht_recv:= app.acc(d.company_id,'wht_receivable');
  v_wht_pay := app.acc(d.company_id,'wht_payable');
  v_inv     := app.acc(d.company_id,'inventory');
  v_cogs    := app.acc(d.company_id,'cogs');

  insert into public.journal_entries(company_id, entry_number, entry_date, book, description,
    source_type, source_id, status, is_auto, created_by, posted_by, posted_at)
  values (d.company_id, app.next_entry_number(d.company_id, v_book, d.doc_date), d.doc_date, v_book,
    d.kind::text || ' ' || d.doc_number, 'document', d.id, 'posted', true, auth.uid(), auth.uid(), now())
  returning id into v_entry;

  if not v_is_purchase then
    -- ========== ฝั่งขาย ==========
    v_line := v_line + 1;
    insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
    values (v_entry, d.company_id, v_line, v_ar, 'ลูกหนี้การค้า - ' || d.doc_number, d.grand_total, 0, d.contact_id);

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

-- ------------------------------------------------------------------------
-- 3) จองสินค้าตามใบสั่งขายทั้งใบในครั้งเดียว
--
-- reserve_stock ของ 0041 จองได้ทีละบรรทัดและจะโยน error ทันทีที่ของไม่พอ
-- ถ้าเรียกตรง ๆ ทีละบรรทัด บรรทัดแรกที่ของไม่พอจะทำให้ทั้งใบล้ม
-- และผู้ใช้ไม่รู้ว่าอะไรจองได้บ้าง จึงห่อเป็นฟังก์ชันที่จองเท่าที่จองได้
-- แล้วรายงานกลับว่าบรรทัดไหนไม่พอและขาดเท่าไร
--
-- ตั้งใจไม่จองอัตโนมัติตอนอนุมัติ เพราะการรับออร์เดอร์สินค้าที่ยังไม่มีของ
-- เป็นเรื่องปกติ ถ้าบล็อกไว้จะบันทึกออร์เดอร์ล่วงหน้าไม่ได้เลย
-- ------------------------------------------------------------------------
create or replace function public.reserve_sales_order(p_document uuid)
returns json
language plpgsql
security definer
set search_path = public, app
as $so$
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
    select dl.product_id, p.name as product_name, p.sku, sum(dl.quantity) as qty
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
end $so$;

grant execute on function public.reserve_sales_order(uuid) to authenticated;

-- ------------------------------------------------------------------------
-- 4) ปิดการจองให้เองเมื่อใบสั่งขายจบเส้นทาง
--
-- ยกเลิกใบสั่งขาย = ปล่อยของกลับเข้าสต๊อกพร้อมขาย
-- แปลงเป็นใบแจ้งหนี้/ใบกำกับ = ถือว่าส่งมอบแล้ว ปิดเป็น fulfilled
--
-- ถ้าไม่ทำ การจองจะค้างเป็น active ตลอดไป ยอดพร้อมขายจะต่ำกว่าความจริง
-- เรื่อย ๆ โดยไม่มีใครสังเกต จนวันหนึ่งขายของที่มีอยู่ไม่ได้
-- ------------------------------------------------------------------------
create or replace function app.so_close_reservations()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $rz$
begin
  if new.kind::text <> 'sales_order' then return new; end if;
  if new.status::text = old.status::text then return new; end if;

  if new.status::text = 'void' then
    update public.stock_reservations
       set status = 'released'::reservation_status, updated_at = now()
     where document_id = new.id and status = 'active';
  elsif new.status::text = 'closed' then
    update public.stock_reservations
       set status = 'fulfilled'::reservation_status, updated_at = now()
     where document_id = new.id and status = 'active';
  end if;

  return new;
end $rz$;

drop trigger if exists trg_so_reservations on public.documents;
create trigger trg_so_reservations
  after update of status on public.documents
  for each row execute function app.so_close_reservations();

-- เอกสารปลายทางอ้างถึงใบสั่งขาย = ส่งมอบแล้ว ปิดใบสั่งขายและปิดการจอง
create or replace function app.so_fulfil_on_convert()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $fz$
declare v_src record;
begin
  if new.ref_document_id is null then return new; end if;
  if new.kind::text not in ('invoice','tax_invoice') then return new; end if;

  select id, kind::text as kind, status::text as status into v_src
  from public.documents where id = new.ref_document_id;

  if found and v_src.kind = 'sales_order' and v_src.status not in ('void','closed') then
    update public.documents set status = 'closed' where id = v_src.id;
  end if;
  return new;
end $fz$;

drop trigger if exists trg_so_fulfil on public.documents;
create trigger trg_so_fulfil
  after insert on public.documents
  for each row execute function app.so_fulfil_on_convert();

-- ------------------------------------------------------------------------
-- 5) ใบสั่งขายที่ยังค้างส่ง พร้อมสถานะการจอง
-- ------------------------------------------------------------------------
create or replace function public.rpt_open_sales_orders(p_company uuid)
returns json
language sql
stable
set search_path = public, app
as $rp$
  select coalesce(jsonb_agg(x order by x->>'doc_date'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', d.id, 'doc_number', d.doc_number, 'doc_date', d.doc_date,
      'contact_name', coalesce(c.name, d.contact_snapshot->>'name'),
      'grand_total', d.grand_total,
      'status', d.status::text,
      'reserved_lines', (select count(*) from public.stock_reservations r
                         where r.document_id = d.id and r.status = 'active'),
      'stock_lines', (select count(distinct dl.product_id)
                      from public.document_lines dl
                      join public.products p on p.id = dl.product_id
                      where dl.document_id = d.id and p.track_inventory)
    ) as x
    from public.documents d
    left join public.contacts c on c.id = d.contact_id
    where d.company_id = p_company
      and d.kind::text = 'sales_order'
      and d.status::text in ('draft','awaiting_approval','approved')
  ) t;
$rp$;

grant execute on function public.rpt_open_sales_orders(uuid) to authenticated;

comment on function public.reserve_sales_order is
  'จองสินค้าตามใบสั่งขายทั้งใบ จองเท่าที่มีแล้วรายงานบรรทัดที่ของไม่พอ ไม่ล้มทั้งใบ';
