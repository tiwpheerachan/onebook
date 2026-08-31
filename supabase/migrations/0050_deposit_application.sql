-- =====================================================================
-- 0050 : เงินมัดจำ — ลงบัญชีให้ถูก และหักออกจากบิลได้จริง
--
--  พบสองเรื่องตอนตรวจเทียบกับคู่มือ Express
--
--  1) บั๊กการลงบัญชี : ใบรับเงินมัดจำถูกลงเป็น "รายได้จากการขาย" ทันที
--     ทดสอบแล้วได้ Dr ลูกหนี้ 10,700 / Cr รายได้ 10,000 / Cr ภาษีขาย 700
--     ซึ่งผิดหลักบัญชี เงินมัดจำที่รับมายังไม่ใช่รายได้จนกว่าจะส่งมอบของ
--     ต้องเป็นหนี้สิน (เงินมัดจำรับ 2170) ผลคือรายได้และกำไรสูงเกินจริง
--     ทุกครั้งที่รับมัดจำ และจะสูงซ้ำอีกรอบตอนออกใบกำกับจริง
--
--     บัญชี 2170 เงินมัดจำรับ และ 1190 เงินมัดจำจ่าย ถูก seed ไว้ตั้งแต่ 0007
--     แต่ไม่เคยถูกใช้เลย เป็นของที่มีแต่ไม่ได้ต่อสายอีกชุดหนึ่ง
--
--  2) หักมัดจำในบิลไม่ได้ : Express มีช่อง "หักเงินมัดจำ" อยู่บนหน้าบันทึก
--     คู่กับช่องหักส่วนลด ของเราไม่มี ผู้ใช้ต้องไปออกใบลดหนี้เอง ร่องรอยขาด
--     และไม่มีอะไรกันไม่ให้เอามัดจำใบเดียวไปหักสองบิล
--
--  ทางที่เลือก : บันทึกการหักเป็นตารางแยก ไม่ใช่แค่ตัวเลขบนหัวเอกสาร
--  เพราะต้องรู้ว่ามัดจำใบไหนถูกใช้ไปแล้วเท่าไร เหลือเท่าไร และใครใช้
--  ตัวเลขบนหัวเอกสารเป็นผลรวมที่ทริกเกอร์คำนวณให้ ไม่ให้แก้มือ
--  ป้องกันตัวเลขสองที่ที่ไม่ตรงกันตั้งแต่ต้น
-- =====================================================================

-- ------------------------------------------------------------------------
-- 1) ตารางการหักมัดจำ
-- ------------------------------------------------------------------------
create table if not exists public.deposit_applications (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  -- ใบรับเงินมัดจำ (ฝั่งขาย) หรือใบจ่ายเงินมัดจำ (ฝั่งซื้อ)
  deposit_document_id uuid not null references public.documents(id) on delete cascade,
  -- ใบแจ้งหนี้ ใบกำกับ หรือบิลที่นำมัดจำไปหัก
  target_document_id  uuid not null references public.documents(id) on delete cascade,
  amount              numeric(18,2) not null check (amount > 0),
  note                text,
  created_by          uuid references public.profiles(id),
  created_at          timestamptz not null default now(),
  -- มัดจำใบเดียวหักกับบิลใบเดียวได้ครั้งเดียว ถ้าจะแก้ยอดให้ลบแล้วหักใหม่
  unique (deposit_document_id, target_document_id)
);

create index if not exists deposit_app_target_idx
  on public.deposit_applications (target_document_id);
create index if not exists deposit_app_source_idx
  on public.deposit_applications (deposit_document_id);

alter table public.deposit_applications enable row level security;
alter table public.deposit_applications force  row level security;

drop policy if exists "depapp_sel" on public.deposit_applications;
create policy "depapp_sel" on public.deposit_applications for select to authenticated
  using (app.has_perm(company_id, 'documents', 'view'));
