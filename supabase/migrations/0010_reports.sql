-- ============================================================================
-- ONEBOOK 0010 : รายงาน - งบทดลอง งบกำไรขาดทุน งบแสดงฐานะการเงิน อายุลูกหนี้/เจ้าหนี้
--                รายงานภาษีซื้อ-ขาย และงบรวมกลุ่มบริษัท
-- ============================================================================

-- ------------------------------------------------------------------ งบทดลอง
create or replace function public.rpt_trial_balance(p_company uuid, p_from date, p_to date)
returns table (
  account_code text, account_name text, account_name_en text, account_type account_type,
  opening_debit numeric, opening_credit numeric,
  period_debit numeric, period_credit numeric,
  closing_debit numeric, closing_credit numeric
) language sql stable security definer set search_path = public, app as $$
  with perm as (select app.has_perm(p_company,'report.trial_balance','view') or app.has_perm(p_company,'report','view') as ok),
  moves as (
    select jl.account_id,
      sum(case when je.entry_date < p_from then jl.debit  else 0 end) as od,
      sum(case when je.entry_date < p_from then jl.credit else 0 end) as oc,
      sum(case when je.entry_date between p_from and p_to then jl.debit  else 0 end) as pd,
      sum(case when je.entry_date between p_from and p_to then jl.credit else 0 end) as pc
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.entry_id
    where jl.company_id = p_company and je.status = 'posted' and je.entry_date <= p_to
    group by jl.account_id
  )
  select a.code, a.name_th, a.name_en, a.type,
    greatest(coalesce(m.od,0)-coalesce(m.oc,0),0), greatest(coalesce(m.oc,0)-coalesce(m.od,0),0),
    coalesce(m.pd,0), coalesce(m.pc,0),
    greatest(coalesce(m.od,0)+coalesce(m.pd,0)-coalesce(m.oc,0)-coalesce(m.pc,0),0),
    greatest(coalesce(m.oc,0)+coalesce(m.pc,0)-coalesce(m.od,0)-coalesce(m.pd,0),0)
  from public.accounts a
  left join moves m on m.account_id = a.id
  cross join perm
  where a.company_id = p_company and not a.is_header and perm.ok
    and (coalesce(m.od,0)+coalesce(m.oc,0)+coalesce(m.pd,0)+coalesce(m.pc,0)) <> 0
  order by a.code;
$$;

-- ------------------------------------------------------- งบกำไรขาดทุน
create or replace function public.rpt_profit_loss(p_company uuid, p_from date, p_to date)
returns table (section text, account_code text, account_name text, amount numeric)
language sql stable security definer set search_path = public, app as $$
  select
    case a.type
      when 'revenue' then '1_revenue'
      when 'other_income' then '2_other_income'
      when 'cost_of_sales' then '3_cost_of_sales'
      when 'expense' then '4_expense'
      when 'other_expense' then '5_other_expense'
      when 'tax' then '6_tax' end as section,
    a.code, a.name_th,
    -- รายได้ = เครดิต-เดบิต, ต้นทุน/ค่าใช้จ่าย = เดบิต-เครดิต
    sum(case when a.type in ('revenue','other_income')
             then jl.credit - jl.debit else jl.debit - jl.credit end)
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.entry_id
  join public.accounts a on a.id = jl.account_id
  where jl.company_id = p_company and je.status = 'posted'
    and je.entry_date between p_from and p_to
    and a.type in ('revenue','other_income','cost_of_sales','expense','other_expense','tax')
    and (app.has_perm(p_company,'report.pl','view') or app.has_perm(p_company,'report','view'))
  group by a.type, a.code, a.name_th
  having sum(jl.debit - jl.credit) <> 0
  order by 1, a.code;
$$;

