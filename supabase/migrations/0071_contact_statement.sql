-- =====================================================================
-- 0071 : แฟ้มผู้ติดต่อ — ยอดคงค้างสองฝั่งและบัญชีเดินสะพัด
--
--  ระบบมีรายงานอายุหนี้รวมทุกราย (rpt_aging) และวงเงินเครดิตรายราย
--  (rpt_credit_status) แต่ยังตอบคำถามพื้นฐานที่สุดไม่ได้ว่า
--  "เจ้านี้มีประวัติอะไรกับเราบ้าง ตกลงใครติดใครเท่าไหร่"
--
--  คนขายถามก่อนโทรทวง คนจัดซื้อถามก่อนสั่งของ และคนทำบัญชีถามตอนกระทบยอด
--
-- ---------------------------------------------------------------------
--  เรื่องที่ตัดสินใจไว้ชัด
--
--  1) สองฝั่งแยกกันเสมอ ไม่หักกลบ
--     ผู้ติดต่อหนึ่งรายเป็นได้ทั้งลูกค้าและผู้ขาย (kind = 'both')
--     การหักกลบลูกหนี้กับเจ้าหนี้ทางบัญชีทำเองไม่ได้ ต้องมีหนังสือตกลงกัน
--     ยอดสุทธิจึงคืนไปเป็น "ข้อมูลประกอบการตัดสินใจ" เท่านั้น
--     ตัวเลขหลักคือสองฝั่งที่แยกกันอยู่
--
--  2) เอกสารที่ยังไม่เป็นหนี้ก็อยู่ในไทม์ไลน์ แต่ไม่คิดยอด
--     ใบเสนอราคา ใบสั่งขาย ใบสั่งซื้อ บอกความสัมพันธ์ได้ว่าคุยอะไรกันไว้
--     แต่ไม่ใช่ภาระหนี้ จึงมีธง is_ledger บอกหน้าจอให้แยกสีและข้ามการรวมยอด
--
--  3) นับเฉพาะใบที่ถือรายการบัญชีของสายนั้น
--     ตามแบบของ 0059 ใบแจ้งหนี้ที่แปลงเป็นใบกำกับภาษีแล้วจะมี accounting_doc_id
--     ถ้าไม่กรองออก หนี้ก้อนเดียวจะถูกนับซ้ำตามจำนวนใบในสาย
--     นี่เป็นบั๊กเดิมที่เพิ่งปิดไป ต้องไม่เปิดใหม่ที่นี่
--
--  ทั้งสองฟังก์ชันเป็น security invoker ให้ RLS กรองสิทธิ์เอง
--  ผู้ใช้ที่ไม่มีสิทธิ์ในบริษัทนั้นจะได้ผลว่าง ไม่ใช่ข้อผิดพลาด
-- =====================================================================

-- ------------------------------------------------------------------------
-- ดัชนีรองรับการค้นตามคู่ค้า
--
--  ของเดิมมีแค่ documents(contact_id) ซึ่งไม่ครอบคลุมการเรียงตามวันที่
--  ทุกคิวรีในไฟล์นี้กรองด้วยบริษัทและคู่ค้า แล้วเรียงตามวันที่เสมอ
-- ------------------------------------------------------------------------
create index if not exists documents_contact_date_idx
  on public.documents(company_id, contact_id, doc_date);

-- ขึ้นต้นด้วย contact_id ไม่ใช่ company_id เพราะ rpt_contact_payments กรองด้วยคู่ค้าตรง ๆ
-- ส่วนขอบเขตบริษัทมาจาก RLS ถ้าเอา company_id ขึ้นก่อน ดัชนีนี้จะใช้ไม่ได้กับคิวรีนั้น
create index if not exists payments_contact_date_idx
  on public.payments(contact_id, doc_date);

