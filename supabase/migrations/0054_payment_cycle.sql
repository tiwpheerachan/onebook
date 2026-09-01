-- =====================================================================
-- 0054 : รับชำระเงินและจ่ายชำระหนี้ — วงจรที่ยังไม่เคยถูกต่อ
--
--  ที่ตั้งใจจะทำคือข้อ 8 ของแผน "คำนวณยอดลูกหนี้-เจ้าหนี้ใหม่" แบบ Express
--  แต่พอไล่โค้ดก่อนลงมือ พบว่าปัญหาใหญ่กว่านั้นมาก
--
--  ตาราง payments กับ payment_allocations มีมาตั้งแต่ 0003 พร้อม RLS ครบ
--  หน้าจอการเงินก็มี แต่ตรวจแล้วพบว่า
--    - ไม่มีฟังก์ชันไหนในฐานข้อมูลบันทึกการรับชำระเลย
--    - ไม่มีทริกเกอร์บน payments หรือ payment_allocations สักตัว
--    - ทุกฟังก์ชันที่พูดถึง paid_amount เป็นการ "อ่าน" ทั้งหมด
--      (rpt_aging, rpt_dashboard, contact_outstanding, enforce_credit_limit)
--      มีแต่ seed_demo_data ที่เขียนค่าลงไปตรง ๆ
--    - ฝั่งแอปไม่มี action สำหรับสร้างการชำระเงิน หน้าจอมีแต่การอ่าน
--
--  แปลว่าใบแจ้งหนี้ไม่มีทางเปลี่ยนเป็นชำระแล้วได้เลยนอกจากข้อมูลจำลอง
--  รายงานอายุลูกหนี้จะโชว์ยอดเต็มตลอดไป เงินที่รับมาไม่เข้าบัญชี
--  และวงเงินเครดิตที่เพิ่งทำใน 0047 จะไม่มีวันคืนวงเงินให้ลูกค้าเลย
--
--  การ "คำนวณยอดใหม่" จึงไม่มีความหมาย ในเมื่อยังไม่มีอะไรตั้งยอดตั้งแต่ต้น
--  ไฟล์นี้ต่อวงจรให้ครบก่อน แล้วค่อยแถมเครื่องมือกระทบยอดตามที่ตั้งใจไว้เดิม
--
--  หลักที่ยึด : payment_allocations เป็นแหล่งความจริงเดียว
--  documents.paid_amount กับ status เป็นผลลัพธ์ที่ทริกเกอร์คำนวณให้
--  แบบเดียวกับ deposit_applied ใน 0050 กันตัวเลขสองที่ที่ไม่ตรงกัน
-- =====================================================================

-- ------------------------------------------------------------------------
-- 1) ยอดที่ชำระแล้วและสถานะ คำนวณจากการตัดชำระเสมอ
--
-- เรียกใช้ทั้งจากทริกเกอร์และจากเครื่องมือกระทบยอด จึงแยกเป็นฟังก์ชัน
-- ------------------------------------------------------------------------
create or replace function app.refresh_doc_payment(p_document uuid)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare d record; v_paid numeric; v_status doc_status;
begin
  select id, kind::text as kind, status::text as status,
         net_payable, due_date, doc_date
    into d from public.documents where id = p_document;
  if d.id is null then return; end if;

  -- เอกสารที่ยกเลิกไปแล้วไม่ต้องยุ่ง สถานะยกเลิกต้องคงอยู่
  if d.status = 'void' then return; end if;

  select coalesce(sum(a.amount), 0) into v_paid
  from public.payment_allocations a
  join public.payments p on p.id = a.payment_id
  where a.document_id = p_document and p.status::text <> 'void';

  -- ใบร่างยังไม่ผูกพัน อัปเดตยอดได้แต่ไม่เปลี่ยนสถานะ
  if d.status = 'draft' then
    update public.documents set paid_amount = v_paid, updated_at = now() where id = p_document;
    return;
  end if;

  v_status := case
    when v_paid >= d.net_payable - 0.005 and d.net_payable > 0 then 'paid'
    when v_paid > 0.005 then 'partial'
    when d.due_date is not null and d.due_date < current_date then 'overdue'
    else 'approved'
  end::doc_status;

  -- เอกสารที่ปิดรายการไปแล้ว (เช่นใบสั่งขายที่แปลงต่อ) ไม่ต้องเปลี่ยนสถานะ
  if d.status = 'closed' then
    update public.documents set paid_amount = v_paid, updated_at = now() where id = p_document;
    return;
  end if;

  update public.documents
     set paid_amount = v_paid, status = v_status, updated_at = now()
   where id = p_document;