-- ------------------------------------------------ งบแสดงฐานะการเงิน
create or replace function public.rpt_balance_sheet(p_company uuid, p_as_of date)
returns table (section text, account_code text, account_name text, amount numeric)
language sql stable security definer set search_path = public, app as $$
  with bal as (
    select a.id, a.code, a.name_th, a.type, a.normal_side,
           sum(jl.debit) as d, sum(jl.credit) as c
    from public.accounts a
    join public.journal_lines jl on jl.account_id = a.id
    join public.journal_entries je on je.id = jl.entry_id and je.status = 'posted'
    where a.company_id = p_company and je.entry_date <= p_as_of
    group by a.id, a.code, a.name_th, a.type, a.normal_side
  ),
  pl as (
    -- กำไรสุทธิ = รายได้(เครดิต-เดบิต) - ค่าใช้จ่าย(เดบิต-เครดิต)
    select coalesce(sum(case when type in ('revenue','other_income') then c - d
                             else -(d - c) end), 0) as np
    from bal where type in ('revenue','other_income','cost_of_sales','expense','other_expense','tax')
  )
  select case type when 'asset' then '1_asset' when 'liability' then '2_liability' else '3_equity' end,
         code, name_th,
         case when normal_side = 'D' then d - c else c - d end
  from bal
  where type in ('asset','liability','equity')
    and (app.has_perm(p_company,'report.bs','view') or app.has_perm(p_company,'report','view'))
    and (d - c) <> 0
  union all
  select '3_equity', '3230', 'กำไร(ขาดทุน)สุทธิประจำงวด', np from pl
  where (app.has_perm(p_company,'report.bs','view') or app.has_perm(p_company,'report','view'))
  order by 1, 2;
$$;

-- ------------------------------------------------------- อายุลูกหนี้/เจ้าหนี้
create or replace function public.rpt_aging(p_company uuid, p_as_of date, p_side text default 'ar')
returns table (
  contact_id uuid, contact_name text, doc_number text, doc_date date, due_date date,
  outstanding numeric, bucket text
) language sql stable security definer set search_path = public, app as $$
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
    and d.status in ('approved','partial','overdue')
    and d.doc_date <= p_as_of
    and (d.net_payable - d.paid_amount) > 0.005
    and (case when p_side = 'ar' then d.kind::text in ('invoice','tax_invoice','debit_note')
              else d.kind::text in ('bill','expense','purchase_debit_note') end)
    and (app.has_perm(p_company,'report','view'))
  order by 6 desc;
$$;

-- --------------------------------------------------- รายงานภาษีซื้อ / ภาษีขาย
create or replace function public.rpt_vat(p_company uuid, p_year int, p_month int, p_side text default 'output')
returns table (
  seq bigint, doc_date date, doc_number text, contact_name text, tax_id text,
  branch text, base_amount numeric, vat_amount numeric
) language sql stable security definer set search_path = public, app as $$
  select row_number() over (order by d.doc_date, d.doc_number),
         d.doc_date, d.doc_number,
         coalesce(c.name, d.contact_snapshot->>'name'),
         coalesce(c.tax_id, d.contact_snapshot->>'tax_id'),
         coalesce(c.branch_code, '00000'),
         d.vat_base, d.vat_amount
  from public.documents d
  left join public.contacts c on c.id = d.contact_id
  where d.company_id = p_company
    and d.status <> 'void'
    and extract(year from d.doc_date) = p_year
    and extract(month from d.doc_date) = p_month
    and d.vat_amount <> 0
    and (case when p_side = 'output' then d.kind::text in ('tax_invoice','invoice','receipt','credit_note','debit_note')
              else d.kind::text in ('bill','expense','purchase_credit_note','purchase_debit_note') end)
    and (app.has_perm(p_company,'tax','view') or app.has_perm(p_company,'report','view'))
  order by 2, 3;
$$;

-- ------------------------------------------------------ แดชบอร์ดรายบริษัท
create or replace function public.rpt_dashboard(p_company uuid, p_from date, p_to date)
returns json language sql stable security definer set search_path = public, app as $$
  select json_build_object(
    'revenue', coalesce((select sum(jl.credit - jl.debit) from public.journal_lines jl
       join public.journal_entries je on je.id = jl.entry_id and je.status='posted'
       join public.accounts a on a.id = jl.account_id
       where jl.company_id = p_company and a.type in ('revenue','other_income')
         and je.entry_date between p_from and p_to), 0),
    'expense', coalesce((select sum(jl.debit - jl.credit) from public.journal_lines jl
       join public.journal_entries je on je.id = jl.entry_id and je.status='posted'
       join public.accounts a on a.id = jl.account_id
       where jl.company_id = p_company and a.type in ('cost_of_sales','expense','other_expense','tax')
         and je.entry_date between p_from and p_to), 0),
    'ar_outstanding', coalesce((select sum(net_payable - paid_amount) from public.documents
       where company_id = p_company and kind in ('invoice','tax_invoice','debit_note')
         and status in ('approved','partial','overdue')), 0),
    'ap_outstanding', coalesce((select sum(net_payable - paid_amount) from public.documents
       where company_id = p_company and kind in ('bill','expense','purchase_debit_note')
         and status in ('approved','partial','overdue')), 0),
    'cash_balance', coalesce((select sum(jl.debit - jl.credit) from public.journal_lines jl
       join public.journal_entries je on je.id = jl.entry_id and je.status='posted'
       join public.accounts a on a.id = jl.account_id
       where jl.company_id = p_company and a.system_key in ('cash','bank') and je.entry_date <= p_to), 0),
    'vat_payable', coalesce((select sum(vat_amount) from public.documents
       where company_id = p_company and status <> 'void'
         and kind in ('tax_invoice','invoice','receipt') and doc_date between p_from and p_to), 0)
       - coalesce((select sum(vat_amount) from public.documents
       where company_id = p_company and status <> 'void'
         and kind in ('bill','expense') and doc_date between p_from and p_to), 0),
    'doc_draft', coalesce((select count(*) from public.documents where company_id = p_company and status = 'draft'), 0),
    'doc_overdue', coalesce((select count(*) from public.documents where company_id = p_company
         and status in ('approved','partial') and due_date < current_date
         and kind in ('invoice','tax_invoice')), 0),
    'locked_through', (select app.locked_through(p_company))
  )
  where app.can_access_company(p_company);
