-- =====================================================================
-- 0056 : รายงานเทียบสองงวด
--
--  สิ่งแรกที่ผู้สอบบัญชีและผู้บริหารขอคือ "งวดนี้เทียบงวดก่อนเป็นยังไง"
--  ของเดิมออกได้ทีละงวด ต้องพิมพ์สองใบแล้วเอามาวางเทียบเอง
--  ซึ่งนอกจากช้าแล้วยังพลาดง่าย เพราะบัญชีที่มีเฉพาะงวดใดงวดหนึ่งจะหลุด
--
--  จุดที่ต้องระวังและเป็นเหตุผลที่ต้องทำในฐานข้อมูล ไม่ใช่เอาสองผลลัพธ์มา join ฝั่งแอป
--
--  บัญชีที่เคลื่อนไหวเฉพาะงวดหนึ่งต้องไม่หายไป ต้องขึ้นทั้งสองฝั่งโดยอีกฝั่งเป็นศูนย์
--  ถ้า join ฝั่งแอปด้วย inner join บัญชีพวกนี้จะหายเงียบ ๆ และผลรวมจะไม่ตรงกับงบ
--  ซึ่งเป็นความผิดพลาดที่หายากมากเพราะรายงานยังดูสมเหตุสมผล
-- =====================================================================

-- ------------------------------------------------------------------------
-- 1) งบทดลองเทียบสองงวด
--
-- คืนยอดคงเหลือปลายงวดของทั้งสองช่วง พร้อมผลต่างและร้อยละ
-- ใช้เครื่องหมายตามด้านปกติของบัญชี เพื่อให้ผลต่างอ่านได้ตรงความหมาย
-- (สินทรัพย์/ค่าใช้จ่ายเพิ่มขึ้น = บวก, หนี้สิน/ทุน/รายได้เพิ่มขึ้น = บวก)
-- ------------------------------------------------------------------------
create or replace function public.rpt_trial_balance_compare(
  p_company uuid,
  p_from_a  date,
  p_to_a    date,
  p_from_b  date,
  p_to_b    date
)
returns json
language sql
stable
security definer
set search_path = public, app
as $$
  with perm as (
    select app.has_perm(p_company,'report.trial_balance','view')
        or app.has_perm(p_company,'report','view') as ok
  ),
  moves as (
    select jl.account_id,
      -- ยอดคงเหลือสะสมถึงวันสิ้นงวดของแต่ละช่วง
      sum(case when je.entry_date <= p_to_a then jl.debit  else 0 end) as ad,
      sum(case when je.entry_date <= p_to_a then jl.credit else 0 end) as ac,
      sum(case when je.entry_date <= p_to_b then jl.debit  else 0 end) as bd,
      sum(case when je.entry_date <= p_to_b then jl.credit else 0 end) as bc,
      -- ความเคลื่อนไหวเฉพาะภายในงวด ไว้ดูว่าเดือนนี้มีรายการหรือไม่
      sum(case when je.entry_date between p_from_a and p_to_a then jl.debit  else 0 end) as amd,
      sum(case when je.entry_date between p_from_a and p_to_a then jl.credit else 0 end) as amc,
      sum(case when je.entry_date between p_from_b and p_to_b then jl.debit  else 0 end) as bmd,
      sum(case when je.entry_date between p_from_b and p_to_b then jl.credit else 0 end) as bmc
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.entry_id and je.status = 'posted'
    where jl.company_id = p_company
      and je.entry_date <= greatest(p_to_a, p_to_b)
    group by jl.account_id
  ),
  calc as (
    select
      a.code, a.name_th, a.name_en, a.type::text as acc_type, a.normal_side::text as side,
      -- ยอดคงเหลือตามด้านปกติของบัญชี ติดลบได้ถ้าผิดด้าน ซึ่งเป็นสัญญาณที่ต้องเห็น
      -- normal_side เก็บเป็น 'D' / 'C' ไม่ใช่คำเต็ม เทียบผิดแล้วบัญชีเดบิตจะกลายเป็นติดลบทั้งหมด
      case when a.normal_side::text = 'D'
           then coalesce(m.ad,0) - coalesce(m.ac,0)
           else coalesce(m.ac,0) - coalesce(m.ad,0) end as bal_a,
      case when a.normal_side::text = 'D'
           then coalesce(m.bd,0) - coalesce(m.bc,0)
           else coalesce(m.bc,0) - coalesce(m.bd,0) end as bal_b,
      coalesce(m.amd,0) + coalesce(m.amc,0) as moved_a,
      coalesce(m.bmd,0) + coalesce(m.bmc,0) as moved_b
    from public.accounts a
    left join moves m on m.account_id = a.id
    cross join perm
    where a.company_id = p_company and not a.is_header and perm.ok
      -- บัญชีที่ไม่มีความเคลื่อนไหวและไม่มียอดคงเหลือทั้งสองงวด ไม่ต้องแสดง
      and (coalesce(m.ad,0) + coalesce(m.ac,0) + coalesce(m.bd,0) + coalesce(m.bc,0)) <> 0
  )
  select coalesce(jsonb_agg(x order by x->>'code'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'code', c.code, 'name', c.name_th, 'name_en', c.name_en,
      'type', c.acc_type, 'side', c.side,
      'balance_a', round(c.bal_a, 2),
      'balance_b', round(c.bal_b, 2),
      'diff', round(c.bal_b - c.bal_a, 2),
      -- งวดก่อนเป็นศูนย์แล้วคิดร้อยละไม่ได้ ส่ง null ไปให้หน้าจอแสดงขีดแทน 0%
      'diff_pct', case when abs(c.bal_a) < 0.005 then null
                       else round((c.bal_b - c.bal_a) / abs(c.bal_a) * 100, 2) end,
      'moved_a', round(c.moved_a, 2),
      'moved_b', round(c.moved_b, 2)
    ) as x
    from calc c
  ) t;