end $$;

create or replace function app.sync_payment_allocation()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
begin
  if tg_op = 'UPDATE' and new.document_id is distinct from old.document_id then
    perform app.refresh_doc_payment(old.document_id);
  end if;
  perform app.refresh_doc_payment(coalesce(new.document_id, old.document_id));
  return coalesce(new, old);
end $$;

drop trigger if exists trg_payment_alloc on public.payment_allocations;
create trigger trg_payment_alloc
  after insert or update or delete on public.payment_allocations
  for each row execute function app.sync_payment_allocation();

-- ยกเลิกใบสำคัญจ่าย/รับ ต้องคืนยอดให้เอกสารที่เคยตัดไว้
create or replace function app.sync_payment_status()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare r record;
begin
  if new.status::text = old.status::text then return new; end if;
  for r in select distinct document_id from public.payment_allocations where payment_id = new.id loop
    perform app.refresh_doc_payment(r.document_id);
  end loop;
  return new;
end $$;

drop trigger if exists trg_payment_status on public.payments;
create trigger trg_payment_status
  after update of status on public.payments
  for each row execute function app.sync_payment_status();

-- ------------------------------------------------------------------------
-- 2) บันทึกการรับชำระ / จ่ายชำระ พร้อมตัดกับเอกสารและลงบัญชี
--
--   รับชำระ  Dr เงินสด/ธนาคาร + Dr ภาษีถูกหัก ณ ที่จ่าย + Dr ค่าธรรมเนียม
--            Cr ลูกหนี้การค้า
--   จ่ายชำระ Dr เจ้าหนี้การค้า
--            Cr เงินสด/ธนาคาร + Cr ภาษีหัก ณ ที่จ่ายค้างจ่าย + Dr ค่าธรรมเนียม
--
--  p_allocations รูปแบบ [{"document_id":"...","amount":123.45}, ...]
-- ------------------------------------------------------------------------
create or replace function public.record_payment(
  p_company     uuid,
  p_direction   text,                  -- receive | pay
  p_doc_number  text,
  p_doc_date    date,
  p_contact     uuid,
  p_channel     uuid,
  p_allocations jsonb,
  p_wht         numeric default 0,
  p_fee         numeric default 0,
  p_note        text default null
)
returns json
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_pay      uuid;
  v_entry    uuid;
  v_alloc    numeric := 0;
  v_cash     uuid;
  v_ar       uuid;
  v_ap       uuid;
  v_wht_recv uuid;
  v_wht_pay  uuid;
  v_fee_acc  uuid;
  v_line     int := 0;
  v_book     text;
  a          record;
  d          record;