-- ------------------------------------------------------------------------
-- ชนิดเอกสารอยู่ฝั่งไหน
--
--  แยกเป็นฟังก์ชันเพราะใช้ซ้ำหลายที่ในไฟล์นี้ และถ้าเพิ่มชนิดเอกสารใหม่
--  จะได้แก้จุดเดียว ไม่ต้องไล่แก้ case ที่กระจายอยู่
--
--    ar = เขาติดเรา   ap = เราติดเขา   none = ยังไม่เป็นหนี้
--
--  อยู่ใน public ไม่ใช่ app ทั้งที่เป็นตัวช่วยภายใน เพราะสองฟังก์ชันรายงาน
--  ด้านล่างเป็น security invoker ผู้เรียกที่ไม่มีสิทธิ์ใช้สคีมา app
--  จะโดนปฏิเสธด้วย error แทนที่จะได้ผลว่าง ซึ่งต่างจาก rpt_ ตัวอื่นในระบบ
--  ทั้งคู่เป็นการแปลงค่าคงที่ ไม่แตะข้อมูล จึงวางไว้ public ได้อย่างปลอดภัย
-- ------------------------------------------------------------------------
create or replace function public.doc_side(p_kind text)
returns text
language sql
immutable
as $$
  select case
    when p_kind in ('invoice','tax_invoice','receipt','debit_note','billing_note') then 'ar'
    when p_kind in ('credit_note') then 'ar'
    when p_kind in ('bill','expense','purchase_debit_note') then 'ap'
    when p_kind in ('purchase_credit_note') then 'ap'
    when p_kind in ('deposit_receipt') then 'ar'
    when p_kind in ('deposit_payment') then 'ap'
    else 'none'
  end;
$$;

comment on function public.doc_side is
  'ชนิดเอกสารอยู่ฝั่งลูกหนี้ ฝั่งเจ้าหนี้ หรือยังไม่เป็นหนี้';

-- ------------------------------------------------------------------------
-- เครื่องหมายของรายการในบัญชีเดินสะพัด
--
--  ใบลดหนี้ลดยอดที่เขาติดเรา จึงเป็นลบ ทั้งที่อยู่ฝั่งลูกหนี้เหมือนกัน
--  ใบเสร็จรับเงินเป็นบวกเพราะตามแบบของ 0059 ใบแรกของสายเป็นตัวลงบัญชี
--  ถ้าสายเริ่มที่ใบเสร็จ (ขายสด) ใบเสร็จนั่นแหละคือตัวตั้งหนี้
--  ส่วนการชำระเงินมาจากตาราง payments ไม่ใช่จากตารางเอกสาร
-- ------------------------------------------------------------------------
create or replace function public.doc_sign(p_kind text)
returns int
language sql
immutable
as $$
  select case when p_kind in ('credit_note','purchase_credit_note') then -1 else 1 end;
$$;

grant execute on function public.doc_side(text) to authenticated, anon;
grant execute on function public.doc_sign(text) to authenticated, anon;