drop policy if exists "depapp_all" on public.deposit_applications;
create policy "depapp_all" on public.deposit_applications for all to authenticated
  using (app.has_perm(company_id, 'documents', 'edit'))
  with check (app.has_perm(company_id, 'documents', 'edit'));

drop trigger if exists trg_audit_deposit_applications on public.deposit_applications;
create trigger trg_audit_deposit_applications
  after insert or update or delete on public.deposit_applications
  for each row execute function app.audit_trigger();

-- ยอดมัดจำที่ถูกหักบนเอกสารปลายทาง เป็นผลรวมที่คำนวณให้ ไม่ใช่ช่องที่คนกรอก
alter table public.documents
  add column if not exists deposit_applied numeric(18,2) not null default 0;

comment on column public.documents.deposit_applied is
  'ยอดเงินมัดจำที่หักออกจากเอกสารนี้ — ทริกเกอร์คำนวณจาก deposit_applications ห้ามแก้มือ';

-- ------------------------------------------------------------------------
-- 2) ปรับยอดที่ต้องชำระเมื่อมีการหักมัดจำ
--
-- net_payable เดิม = grand_total - wht_amount
-- หักมัดจำแล้วต้องลดลงอีก ไม่งั้นเรียกเก็บเงินเกินและยอดลูกหนี้ผิด
-- ------------------------------------------------------------------------
create or replace function app.sync_deposit_applied()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare v_target uuid; v_sum numeric;
begin
  v_target := coalesce(new.target_document_id, old.target_document_id);

  select coalesce(sum(amount), 0) into v_sum
  from public.deposit_applications where target_document_id = v_target;

  update public.documents
     set deposit_applied = v_sum,
         net_payable = round(grand_total - wht_amount - v_sum, 2),
         updated_at = now()
   where id = v_target;

  return coalesce(new, old);
end $$;

drop trigger if exists trg_deposit_applied on public.deposit_applications;
create trigger trg_deposit_applied
  after insert or update or delete on public.deposit_applications
  for each row execute function app.sync_deposit_applied();

-- ------------------------------------------------------------------------
-- 3) ยอดมัดจำคงเหลือของเอกสารมัดจำใบหนึ่ง
-- ------------------------------------------------------------------------
create or replace function app.deposit_remaining(p_deposit uuid)
returns numeric
language sql
stable
security definer
set search_path = public, app
as $$
  select round(
    coalesce((select d.grand_total from public.documents d where d.id = p_deposit), 0)
    - coalesce((select sum(a.amount) from public.deposit_applications a
                where a.deposit_document_id = p_deposit), 0), 2);
$$;

grant execute on function app.deposit_remaining(uuid) to authenticated;

-- ------------------------------------------------------------------------
-- 4) หักมัดจำเข้ากับบิล
-- ------------------------------------------------------------------------
create or replace function public.apply_deposit(
  p_deposit uuid,
  p_target  uuid,
  p_amount  numeric default null,
  p_note    text default null
)
returns json
language plpgsql
security definer
set search_path = public, app
as $$
declare
  dep record; tgt record;
  v_remaining numeric;
  v_amount    numeric;
  v_payable   numeric;