begin
  if not app.has_perm(p_company, 'finance.payments', 'create') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์บันทึกการรับ-จ่ายชำระ';
  end if;
  if p_direction not in ('receive','pay') then
    raise exception 'BAD_DIRECTION: ทิศทางต้องเป็น receive หรือ pay';
  end if;
  perform app.assert_period_open(p_company, p_doc_date, 'all');

  select account_id into v_cash from public.financial_channels
  where id = p_channel and company_id = p_company and is_active;
  if v_cash is null then
    raise exception 'CHANNEL_NOT_FOUND: ไม่พบช่องทางการเงิน หรือยังไม่ได้ผูกบัญชี';
  end if;

  if p_allocations is null or jsonb_array_length(p_allocations) = 0 then
    raise exception 'NO_ALLOCATION: ต้องเลือกเอกสารที่จะตัดชำระอย่างน้อยหนึ่งใบ';
  end if;

  v_ar      := app.acc(p_company,'ar');
  v_ap      := app.acc(p_company,'ap');
  v_wht_recv:= app.acc(p_company,'wht_receivable');
  v_wht_pay := app.acc(p_company,'wht_payable');
  v_fee_acc := app.acc(p_company,'bank_fee');
  -- ชื่อสมุดต้องตรงกับ check constraint ของ journal_entries ที่ตั้งไว้ใน 0003
  -- ('GL','SALE','PURCHASE','RECEIPT','PAYMENT','ADJ')
  v_book    := case when p_direction = 'receive' then 'RECEIPT' else 'PAYMENT' end;

  insert into public.payments
    (company_id, direction, doc_number, doc_date, contact_id, channel_id,
     amount, wht_amount, fee_amount, note, status, created_by)
  values (p_company, p_direction, p_doc_number, p_doc_date, p_contact, p_channel,
          0, coalesce(p_wht,0), coalesce(p_fee,0), p_note, 'approved', auth.uid())
  returning id into v_pay;

  -- ตรวจทีละใบก่อนตัด ไม่งั้นตัดเกินยอดค้างแล้วลูกหนี้ติดลบ
  for a in select (x->>'document_id')::uuid as doc_id,
                  round((x->>'amount')::numeric, 2) as amt
           from jsonb_array_elements(p_allocations) x
  loop
    if a.amt is null or a.amt <= 0 then
      raise exception 'INVALID_AMOUNT: จำนวนเงินที่ตัดต้องมากกว่าศูนย์';
    end if;

    select id, company_id, contact_id, kind::text as kind, status::text as status,
           net_payable, paid_amount, doc_number
      into d from public.documents where id = a.doc_id;
    if d.id is null then raise exception 'DOC_NOT_FOUND'; end if;
    if d.company_id <> p_company then raise exception 'CROSS_COMPANY: เอกสารคนละบริษัท'; end if;
    if d.status in ('void','draft') then
      raise exception 'DOC_NOT_OPEN: เอกสาร % ยังเป็นร่างหรือถูกยกเลิก ตัดชำระไม่ได้', d.doc_number;
    end if;
    if p_contact is not null and d.contact_id is distinct from p_contact then
      raise exception 'CONTACT_MISMATCH: เอกสาร % เป็นของคู่ค้าคนละราย', d.doc_number;
    end if;

    -- ฝั่งรับตัดกับเอกสารขาย ฝั่งจ่ายตัดกับเอกสารซื้อ สลับข้างไม่ได้
    if p_direction = 'receive' and d.kind not in ('invoice','tax_invoice','debit_note','billing_note') then
      raise exception 'WRONG_SIDE: รับชำระตัดได้กับเอกสารขายเท่านั้น (%)', d.doc_number;
    end if;
    if p_direction = 'pay' and d.kind not in ('bill','expense','purchase_debit_note') then
      raise exception 'WRONG_SIDE: จ่ายชำระตัดได้กับเอกสารซื้อเท่านั้น (%)', d.doc_number;
    end if;

    if a.amt > round(d.net_payable - d.paid_amount, 2) + 0.005 then
      raise exception 'OVER_PAY: เอกสาร % ค้างอยู่ % ตัดเกินไม่ได้',
        d.doc_number, round(d.net_payable - d.paid_amount, 2);
    end if;

    insert into public.payment_allocations (payment_id, document_id, company_id, amount)
    values (v_pay, a.doc_id, p_company, a.amt);

    v_alloc := v_alloc + a.amt;
  end loop;

  -- ------------------------------------------------------------------
  -- กันบันทึกภาษีหัก ณ ที่จ่ายซ้ำสองรอบ
  --
  -- ไทยมีสองจังหวะที่หักภาษีได้ และระบบรองรับทั้งคู่
  --   ก) ระบุบนเอกสารตั้งแต่ออกบิล — post_document ลงบัญชีให้แล้ว
  --      และ net_payable ก็หักออกไปแล้ว ยอดที่ตัดชำระจึงเป็นยอดสุทธิ
  --   ข) ผู้จ่ายมาหักตอนจ่ายจริง โดยไม่ได้ระบุไว้บนเอกสาร
  --
  -- ถ้าเอกสารมีภาษีอยู่แล้วแต่ยังส่ง p_wht มาอีก ภาษีจะถูกบันทึกสองรอบ
  -- บัญชีภาษีหัก ณ ที่จ่ายจะบวมเป็นเท่าตัวโดยไม่มีอะไรฟ้อง จึงต้องหยุดตรงนี้
  -- ------------------------------------------------------------------
  if coalesce(p_wht, 0) <> 0 and exists (
    select 1 from public.payment_allocations pa
    join public.documents dd on dd.id = pa.document_id
    where pa.payment_id = v_pay and coalesce(dd.wht_amount, 0) <> 0
  ) then
    raise exception
      'WHT_ALREADY_ON_DOC: เอกสารที่เลือกระบุภาษีหัก ณ ที่จ่ายไว้แล้ว บันทึกซ้ำตอนชำระไม่ได้';
  end if;

  -- ยอดของใบสำคัญคือยอดที่นำไปตัดเอกสาร ส่วนเงินสดจริงดูได้จากสมุดรายวัน
  update public.payments set amount = v_alloc where id = v_pay;

  -- ------------------------------------------------------------------
  -- ลงบัญชี
  -- ------------------------------------------------------------------
  insert into public.journal_entries(company_id, entry_number, entry_date, book, description,
    source_type, source_id, status, is_auto, created_by, posted_by, posted_at)
  values (p_company, app.next_entry_number(p_company, v_book, p_doc_date), p_doc_date, v_book,
    coalesce(nullif(btrim(p_note), ''),
             case when p_direction = 'receive' then 'รับชำระหนี้ ' else 'จ่ายชำระหนี้ ' end || p_doc_number),
    'payment', v_pay, 'posted', true, auth.uid(), auth.uid(), now())
  returning id into v_entry;

  if p_direction = 'receive' then
    v_line := v_line + 1;
    insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
    values (v_entry, p_company, v_line, v_cash, 'รับชำระ - ' || p_doc_number,
            v_alloc - coalesce(p_wht,0) - coalesce(p_fee,0), 0);

    if coalesce(p_wht,0) <> 0 then
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
      values (v_entry, p_company, v_line, v_wht_recv, 'ภาษีถูกหัก ณ ที่จ่าย', p_wht, 0);
    end if;
    if coalesce(p_fee,0) <> 0 then
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
      values (v_entry, p_company, v_line, v_fee_acc, 'ค่าธรรมเนียมธนาคาร', p_fee, 0);
    end if;

    v_line := v_line + 1;
    insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
    values (v_entry, p_company, v_line, v_ar, 'ลดลูกหนี้ - ' || p_doc_number, 0, v_alloc, p_contact);
  else
    v_line := v_line + 1;
    insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
    values (v_entry, p_company, v_line, v_ap, 'ลดเจ้าหนี้ - ' || p_doc_number, v_alloc, 0, p_contact);

    if coalesce(p_wht,0) <> 0 then
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
      values (v_entry, p_company, v_line, v_wht_pay, 'ภาษีหัก ณ ที่จ่ายค้างจ่าย', 0, p_wht);
    end if;
    if coalesce(p_fee,0) <> 0 then
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
      values (v_entry, p_company, v_line, v_fee_acc, 'ค่าธรรมเนียมธนาคาร', p_fee, 0);
    end if;

    v_line := v_line + 1;
    insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
    values (v_entry, p_company, v_line, v_cash, 'จ่ายชำระ - ' || p_doc_number, 0,
            v_alloc - coalesce(p_wht,0) + coalesce(p_fee,0));
  end if;

  update public.payments set journal_entry_id = v_entry where id = v_pay;

  return json_build_object('ok', true, 'payment_id', v_pay,
                           'journal_entry_id', v_entry, 'allocated', v_alloc);
