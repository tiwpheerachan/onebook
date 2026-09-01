-- =====================================================================
-- 0067 : แก้ตัวเลขบนแดชบอร์ด และเพิ่มยอดงวดก่อนไว้เทียบ
--
-- ---------------------------------------------------------------------
--  เรื่องที่ 1 : แดชบอร์ดนับเอกสารที่แปลงต่อกันซ้ำ
--
--  0059 ปิดช่องลงบัญชีซ้ำ และแก้ rpt_aging, rpt_open_documents,
--  rpt_subledger_reconcile ให้กรอง accounting_doc_id แล้ว
--  แต่ rpt_dashboard ตกหล่นไป จึงยังนับซ้ำอยู่
--
--  ภาษีขายหนักที่สุด เพราะเดิมรวมทั้ง invoice, tax_invoice และ receipt
--  การขายหนึ่งครั้งที่แปลงครบสายจึงนับภาษีสามรอบ ซึ่งเป็นปัญหาคนละตัว
--  กับการลงบัญชีซ้ำ — ต่อให้ลงบัญชีถูกแล้ว ตัวเลขบนแดชบอร์ดก็ยังผิด
--
--  แก้สองอย่าง
--    - กรอง accounting_doc_id is null ทุกจุดที่นับจากตารางเอกสาร
--    - ภาษีขายนับเฉพาะใบที่ถือรายการบัญชีของสายนั้น ไม่ใช่ทุกใบในสาย
--
-- ---------------------------------------------------------------------
--  เรื่องที่ 2 : ไม่มีอะไรให้เทียบ
--
--  แดชบอร์ดโชว์ตัวเลขงวดปัจจุบันอย่างเดียว ผู้ใช้จึงไม่รู้ว่าดีขึ้นหรือแย่ลง
--  เพิ่มยอดของงวดก่อนหน้าที่ยาวเท่ากันมาให้ หน้าจอจะได้แสดงทิศทางได้
-- =====================================================================

create or replace function public.rpt_dashboard(p_company uuid, p_from date, p_to date)
returns json
language sql
stable
security definer
set search_path = public, app
as $$
  with allowed as (
    -- rpt_dashboard เป็น security definer จึงข้าม RLS ทั้งหมด ต้องตรวจสิทธิ์เอง
    -- ลำดับพารามิเตอร์คือ (company, uid) สลับแล้วจะได้ false เสมอ
    select app.can_access_company(p_company, auth.uid()) as ok
  ),
  span as (
    select p_from as d_from, p_to as d_to,
           -- งวดก่อนหน้าที่ยาวเท่ากัน ต่อท้ายกันพอดีไม่ทับซ้อน
           (p_from - ((p_to - p_from) + 1))::date as p_from_prev,
           (p_from - 1)::date as p_to_prev
  ),
  pl as (
    select
      coalesce(sum(case when a.type in ('revenue','other_income')
                        and je.entry_date between s.d_from and s.d_to
                   then jl.credit - jl.debit end), 0) as revenue,
      coalesce(sum(case when a.type in ('cost_of_sales','expense','other_expense','tax')
                        and je.entry_date between s.d_from and s.d_to
                   then jl.debit - jl.credit end), 0) as expense,
      coalesce(sum(case when a.type in ('revenue','other_income')
                        and je.entry_date between s.p_from_prev and s.p_to_prev
                   then jl.credit - jl.debit end), 0) as revenue_prev,
      coalesce(sum(case when a.type in ('cost_of_sales','expense','other_expense','tax')
                        and je.entry_date between s.p_from_prev and s.p_to_prev
                   then jl.debit - jl.credit end), 0) as expense_prev
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.entry_id and je.status = 'posted'
    join public.accounts a on a.id = jl.account_id
    cross join span s
    cross join allowed
    where allowed.ok
      and jl.company_id = p_company
      and je.entry_date between s.p_from_prev and s.d_to
  )
  select json_build_object(
    'revenue', round((select revenue from pl), 2),
    'expense', round((select expense from pl), 2),
    'revenue_prev', round((select revenue_prev from pl), 2),
    'expense_prev', round((select expense_prev from pl), 2),

    -- ลูกหนี้และเจ้าหนี้ : ไม่นับใบที่เป็นรายการซ้ำของใบต้นทาง
    'ar_outstanding', coalesce((select sum(net_payable - paid_amount) from public.documents
       where (select ok from allowed) and company_id = p_company and accounting_doc_id is null
         and kind::text in ('invoice','tax_invoice','debit_note')
         and status::text in ('approved','partial','overdue')), 0),
    'ap_outstanding', coalesce((select sum(net_payable - paid_amount) from public.documents
       where (select ok from allowed) and company_id = p_company and accounting_doc_id is null
         and kind::text in ('bill','expense','purchase_debit_note')
         and status::text in ('approved','partial','overdue')), 0),

    'cash_balance', coalesce((select sum(jl.debit - jl.credit) from public.journal_lines jl
       join public.journal_entries je on je.id = jl.entry_id and je.status = 'posted'
       join public.accounts a on a.id = jl.account_id
       where (select ok from allowed)
         and jl.company_id = p_company and a.system_key in ('cash','bank')
         and je.entry_date <= p_to), 0),

    -- ภาษีขาย : นับ "ใบที่ถือรายการบัญชี" ของแต่ละสาย ไม่ใช่คัดตามชนิดเอกสาร
    --
    -- ตอนแรกผมตัดใบแจ้งหนี้ออกเพราะไม่ใช่ใบกำกับภาษี แต่ผิด —
    -- ตามแบบของ 0059 ใบแรกของสายเป็นตัวลงบัญชี ถ้าสายนั้นเริ่มที่ใบแจ้งหนี้
    -- ภาษีขายก็ถูกลงจากใบแจ้งหนี้ การตัดออกจึงทำให้ภาษีหายไปทั้งก้อน
    -- เกณฑ์ที่ถูกคือ "ใบที่ลงบัญชีจริง" ซึ่งคือ accounting_doc_id is null
    'vat_payable',
      coalesce((select sum(vat_amount) from public.documents
        where (select ok from allowed) and company_id = p_company and status::text <> 'void'
          and accounting_doc_id is null
          and kind::text in ('invoice','tax_invoice','receipt')
          and doc_date between p_from and p_to), 0)
      - coalesce((select sum(vat_amount) from public.documents
        where (select ok from allowed) and company_id = p_company and status::text <> 'void'
          and accounting_doc_id is null
          and kind::text in ('bill','expense')
          and doc_date between p_from and p_to), 0),

    'doc_draft', coalesce((select count(*) from public.documents
       where (select ok from allowed) and company_id = p_company and status::text = 'draft'), 0),
    'doc_overdue', coalesce((select count(*) from public.documents
       where (select ok from allowed) and company_id = p_company and accounting_doc_id is null
         and status::text in ('approved','partial')
         and due_date < current_date
         and kind::text in ('invoice','tax_invoice')), 0),
    'awaiting_approval', coalesce((select count(*) from public.documents
       where (select ok from allowed) and company_id = p_company and status::text = 'awaiting_approval'), 0),
    'locked_through', case when (select ok from allowed) then (select app.locked_through(p_company)) end
  );
$$;

comment on function public.rpt_dashboard is
  'ตัวเลขหน้าแรก — ไม่นับเอกสารที่เป็นรายการซ้ำของใบต้นทาง และมียอดงวดก่อนไว้เทียบทิศทาง';