begin
  select id, company_id, kind::text as kind, status::text as status,
         contact_id, grand_total, doc_number
    into dep from public.documents where id = p_deposit;
  if not found then raise exception 'DEPOSIT_NOT_FOUND'; end if;

  select id, company_id, kind::text as kind, status::text as status,
         contact_id, grand_total, wht_amount, deposit_applied, doc_number
    into tgt from public.documents where id = p_target;
  if not found then raise exception 'TARGET_NOT_FOUND'; end if;

  if not app.has_perm(tgt.company_id, 'documents', 'edit') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์แก้ไขเอกสาร';
  end if;
  if dep.company_id <> tgt.company_id then
    raise exception 'CROSS_COMPANY: เอกสารคนละบริษัทกัน';
  end if;

  -- ฝั่งขายหักกับฝั่งขาย ฝั่งซื้อหักกับฝั่งซื้อ สลับข้างไม่ได้
  if dep.kind = 'deposit_receipt' then
    if tgt.kind not in ('invoice','tax_invoice','billing_note') then
      raise exception 'WRONG_TARGET: ใบรับเงินมัดจำหักได้กับใบแจ้งหนี้หรือใบกำกับภาษีเท่านั้น';
    end if;
  elsif dep.kind = 'deposit_payment' then
    if tgt.kind not in ('bill','expense') then
      raise exception 'WRONG_TARGET: ใบจ่ายเงินมัดจำหักได้กับบิลซื้อหรือค่าใช้จ่ายเท่านั้น';
    end if;
  else
    raise exception 'NOT_DEPOSIT: เอกสารต้นทางไม่ใช่เอกสารเงินมัดจำ';
  end if;

  -- ต้องเป็นคู่ค้ารายเดียวกัน ไม่งั้นเอามัดจำของลูกค้าอื่นมาหักได้
  if dep.contact_id is distinct from tgt.contact_id then
    raise exception 'CONTACT_MISMATCH: เอกสารมัดจำเป็นของคู่ค้าคนละราย';
  end if;

  if dep.status in ('void','draft') then
    raise exception 'DEPOSIT_NOT_READY: เอกสารมัดจำต้องอนุมัติแล้วและยังไม่ถูกยกเลิก';
  end if;
  if tgt.status in ('void','closed','paid') then
    raise exception 'TARGET_CLOSED: เอกสารปลายทางปิดไปแล้ว หักมัดจำไม่ได้';
  end if;

  v_remaining := app.deposit_remaining(p_deposit);
  if v_remaining <= 0 then
    raise exception 'DEPOSIT_USED_UP: เงินมัดจำใบ % ถูกใช้ครบแล้ว', dep.doc_number;
  end if;

  -- ไม่ระบุยอด = หักเท่าที่หักได้ คือน้อยกว่าระหว่างมัดจำคงเหลือกับยอดที่ยังต้องชำระ
  v_payable := round(tgt.grand_total - tgt.wht_amount - coalesce(tgt.deposit_applied, 0), 2);
  v_amount  := coalesce(p_amount, least(v_remaining, v_payable));

  if v_amount <= 0 then
    raise exception 'NOTHING_TO_APPLY: เอกสารนี้ไม่มียอดค้างให้หักแล้ว';
  end if;
  if v_amount > v_remaining then
    raise exception 'OVER_DEPOSIT: หักได้ไม่เกิน % แต่ระบุมา %',
      round(v_remaining, 2), round(v_amount, 2);
  end if;
  if v_amount > v_payable then
    raise exception 'OVER_PAYABLE: ยอดที่ยังต้องชำระเหลือ % หักมากกว่านั้นไม่ได้',
      round(v_payable, 2);
  end if;

  insert into public.deposit_applications
    (company_id, deposit_document_id, target_document_id, amount, note, created_by)
  values (tgt.company_id, p_deposit, p_target, v_amount, p_note, auth.uid());

  return json_build_object('ok', true, 'amount', v_amount,
                           'deposit_remaining', app.deposit_remaining(p_deposit));
end $$;

grant execute on function public.apply_deposit(uuid, uuid, numeric, text) to authenticated;

-- ยกเลิกการหัก
create or replace function public.unapply_deposit(p_application uuid)
returns json
language plpgsql
security definer
set search_path = public, app
as $$
declare v_company uuid; v_target uuid; v_status text;
begin
  select a.company_id, a.target_document_id into v_company, v_target
  from public.deposit_applications a where a.id = p_application;
  if v_company is null then raise exception 'APPLICATION_NOT_FOUND'; end if;

  if not app.has_perm(v_company, 'documents', 'edit') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์แก้ไขเอกสาร';
  end if;

  -- เอกสารที่ลงบัญชีไปแล้วต้องกลับรายการก่อน ไม่งั้นสมุดรายวันกับเอกสารไม่ตรงกัน
  select status::text into v_status from public.documents where id = v_target;
  if v_status in ('approved','partial','paid','closed') then
    raise exception 'TARGET_POSTED: เอกสารปลายทางลงบัญชีแล้ว ต้องยกเลิกเอกสารก่อน';
  end if;

  delete from public.deposit_applications where id = p_application;
  return json_build_object('ok', true);
