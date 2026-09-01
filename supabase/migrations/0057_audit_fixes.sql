-- =====================================================================
-- 0057 : แก้ประเด็นที่พบจากการตรวจโครงสร้างหลังทำ 0044 ถึง 0056
--
--  ตรวจด้วยสคริปต์ที่ไล่ดูโครงสร้างทั้งฐานข้อมูล ไม่ใช่เทสต์รายฟีเจอร์
--  เพราะเทสต์รายฟีเจอร์มองไม่เห็นสิ่งที่ "ลืมทำ" มันเห็นแค่สิ่งที่ทำแล้วผิด
--
--  พบสามเรื่อง เรียงตามความรุนแรง
-- =====================================================================

-- ------------------------------------------------------------------------
-- 1) ช่องโหว่ข้ามบริษัทใน rpt_subledger_reconcile  ← ร้ายแรงที่สุด
--
--  ฟังก์ชันที่เพิ่งเขียนใน 0054 เป็น security definer แต่ไม่มีการตรวจสิทธิ์เลย
--  ผู้ใช้ที่เข้าถึงบริษัทเดียวจึงส่ง company_id ของบริษัทอื่นเข้ามาแล้วอ่านยอด
--  ลูกหนี้-เจ้าหนี้ของบริษัทนั้นได้ ทดสอบยืนยันแล้วว่ารั่วจริง
--
--  ต้นเหตุคือ security definer ข้าม RLS ทั้งหมด ฟังก์ชันจึงต้องตรวจเอง
--  ฟังก์ชันรายงานตัวอื่นในระบบตรวจอยู่แล้ว (has_perm หรือ can_access_company)
--  ตัวนี้หลุดไปตัวเดียวเพราะเขียนใหม่แล้วไม่ได้ลอกแบบเดิมมา
-- ------------------------------------------------------------------------
create or replace function public.rpt_subledger_reconcile(p_company uuid, p_as_of date default current_date)
returns json
language sql
stable
security definer
set search_path = public, app
as $$
  with allowed as (
    -- ต้องเข้าถึงบริษัทนี้ได้ และมีสิทธิ์ดูรายงาน ถ้าไม่ผ่านคืนค่าว่าง
    -- ลำดับพารามิเตอร์คือ (company, uid) ไม่ใช่ (uid, company)
    -- สลับแล้วจะได้ false เสมอ ซึ่งดูเหมือนปลอดภัยแต่ที่จริงคือรายงานใช้ไม่ได้เลย
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
$$;

grant execute on function public.rpt_subledger_reconcile(uuid, date) to authenticated;

comment on function public.rpt_subledger_reconcile is
  'เทียบบัญชีคุมลูกหนี้/เจ้าหนี้กับผลรวมเอกสารค้างชำระ — เป็น security definer จึงต้องตรวจสิทธิ์เองในตัวฟังก์ชัน';

-- ------------------------------------------------------------------------
-- 2) การตัดชำระยังไม่มีประวัติการแก้ไข
--
--  payment_allocations เป็นตารางที่บอกว่าเงินก้อนไหนไปตัดเอกสารใบไหน
--  ซึ่งกระทบยอดลูกหนี้โดยตรง แต่เป็นตารางเดียวในกลุ่มนี้ที่ยังไม่มีทริกเกอร์ audit
--  ตารางอื่นที่กระทบเงินมีครบหมดตั้งแต่ 0040
-- ------------------------------------------------------------------------
drop trigger if exists trg_audit_payment_allocations on public.payment_allocations;
create trigger trg_audit_payment_allocations
  after insert or update or delete on public.payment_allocations
  for each row execute function app.audit_trigger();

-- ------------------------------------------------------------------------
-- 3) คีย์นอกที่ยังไม่มีดัชนีรองรับ
--
--  PostgreSQL ไม่สร้างดัชนีให้คีย์นอกอัตโนมัติ ผลคือ
--    - ลบแถวแม่ทีต้องสแกนตารางลูกทั้งตาราง และล็อกนานกว่าที่ควร
--    - การค้นย้อนจากลูกไปแม่ช้าลงเรื่อย ๆ เมื่อข้อมูลโต
--
--  ใส่เฉพาะคีย์ที่ใช้ค้นจริงหรือมีโอกาสถูกลบเป็นกลุ่ม
--  created_by ไม่ใส่เพราะไม่เคยค้นด้วยและ profiles แทบไม่ถูกลบ
-- ------------------------------------------------------------------------
create index if not exists payment_alloc_payment_idx  on public.payment_allocations (payment_id);
create index if not exists payment_alloc_doc_idx      on public.payment_allocations (document_id);
create index if not exists payment_alloc_company_idx  on public.payment_allocations (company_id);

create index if not exists stock_resv_doc_idx      on public.stock_reservations (document_id)
  where document_id is not null;
create index if not exists stock_resv_product_idx  on public.stock_reservations (product_id);
-- ดัชนีเดิมจาก 0041 มี warehouse_id เป็นคอลัมน์ที่สาม ใช้รองรับคีย์นอกไม่ได้
create index if not exists stock_resv_warehouse_idx on public.stock_reservations (warehouse_id);

create index if not exists deposit_app_company_idx on public.deposit_applications (company_id);
create index if not exists lot_moves_company_idx   on public.lot_movements (company_id);

create index if not exists product_lots_product_idx   on public.product_lots (product_id);
create index if not exists product_lots_warehouse_idx on public.product_lots (warehouse_id);

-- ------------------------------------------------------------------------
-- 4) คอลัมน์ของ 0053 ตกหล่นจาก view ที่ปิดคอลัมน์
--
--  0052 สร้าง documents_masked ใหม่ แล้ว 0053 เพิ่ม sales_rep_id กับ
--  sales_zone_id ให้ documents ทีหลัง จึงไม่มีในตัว view
--
--  เป็นกับดักตัวเดิมที่เจอมาแล้วสองรอบ (0044 กับ 0051)
--  view นี้ระบุคอลัมน์ทีละตัว เพิ่มคอลัมน์ให้ตารางเมื่อไรต้องเติมที่นี่ด้วยเสมอ
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
  d.journal_entry_id, d.warehouse_id,
  d.vat_tax_month, d.vat_deferred, d.vat_note,
  d.tax_invoice_number, d.tax_invoice_date,
  d.sales_rep_id, d.sales_zone_id,
  d.created_by, d.approved_by, d.approved_at,
  d.voided_by, d.voided_at, d.void_reason,
  d.created_at, d.updated_at
from public.documents d;

grant select on public.documents_masked to authenticated;