end $$;

grant execute on function public.record_payment(uuid, text, text, date, uuid, uuid, jsonb, numeric, numeric, text) to authenticated;

-- ------------------------------------------------------------------------
-- 3) ยกเลิกการรับ-จ่ายชำระ
--
-- กลับรายการแทนการลบ เพื่อให้สมุดรายวันยังตรวจย้อนหลังได้
-- ------------------------------------------------------------------------
create or replace function public.void_payment(p_payment uuid, p_reason text default null)
returns json
language plpgsql
security definer
set search_path = public, app
as $$
declare p record; v_rev uuid; l record; i int := 0;
begin
  select * into p from public.payments where id = p_payment;
  if p.id is null then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if not app.has_perm(p.company_id, 'finance.payments', 'void')
     and not app.has_perm(p.company_id, 'finance.payments', 'delete') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์ยกเลิกการรับ-จ่ายชำระ';
  end if;
  if p.status::text = 'void' then raise exception 'ALREADY_VOID: ยกเลิกไปแล้ว'; end if;
  perform app.assert_period_open(p.company_id, p.doc_date, 'all');

  if p.journal_entry_id is not null then
    insert into public.journal_entries(company_id, entry_number, entry_date, book, description,
      source_type, source_id, status, is_auto, created_by, posted_by, posted_at)
    select p.company_id, app.next_entry_number(p.company_id, je.book, current_date), current_date, je.book,
           'กลับรายการ: ' || je.description || coalesce(' (' || p_reason || ')', ''),
           'payment', p.id, 'posted', true, auth.uid(), auth.uid(), now()
    from public.journal_entries je where je.id = p.journal_entry_id
    returning id into v_rev;

    for l in select * from public.journal_lines where entry_id = p.journal_entry_id order by line_no loop
      i := i + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description,
                                       debit, credit, contact_id, dimension_id)
      values (v_rev, p.company_id, i, l.account_id, 'กลับรายการ: ' || coalesce(l.description,''),
              l.credit, l.debit, l.contact_id, l.dimension_id);
    end loop;
  end if;

  -- ทริกเกอร์บน payments จะคืนยอดให้เอกสารที่เคยตัดไว้เอง
  update public.payments
     set status = 'void', note = coalesce(note, '') || coalesce(' | ยกเลิก: ' || p_reason, '')
   where id = p_payment;

  return json_build_object('ok', true, 'reversal_entry_id', v_rev);