$$;

-- -------------------------------------------------- แดชบอร์ดรวมกลุ่มบริษัท
create or replace function public.rpt_group_overview(p_from date, p_to date)
returns table (
  company_id uuid, company_code text, company_name text, is_parent boolean,
  revenue numeric, expense numeric, profit numeric,
  ar_outstanding numeric, ap_outstanding numeric, cash_balance numeric, locked_through date
) language sql stable security definer set search_path = public, app as $$
  select c.id, c.code, c.name_th, c.parent_id is null,
    coalesce((select sum(jl.credit - jl.debit) from public.journal_lines jl
       join public.journal_entries je on je.id = jl.entry_id and je.status='posted'
       join public.accounts a on a.id = jl.account_id
       where jl.company_id = c.id and a.type in ('revenue','other_income')
         and je.entry_date between p_from and p_to), 0),
    coalesce((select sum(jl.debit - jl.credit) from public.journal_lines jl
       join public.journal_entries je on je.id = jl.entry_id and je.status='posted'
       join public.accounts a on a.id = jl.account_id
       where jl.company_id = c.id and a.type in ('cost_of_sales','expense','other_expense','tax')
         and je.entry_date between p_from and p_to), 0),
    coalesce((select sum(case when a.type in ('revenue','other_income') then jl.credit - jl.debit
                              else jl.debit - jl.credit end
              * case when a.type in ('revenue','other_income') then 1 else -1 end)
       from public.journal_lines jl
       join public.journal_entries je on je.id = jl.entry_id and je.status='posted'
       join public.accounts a on a.id = jl.account_id
       where jl.company_id = c.id
         and a.type in ('revenue','other_income','cost_of_sales','expense','other_expense','tax')
         and je.entry_date between p_from and p_to), 0),
    coalesce((select sum(net_payable - paid_amount) from public.documents
       where company_id = c.id and kind in ('invoice','tax_invoice','debit_note')
         and status in ('approved','partial','overdue')), 0),
    coalesce((select sum(net_payable - paid_amount) from public.documents
       where company_id = c.id and kind in ('bill','expense','purchase_debit_note')
         and status in ('approved','partial','overdue')), 0),
    coalesce((select sum(jl.debit - jl.credit) from public.journal_lines jl
       join public.journal_entries je on je.id = jl.entry_id and je.status='posted'
       join public.accounts a on a.id = jl.account_id
       where jl.company_id = c.id and a.system_key in ('cash','bank') and je.entry_date <= p_to), 0),
    app.locked_through(c.id)
  from public.companies c
  where c.is_active and app.can_access_company(c.id)
  order by c.parent_id nulls first, c.code;
$$;

grant execute on function public.rpt_trial_balance(uuid,date,date) to authenticated;
grant execute on function public.rpt_profit_loss(uuid,date,date) to authenticated;
grant execute on function public.rpt_balance_sheet(uuid,date) to authenticated;
grant execute on function public.rpt_aging(uuid,date,text) to authenticated;
grant execute on function public.rpt_vat(uuid,int,int,text) to authenticated;
grant execute on function public.rpt_dashboard(uuid,date,date) to authenticated;
grant execute on function public.rpt_group_overview(date,date) to authenticated;