-- ------------------------------------------------------------------------
-- 1) สรุปหัวแฟ้ม — ใครติดใครเท่าไหร่ ณ วันที่กำหนด
-- ------------------------------------------------------------------------
create or replace function public.rpt_contact_summary(
  p_contact uuid,
  p_as_of date default current_date
)
returns json
language sql
stable
security invoker
set search_path = public, app
as $cs$
  with c as (
    select * from public.contacts where id = p_contact
  ),
  -- ใบที่ยังไม่ปิด นับเฉพาะใบที่ถือรายการบัญชีของสาย
  open_docs as (
    select d.kind::text as kind,
           public.doc_side(d.kind::text) as side,
           public.doc_sign(d.kind::text) as sign,
           d.due_date, d.doc_date,
           (d.net_payable - d.paid_amount) as outstanding
    from public.documents d
    join c on c.id = d.contact_id and c.company_id = d.company_id
    where d.accounting_doc_id is null
      and d.status::text in ('approved','partial','overdue')
      and public.doc_side(d.kind::text) <> 'none'
      and d.net_payable - d.paid_amount <> 0
      and d.doc_date <= p_as_of
  ),
  side_total as (
    select side,
           sum(sign * outstanding) as amount,
           -- นับเฉพาะใบที่ก่อหนี้ ใบลดหนี้ไม่ใช่ "ใบที่เกินกำหนด" ถึงวันที่จะผ่านมาแล้ว
           -- แต่ยอดเงินยังหักกลบตามปกติ ให้ตรงกับช่องอายุหนี้ซึ่งหักกลบอยู่แล้ว
           count(*) filter (where sign = 1 and coalesce(due_date, doc_date) < p_as_of) as overdue_count,
           coalesce(sum(sign * outstanding)
                    filter (where coalesce(due_date, doc_date) < p_as_of), 0) as overdue_amount,
           count(*) filter (where sign = 1
                              and coalesce(due_date, doc_date) between p_as_of and p_as_of + 7)
             as due_soon_count,
           coalesce(sum(sign * outstanding)
                    filter (where coalesce(due_date, doc_date) between p_as_of and p_as_of + 7), 0)
             as due_soon_amount,
           count(*) as doc_count
    from open_docs group by side
  ),
  -- ช่วงอายุหนี้ทั้งสองฝั่ง ใช้เกณฑ์เดียวกับ rpt_aging เพื่อให้ตัวเลขตรงกัน
  aging as (
    select side,
           coalesce(sum(sign * outstanding) filter (
             where coalesce(due_date, doc_date) >= p_as_of), 0) as current,
           coalesce(sum(sign * outstanding) filter (
             where p_as_of - coalesce(due_date, doc_date) between 1 and 30), 0) as d1_30,
           coalesce(sum(sign * outstanding) filter (
             where p_as_of - coalesce(due_date, doc_date) between 31 and 60), 0) as d31_60,
           coalesce(sum(sign * outstanding) filter (
             where p_as_of - coalesce(due_date, doc_date) between 61 and 90), 0) as d61_90,
           coalesce(sum(sign * outstanding) filter (
             where p_as_of - coalesce(due_date, doc_date) > 90), 0) as d90_plus
    from open_docs group by side
  ),
  -- มัดจำที่รับมา/จ่ายไปแล้วยังไม่ได้ตัดกับใบไหน
  deposits as (
    select public.doc_side(d.kind::text) as side,
           coalesce(sum(d.net_payable - d.paid_amount), 0) as remaining
    from public.documents d
    join c on c.id = d.contact_id and c.company_id = d.company_id
    where d.kind::text in ('deposit_receipt','deposit_payment')
      and d.status::text in ('approved','partial')
      and d.accounting_doc_id is null
      and d.doc_date <= p_as_of
    group by 1
  ),
  -- ประวัติการค้ารวม ใช้ตอบว่า "คบกันมานานแค่ไหน ปีนี้ซื้อไปเท่าไหร่"
  lifetime as (
    select
      coalesce(sum(d.grand_total) filter (where public.doc_side(d.kind::text) = 'ar'), 0) as sales_total,
      coalesce(sum(d.grand_total) filter (where public.doc_side(d.kind::text) = 'ap'), 0) as purchase_total,
      coalesce(sum(d.grand_total) filter (
        where public.doc_side(d.kind::text) = 'ar'
          and d.doc_date >= date_trunc('year', p_as_of)::date), 0) as sales_ytd,
      coalesce(sum(d.grand_total) filter (
        where public.doc_side(d.kind::text) = 'ap'
          and d.doc_date >= date_trunc('year', p_as_of)::date), 0) as purchase_ytd,
      min(d.doc_date) as first_doc_date,
      max(d.doc_date) as last_doc_date,
      count(*) as doc_count
    from public.documents d
    join c on c.id = d.contact_id and c.company_id = d.company_id
    where d.accounting_doc_id is null
      and d.status::text not in ('draft','void')
      and public.doc_side(d.kind::text) <> 'none'
      and d.doc_date <= p_as_of
  ),
  -- การชำระครั้งล่าสุด บอกได้ว่าเงียบไปนานหรือยัง
  last_paid as (
    select max(p.doc_date) filter (where p.direction = 'receive') as last_receive,
           max(p.doc_date) filter (where p.direction = 'pay') as last_pay
    from public.payments p
    join c on c.id = p.contact_id and c.company_id = p.company_id
    where p.status::text <> 'void' and p.doc_date <= p_as_of
  )
  select case when (select count(*) from c) = 0 then null else json_build_object(
    'contact', (select json_build_object(
        'id', id, 'code', code, 'name', name, 'name_en', name_en,
        'kind', kind, 'tax_id', tax_id, 'phone', phone, 'email', email,
        'contact_person', contact_person, 'credit_days', credit_days,
        'credit_limit', credit_limit, 'is_active', is_active,
        'address', address, 'district', district, 'province', province, 'postcode', postcode
      ) from c),
    'as_of', p_as_of,
    'ar', json_build_object(
      'outstanding', coalesce((select amount from side_total where side = 'ar'), 0),
      'doc_count', coalesce((select doc_count from side_total where side = 'ar'), 0),
      'overdue_count', coalesce((select overdue_count from side_total where side = 'ar'), 0),
      'overdue_amount', coalesce((select overdue_amount from side_total where side = 'ar'), 0),
      'due_soon_count', coalesce((select due_soon_count from side_total where side = 'ar'), 0),
      'due_soon_amount', coalesce((select due_soon_amount from side_total where side = 'ar'), 0),
      'deposit', coalesce((select remaining from deposits where side = 'ar'), 0),
      'aging', coalesce((select row_to_json(a) from aging a where a.side = 'ar'), '{}'::json)
    ),
    'ap', json_build_object(
      'outstanding', coalesce((select amount from side_total where side = 'ap'), 0),
      'doc_count', coalesce((select doc_count from side_total where side = 'ap'), 0),
      'overdue_count', coalesce((select overdue_count from side_total where side = 'ap'), 0),
      'overdue_amount', coalesce((select overdue_amount from side_total where side = 'ap'), 0),
      'due_soon_count', coalesce((select due_soon_count from side_total where side = 'ap'), 0),
      'due_soon_amount', coalesce((select due_soon_amount from side_total where side = 'ap'), 0),
      'deposit', coalesce((select remaining from deposits where side = 'ap'), 0),
      'aging', coalesce((select row_to_json(a) from aging a where a.side = 'ap'), '{}'::json)
    ),
    -- ยอดสุทธิเป็นข้อมูลประกอบเท่านั้น ไม่ใช่การหักกลบทางบัญชี
    -- บวก = เขาติดเรามากกว่า / ลบ = เราติดเขามากกว่า
    'net', coalesce((select amount from side_total where side = 'ar'), 0)
         - coalesce((select amount from side_total where side = 'ap'), 0),
    'lifetime', (select row_to_json(l) from lifetime l),
    'last_receive', (select last_receive from last_paid),
    'last_pay', (select last_pay from last_paid)
  ) end;