end $$;

grant execute on function public.void_payment(uuid, text) to authenticated;

-- ------------------------------------------------------------------------
-- 4) เอกสารที่ยังค้างชำระของคู่ค้ารายหนึ่ง — ให้หน้าจอเลือกตัด
-- ------------------------------------------------------------------------
create or replace function public.rpt_open_documents(
  p_company uuid,
  p_contact uuid,
  p_side    text default 'receive'    -- receive | pay
)
returns json
language sql
stable
set search_path = public, app
as $$
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
      and (p_contact is null or d.contact_id = p_contact)
      and d.status::text in ('approved','partial','overdue')
      and round(d.net_payable - d.paid_amount, 2) > 0.005
      and d.kind::text = any (case when p_side = 'pay'
             then array['bill','expense','purchase_debit_note']
             else array['invoice','tax_invoice','debit_note','billing_note'] end)
  ) t;
$$;

grant execute on function public.rpt_open_documents(uuid, uuid, text) to authenticated;

-- ------------------------------------------------------------------------
-- 5) กระทบยอดบัญชีคุมกับรายละเอียด — งานที่ตั้งใจทำเป็นข้อ 8
--
-- Express มีคำสั่ง "คำนวณยอดลูกหนี้ใหม่" เพราะเก็บยอดสะสมไว้แล้วเพี้ยนได้
-- ของเราคำนวณสดจากเอกสารทุกครั้ง ยอดในรายงานอายุจึงไม่เพี้ยนแบบนั้น
--
-- แต่สิ่งที่เพี้ยนได้จริงคือ "บัญชีคุมในงบดุลไม่ตรงกับผลรวมของเอกสาร"
-- ซึ่งเกิดเมื่อมีคนลงสมุดรายวันใส่บัญชีลูกหนี้ตรง ๆ โดยไม่ผ่านเอกสาร
-- นั่นคือสิ่งที่ผู้ทำบัญชีต้องเช็คก่อนปิดงบ รายงานนี้จึงตอบคำถามนั้น
-- ------------------------------------------------------------------------
create or replace function public.rpt_subledger_reconcile(p_company uuid, p_as_of date default current_date)
returns json
language sql
stable
security definer
set search_path = public, app
as $$
  with gl as (
    select a.system_key,
           sum(case when a.system_key = 'ar' then jl.debit - jl.credit
                    else jl.credit - jl.debit end) as balance
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.entry_id and je.status = 'posted'
    join public.accounts a on a.id = jl.account_id
    where jl.company_id = p_company
      and je.entry_date <= p_as_of
      and a.system_key in ('ar','ap')
    group by a.system_key
  ),
  sub as (
    select case when d.kind::text in ('bill','expense','purchase_debit_note') then 'ap' else 'ar' end as side,
           sum(d.net_payable - d.paid_amount) as balance
    from public.documents d
    where d.company_id = p_company
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
    where jl.company_id = p_company
      and je.entry_date <= p_as_of
      and a.system_key in ('ar','ap')
      -- รายการที่ไม่ได้มาจากเอกสารหรือการรับ-จ่ายชำระ คือที่มาของส่วนต่างเสมอ
      and coalesce(je.source_type, '') not in ('document','payment')
    group by a.system_key
  )
  select json_build_object(
    'as_of', p_as_of,
    'sides', coalesce(jsonb_agg(x order by x->>'side'), '[]'::jsonb))
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
  ) t;