end $$;

grant execute on function public.unapply_deposit(uuid) to authenticated;

-- ------------------------------------------------------------------------
-- 5) เงินมัดจำที่ยังใช้ไม่หมดของคู่ค้ารายหนึ่ง — สำหรับให้เลือกบนหน้าจอ
-- ------------------------------------------------------------------------
create or replace function public.rpt_open_deposits(
  p_company uuid,
  p_contact uuid,
  p_side    text default 'sales'    -- sales | purchase
)
returns json
language sql
stable
set search_path = public, app
as $$
  select coalesce(jsonb_agg(x order by x->>'doc_date'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', d.id, 'doc_number', d.doc_number, 'doc_date', d.doc_date,
      'grand_total', d.grand_total,
      'remaining', app.deposit_remaining(d.id)
    ) as x
    from public.documents d
    where d.company_id = p_company
      and d.contact_id = p_contact
      and d.status::text not in ('void','draft')
      and d.kind::text = (case when p_side = 'purchase' then 'deposit_payment' else 'deposit_receipt' end)
      and app.deposit_remaining(d.id) > 0.005
  ) t;
$$;

grant execute on function public.rpt_open_deposits(uuid, uuid, text) to authenticated;

-- การหักมัดจำที่ผูกกับเอกสารใบหนึ่ง
create or replace function public.rpt_deposit_applications(p_document uuid)
returns json
language sql
stable
set search_path = public, app
as $$
  select coalesce(jsonb_agg(x order by x->>'created_at'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', a.id, 'amount', a.amount, 'note', a.note, 'created_at', a.created_at,
      'deposit_id', dep.id, 'deposit_number', dep.doc_number, 'deposit_date', dep.doc_date
    ) as x
    from public.deposit_applications a
    join public.documents dep on dep.id = a.deposit_document_id
    where a.target_document_id = p_document
  ) t;
$$;

grant execute on function public.rpt_deposit_applications(uuid) to authenticated;

comment on table public.deposit_applications is
  'การนำเงินมัดจำไปหักกับบิล — เป็นแหล่งความจริงเดียว documents.deposit_applied เป็นผลรวมที่คำนวณให้';

-- ------------------------------------------------------------------------
-- 6) แก้เครื่องลงบัญชี
--
--   ก) ใบรับเงินมัดจำ  : Dr ลูกหนี้ / Cr เงินมัดจำรับ 2170 / Cr ภาษีขาย
--      เดิมลง Cr รายได้จากการขาย ซึ่งรับรู้รายได้เร็วเกินไป
--   ข) ใบจ่ายเงินมัดจำ : Dr เงินมัดจำจ่าย 1190 / Dr ภาษีซื้อ / Cr เจ้าหนี้
--      เดิมลงเป็นค่าใช้จ่ายทันที
--   ค) บิลที่หักมัดจำ  : ล้างบัญชีมัดจำและลดลูกหนี้/เจ้าหนี้ลงเท่ากัน
--
-- คัดนิยามจริงจากฐานข้อมูลแล้วแก้เฉพาะจุด ไม่ได้พิมพ์ใหม่จากความจำ
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
  v_dep_r   := app.acc(d.company_id,'deposit_received');
  v_dep_p   := app.acc(d.company_id,'deposit_paid');
  v_cogs    := app.acc(d.company_id,'cogs');

  insert into public.journal_entries(company_id, entry_number, entry_date, book, description,
    source_type, source_id, status, is_auto, created_by, posted_by, posted_at)
  values (d.company_id, app.next_entry_number(d.company_id, v_book, d.doc_date), d.doc_date, v_book,
    d.kind::text || ' ' || d.doc_number, 'document', d.id, 'posted', true, auth.uid(), auth.uid(), now())
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