$cs$;

grant execute on function public.rpt_contact_summary(uuid, date) to authenticated;

comment on function public.rpt_contact_summary is
  'สรุปหัวแฟ้มผู้ติดต่อ ยอดคงค้างสองฝั่งแยกกัน อายุหนี้ มัดจำ และประวัติการค้า';

-- ------------------------------------------------------------------------
-- 2) บัญชีเดินสะพัดรายคู่ค้า พร้อมยอดยกมาและยอดคงเหลือสะสม
--
--  ตัวกรองส่งมาเป็น jsonb ก้อนเดียว เพราะหน้าจอมีตัวกรองสิบกว่าตัว
--  ถ้าทำเป็นพารามิเตอร์แยกจะต้องแก้ลายเซ็นฟังก์ชันทุกครั้งที่เพิ่มตัวกรอง
--  ซึ่งใน PostgreSQL แปลว่าต้อง drop ก่อน create ทำให้ migration เปราะ
--
--  คีย์ที่รับ (ไม่ใส่ = ไม่กรอง) :
--    kinds     text[]   ชนิดเอกสาร
--    status    text     open | closed | overdue
--    min, max  numeric  ช่วงจำนวนเงิน
--    bucket    text     current | d1_30 | d31_60 | d61_90 | d90_plus
--    currency  text     สกุลเงินต่างประเทศบนเอกสาร
--    q         text     ค้นเลขที่เอกสาร อ้างอิง หรือหมายเหตุ
--    with_wht  bool     เฉพาะที่มีภาษีหัก ณ ที่จ่าย
--    show_none bool     รวมเอกสารที่ยังไม่เป็นหนี้ด้วย (ค่าตั้งต้นรวม)
-- ------------------------------------------------------------------------
create or replace function public.rpt_contact_statement(
  p_contact uuid,
  p_from date,
  p_to date,
  p_side text default 'both',
  p_filters jsonb default '{}'::jsonb
)
returns json
language sql
stable
security invoker
set search_path = public, app
as $st$
  with c as (
    select * from public.contacts where id = p_contact
  ),
  f as (
    select
      case when jsonb_typeof(p_filters->'kinds') = 'array'
           then array(select jsonb_array_elements_text(p_filters->'kinds')) end as kinds,
      nullif(p_filters->>'status','')   as status,
      (p_filters->>'min')::numeric      as min_amount,
      (p_filters->>'max')::numeric      as max_amount,
      nullif(p_filters->>'bucket','')   as bucket,
      nullif(p_filters->>'currency','') as currency,
      nullif(p_filters->>'q','')        as q,
      coalesce((p_filters->>'with_wht')::boolean, false)  as with_wht,
      coalesce((p_filters->>'show_none')::boolean, true)  as show_none
  ),
  -- เอกสารทั้งหมดของคู่ค้ารายนี้ ยังไม่ตัดช่วงวันที่ เพราะต้องใช้คิดยอดยกมา
  base_doc as (
    select d.id, d.kind::text as kind, d.doc_number, d.doc_date, d.due_date,
           d.status::text as status, d.reference, d.notes,
           d.grand_total, d.net_payable, d.paid_amount, d.wht_amount,
           d.fx_currency, d.fx_rate, d.fx_grand_total,
           public.doc_side(d.kind::text) as side,
           public.doc_sign(d.kind::text) as sign,
           (d.net_payable - d.paid_amount) as outstanding
    from public.documents d
    join c on c.id = d.contact_id and c.company_id = d.company_id
    where d.accounting_doc_id is null
      and d.status::text <> 'void'
  ),
  -- ยอดยกมา : ผลรวมของหนี้ที่เกิดก่อนช่วง หักด้วยเงินที่ชำระก่อนช่วง
  opening as (
    select
      coalesce((select sum(sign * net_payable) from base_doc
                where side = 'ar' and status <> 'draft' and doc_date < p_from), 0)
      - coalesce((select sum(p.amount + p.wht_amount) from public.payments p
                  join c on c.id = p.contact_id and c.company_id = p.company_id
                  where p.direction = 'receive' and p.status::text <> 'void'
                    and p.doc_date < p_from), 0) as ar,
      coalesce((select sum(sign * net_payable) from base_doc
                where side = 'ap' and status <> 'draft' and doc_date < p_from), 0)
      - coalesce((select sum(p.amount + p.wht_amount) from public.payments p
                  join c on c.id = p.contact_id and c.company_id = p.company_id
                  where p.direction = 'pay' and p.status::text <> 'void'
                    and p.doc_date < p_from), 0) as ap
  ),
  -- แถวเอกสารในช่วง
  doc_rows as (
    select
      b.doc_date as row_date, 'document' as row_type, b.id as row_id,
      b.kind, b.doc_number, b.due_date, b.status, b.side,
      b.reference, b.notes,
      b.grand_total, b.net_payable, b.paid_amount, b.outstanding, b.wht_amount,
      b.fx_currency, b.fx_rate, b.fx_grand_total,
      -- เอกสารที่ยังไม่เป็นหนี้ไม่คิดยอด แต่ยังโชว์ในไทม์ไลน์
      (b.side <> 'none' and b.status <> 'draft') as is_ledger,
      case when b.side <> 'none' and b.status <> 'draft'
           then b.sign * b.net_payable else 0 end as delta,
      case
        when coalesce(b.due_date, b.doc_date) >= p_to then 'current'
        when p_to - coalesce(b.due_date, b.doc_date) <= 30 then 'd1_30'
        when p_to - coalesce(b.due_date, b.doc_date) <= 60 then 'd31_60'
        when p_to - coalesce(b.due_date, b.doc_date) <= 90 then 'd61_90'
        else 'd90_plus' end as bucket
    from base_doc b, f
    where b.doc_date between p_from and p_to
      and (p_side = 'both' or b.side = p_side or b.side = 'none')
      and (f.show_none or b.side <> 'none')
      and (f.kinds is null or b.kind = any(f.kinds))
      and (f.currency is null or b.fx_currency = f.currency)
      and (not f.with_wht or b.wht_amount > 0)
      and (f.min_amount is null or abs(b.grand_total) >= f.min_amount)
      and (f.max_amount is null or abs(b.grand_total) <= f.max_amount)
      and (f.q is null or b.doc_number ilike '%'||f.q||'%'
           or coalesce(b.reference,'') ilike '%'||f.q||'%'
           or coalesce(b.notes,'') ilike '%'||f.q||'%')
      and (f.status is null
           or (f.status = 'open'    and b.outstanding <> 0 and b.status in ('approved','partial','overdue'))
           or (f.status = 'closed'  and b.outstanding = 0)
           or (f.status = 'overdue' and b.outstanding <> 0
               and coalesce(b.due_date, b.doc_date) < p_to))
  ),
  -- แถวการชำระเงินในช่วง
  pay_rows as (
    select
      p.doc_date as row_date, 'payment' as row_type, p.id as row_id,
      case when p.direction = 'receive' then 'receive' else 'pay' end as kind,
      p.doc_number, null::date as due_date, p.status::text as status,
      case when p.direction = 'receive' then 'ar' else 'ap' end as side,
      null::text as reference, p.note as notes,
      (p.amount + p.wht_amount) as grand_total,
      (p.amount + p.wht_amount) as net_payable,
      0::numeric as paid_amount, 0::numeric as outstanding, p.wht_amount,
      null::char(3) as fx_currency, null::numeric as fx_rate, null::numeric as fx_grand_total,
      true as is_ledger,
      -(p.amount + p.wht_amount) as delta,
      null::text as bucket
    from public.payments p
    join c on c.id = p.contact_id and c.company_id = p.company_id, f
    where p.doc_date between p_from and p_to
      and p.status::text <> 'void'
      and (p_side = 'both'
           or (p_side = 'ar' and p.direction = 'receive')
           or (p_side = 'ap' and p.direction = 'pay'))
      -- ตัวกรองฝั่งเอกสารที่ไม่เกี่ยวกับการชำระ ให้ซ่อนแถวชำระไปเลย
      -- ไม่งั้นผู้ใช้จะเห็นเงินรับโดยไม่เห็นใบที่มันไปตัด แล้วยอดจะดูไม่รู้เรื่อง
      and f.kinds is null and f.currency is null and not f.with_wht
      and f.status is null and f.bucket is null
      and (f.min_amount is null or (p.amount + p.wht_amount) >= f.min_amount)
      and (f.max_amount is null or (p.amount + p.wht_amount) <= f.max_amount)
      and (f.q is null or p.doc_number ilike '%'||f.q||'%'
           or coalesce(p.note,'') ilike '%'||f.q||'%')
  ),
  merged as (
    select * from doc_rows
    where (select bucket from f) is null or bucket = (select bucket from f)
    union all
    select * from pay_rows
  ),
  -- ยอดคงเหลือสะสมคิดแยกฝั่ง เพราะสองฝั่งไม่หักกลบกัน
  running as (
    select m.*,
           (case when m.side = 'ar' then (select ar from opening)
                 when m.side = 'ap' then (select ap from opening)
                 else 0 end)
           + sum(case when m.side = 'none' then 0 else m.delta end)
             over (partition by m.side order by m.row_date, m.row_type desc, m.doc_number
                   rows between unbounded preceding and current row) as balance
    from merged m
  )
  select case when (select count(*) from c) = 0 then null else json_build_object(
    'contact_id', p_contact,
    'from', p_from, 'to', p_to, 'side', p_side,
    'opening', (select row_to_json(o) from opening o),
    'count', (select count(*) from running),
    'totals', json_build_object(
      'ar_increase', coalesce((select sum(delta) from running where side='ar' and delta > 0), 0),
      'ar_decrease', coalesce((select -sum(delta) from running where side='ar' and delta < 0), 0),
      'ap_increase', coalesce((select sum(delta) from running where side='ap' and delta > 0), 0),
      'ap_decrease', coalesce((select -sum(delta) from running where side='ap' and delta < 0), 0)
    ),
    'closing', json_build_object(
      'ar', coalesce((select balance from running where side='ar'
                      order by row_date desc, row_type, doc_number desc limit 1),
                     (select ar from opening)),
      'ap', coalesce((select balance from running where side='ap'
                      order by row_date desc, row_type, doc_number desc limit 1),
                     (select ap from opening))
    ),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', row_date, 'type', row_type, 'id', row_id, 'kind', kind,
        'number', doc_number, 'due_date', due_date, 'status', status,
        'side', side, 'reference', reference, 'notes', notes,
        'total', grand_total, 'net', net_payable, 'paid', paid_amount,
        'outstanding', outstanding, 'wht', wht_amount,
        'fx_currency', fx_currency, 'fx_rate', fx_rate, 'fx_total', fx_grand_total,
        'is_ledger', is_ledger, 'delta', delta, 'bucket', bucket, 'balance', balance
      ) order by row_date, row_type desc, doc_number)
      from running), '[]'::jsonb)
  ) end;