$$;

grant execute on function public.rpt_trial_balance_compare(uuid, date, date, date, date) to authenticated;

-- ------------------------------------------------------------------------
-- 2) งบกำไรขาดทุนเทียบสองงวด
--
-- ใช้นิยามเดียวกับ rpt_profit_loss ทุกประการ เพื่อให้ยอดตรงกันเสมอ
-- ถ้านิยามสองที่ไม่ตรงกัน ผู้ใช้จะเห็นตัวเลขคนละอย่างจากรายงานสองใบ
-- ------------------------------------------------------------------------
create or replace function public.rpt_profit_loss_compare(
  p_company uuid,
  p_from_a  date,
  p_to_a    date,
  p_from_b  date,
  p_to_b    date
)
returns json
language sql
stable
security definer
set search_path = public, app
as $$
  with perm as (
    select app.has_perm(p_company,'report.pl','view')
        or app.has_perm(p_company,'report','view') as ok
  ),
  lines as (
    select
      a.id, a.code, a.name_th, a.type::text as acc_type,
      sum(case when je.entry_date between p_from_a and p_to_a
               then case when a.type::text in ('revenue','other_income')
                         then jl.credit - jl.debit else jl.debit - jl.credit end
               else 0 end) as amt_a,
      sum(case when je.entry_date between p_from_b and p_to_b
               then case when a.type::text in ('revenue','other_income')
                         then jl.credit - jl.debit else jl.debit - jl.credit end
               else 0 end) as amt_b
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.entry_id and je.status = 'posted'
    join public.accounts a on a.id = jl.account_id
    cross join perm
    where jl.company_id = p_company and perm.ok
      and a.type::text in ('revenue','other_income','cost_of_sales','expense','other_expense','tax')
      and je.entry_date between least(p_from_a, p_from_b) and greatest(p_to_a, p_to_b)
    group by a.id, a.code, a.name_th, a.type
    having sum(case when je.entry_date between least(p_from_a, p_from_b) and greatest(p_to_a, p_to_b)
                    then abs(jl.debit) + abs(jl.credit) else 0 end) <> 0
  )
  select json_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', l.code, 'name', l.name_th, 'type', l.acc_type,
        'section', case l.acc_type
          when 'revenue' then '1_revenue' when 'other_income' then '2_other_income'
          when 'cost_of_sales' then '3_cost_of_sales' when 'expense' then '4_expense'
          when 'other_expense' then '5_other_expense' else '6_tax' end,
        'amount_a', round(l.amt_a, 2),
        'amount_b', round(l.amt_b, 2),
        'diff', round(l.amt_b - l.amt_a, 2),
        'diff_pct', case when abs(l.amt_a) < 0.005 then null
                         else round((l.amt_b - l.amt_a) / abs(l.amt_a) * 100, 2) end
      ) order by l.acc_type, l.code) from lines l), '[]'::jsonb),
    'summary', (
      select jsonb_build_object(
        'revenue_a', round(coalesce(sum(case when acc_type in ('revenue','other_income') then amt_a end), 0), 2),
        'revenue_b', round(coalesce(sum(case when acc_type in ('revenue','other_income') then amt_b end), 0), 2),
        'cost_a',    round(coalesce(sum(case when acc_type = 'cost_of_sales' then amt_a end), 0), 2),
        'cost_b',    round(coalesce(sum(case when acc_type = 'cost_of_sales' then amt_b end), 0), 2),
        'expense_a', round(coalesce(sum(case when acc_type in ('expense','other_expense','tax') then amt_a end), 0), 2),
        'expense_b', round(coalesce(sum(case when acc_type in ('expense','other_expense','tax') then amt_b end), 0), 2)
      ) from lines
    )
  );
$$;

grant execute on function public.rpt_profit_loss_compare(uuid, date, date, date, date) to authenticated;

comment on function public.rpt_trial_balance_compare is
  'งบทดลองเทียบสองงวด — บัญชีที่เคลื่อนไหวเฉพาะงวดใดงวดหนึ่งยังคงแสดง โดยอีกฝั่งเป็นศูนย์';