$$;

grant execute on function public.rpt_subledger_reconcile(uuid, date) to authenticated;

-- ------------------------------------------------------------------------
-- 6) คำนวณยอดที่ชำระแล้วใหม่ทั้งบริษัท
--
-- ของ Express เรียก "คำนวณยอดลูกหนี้ใหม่" ใช้ตอนสงสัยว่ายอดเพี้ยน
-- ของเราคำนวณจาก payment_allocations ซึ่งเป็นแหล่งความจริง
-- คืนค่ามาว่าแก้ไปกี่ใบ เพื่อให้เห็นว่าเคยเพี้ยนจริงไหม ไม่ใช่แก้เงียบ ๆ
-- ------------------------------------------------------------------------
create or replace function public.recalc_payment_balances(p_company uuid)
returns json
language plpgsql
security definer
set search_path = public, app
as $$
declare r record; v_changed int := 0; v_total int := 0;
begin
  if not app.has_perm(p_company, 'finance.payments', 'edit') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์คำนวณยอดใหม่';
  end if;

  for r in
    select d.id, d.paid_amount as before,
           coalesce((select sum(a.amount) from public.payment_allocations a
                     join public.payments p on p.id = a.payment_id
                     where a.document_id = d.id and p.status::text <> 'void'), 0) as after
    from public.documents d
    where d.company_id = p_company and d.status::text <> 'void'
  loop
    v_total := v_total + 1;
    if abs(r.before - r.after) > 0.005 then
      v_changed := v_changed + 1;
    end if;
    perform app.refresh_doc_payment(r.id);
  end loop;

  return json_build_object('ok', true, 'checked', v_total, 'corrected', v_changed);
end $$;

grant execute on function public.recalc_payment_balances(uuid) to authenticated;

comment on function public.record_payment is
  'บันทึกรับ-จ่ายชำระ ตัดกับเอกสาร และลงบัญชีในครั้งเดียว — payment_allocations เป็นแหล่งความจริงของยอดที่ชำระแล้ว';
comment on function public.rpt_subledger_reconcile is
  'เทียบบัญชีคุมลูกหนี้/เจ้าหนี้ในงบดุลกับผลรวมเอกสารค้างชำระ พร้อมชี้ว่ามีรายการลงตรงกี่รายการ';