$st$;

grant execute on function public.rpt_contact_statement(uuid, date, date, text, jsonb) to authenticated;

comment on function public.rpt_contact_statement is
  'บัญชีเดินสะพัดรายคู่ค้า พร้อมยอดยกมา ยอดคงเหลือสะสมแยกฝั่ง และตัวกรองละเอียด';

-- ------------------------------------------------------------------------
-- 3) เงินที่รับ/จ่ายไปตัดใบไหนบ้าง
--
--  เงินหนึ่งก้อนตัดได้หลายใบ และหนึ่งใบถูกตัดได้หลายครั้ง
--  ตารางเดินบัญชีจึงตอบไม่ได้ว่า "เงินก้อนนี้ไปไหน" ต้องกางจากการตัดชำระ
-- ------------------------------------------------------------------------
create or replace function public.rpt_contact_payments(
  p_contact uuid, p_from date, p_to date
)
returns json
language sql
stable
security invoker
set search_path = public, app
as $cp$
  select coalesce(jsonb_agg(x order by (x->>'doc_date') desc, x->>'doc_number'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', p.id, 'direction', p.direction, 'doc_number', p.doc_number,
      'doc_date', p.doc_date, 'amount', p.amount, 'wht', p.wht_amount,
      'fee', p.fee_amount, 'note', p.note, 'status', p.status,
      'channel', ch.name,
      'allocations', coalesce((
        select jsonb_agg(jsonb_build_object(
          'document_id', d.id, 'doc_number', d.doc_number,
          'kind', d.kind::text, 'doc_date', d.doc_date, 'amount', pa.amount
        ) order by d.doc_date, d.doc_number)
        from public.payment_allocations pa
        join public.documents d on d.id = pa.document_id
        where pa.payment_id = p.id), '[]'::jsonb),
      -- ส่วนที่ยังไม่ได้ตัดกับใบไหน คือเงินรับล่วงหน้าที่ยังลอยอยู่
      'unallocated', p.amount - coalesce((
        select sum(pa.amount) from public.payment_allocations pa
        where pa.payment_id = p.id), 0)
    ) as x
    from public.payments p
    join public.contacts c on c.id = p.contact_id and c.company_id = p.company_id
    left join public.financial_channels ch on ch.id = p.channel_id
    where p.contact_id = p_contact
      and p.status::text <> 'void'
      and p.doc_date between p_from and p_to
  ) s;
$cp$;

grant execute on function public.rpt_contact_payments(uuid, date, date) to authenticated;

comment on function public.rpt_contact_payments is
  'การรับจ่ายเงินของคู่ค้า พร้อมรายละเอียดว่าไปตัดใบไหนบ้างและเหลือลอยเท่าไหร่';
