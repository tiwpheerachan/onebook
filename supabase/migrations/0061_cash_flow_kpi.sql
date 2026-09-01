-- =====================================================================
-- 0061 : งบกระแสเงินสด + ตัวชี้วัดสำหรับผู้บริหาร
--
--  งบการเงินหลักมีสามงบ ระบบมีอยู่สองงบคือ งบแสดงฐานะการเงินกับ
--  งบกำไรขาดทุน ขาดงบกระแสเงินสด ซึ่งเป็นงบที่บอกว่าเงินสดหายไปไหน
--  ทั้งที่กำไรยังเป็นบวก
--
-- ---------------------------------------------------------------------
--  วิธีคำนวณ
--
--  ไม่ใช้วิธีทางอ้อม (กำไรสุทธิ + รายการปรับปรุง) เพราะต้องเดาว่ารายการ
--  ไหนเป็นรายการที่ไม่ใช่เงินสด ซึ่งเดาผิดแล้วงบไม่ลง
--
--  ใช้วิธีอ่านจากสมุดรายวันตรง ๆ แทน :
--  หยิบเฉพาะใบสำคัญที่มีบรรทัดแตะบัญชีเงินสด แล้วดู "บรรทัดอีกฝั่ง"
--  ว่าเป็นบัญชีอะไร นั่นคือที่มาหรือที่ไปของเงินก้อนนั้น
--
--  ใช้ได้เพราะทุกใบสำคัญเดบิตเท่าเครดิตเสมอ ดังนั้น
--      ผลรวม (เครดิต − เดบิต) ของบรรทัดที่ไม่ใช่เงินสด
--    = ผลรวม (เดบิต − เครดิต) ของบรรทัดเงินสด
--    = เงินสดที่เปลี่ยนไปจริง
--
--  ผลที่ได้จึงกระทบยอดกับเงินสดต้นงวด-ปลายงวดได้เสมอ ไม่ต้องมีรายการปรับ
--  และโอนเงินระหว่างบัญชีเงินสดด้วยกันจะหักล้างกันเองโดยอัตโนมัติ
--
-- ---------------------------------------------------------------------
--  การจัดกลุ่มกิจกรรม
--
--  ลงทุน   : บัญชีที่ผูกกับทะเบียนสินทรัพย์ถาวรจริง (fixed_assets)
--            ใช้ข้อมูลจริง ไม่เดาจากรหัสบัญชีที่ขึ้นต้นด้วย 12
--            เพราะผังบัญชีที่ผู้ใช้เพิ่มเองไม่จำเป็นต้องเรียงตามมาตรฐาน
--  จัดหาเงิน : ส่วนของผู้ถือหุ้น และหนี้สินไม่หมุนเวียน (แม่คือ 2200)
--  ดำเนินงาน : ที่เหลือทั้งหมด
-- =====================================================================

-- ------------------------------------------------------------------------
-- 1) บัญชีที่ถือว่าเป็นเงินสด
--
--  รวมบัญชีที่ช่องทางการเงินผูกไว้ด้วย เพราะผู้ใช้สร้างบัญชีธนาคาร
--  เพิ่มเองได้โดยไม่มี system_key
--
--  ไม่รวมบัญชีพักเช็ค เพราะเช็คที่ยังไม่ขึ้นเงินยังไม่ใช่เงินสด
-- ------------------------------------------------------------------------
create or replace function app.cash_account_ids(p_company uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public, app
as $fn$
  select coalesce(array_agg(distinct id), '{}'::uuid[])
  from (
    select a.id from public.accounts a
    where a.company_id = p_company and a.system_key in ('cash','bank')
    union
    select fc.account_id from public.financial_channels fc
    where fc.company_id = p_company and fc.account_id is not null
      and fc.kind::text <> 'cheque'
  ) t;
$fn$;

comment on function app.cash_account_ids is
  'บัญชีที่นับเป็นเงินสดในงบกระแสเงินสด — เงินสด เงินฝาก และบัญชีที่ช่องทางการเงินผูกไว้ ไม่รวมบัญชีพักเช็ค';

-- ------------------------------------------------------------------------
-- 2) งบกระแสเงินสด
--
--  security invoker เพื่อให้ RLS กรองสิทธิ์เอง ตามกติกาของโครงการ
-- ------------------------------------------------------------------------
create or replace function public.rpt_cash_flow(
  p_company uuid, p_from date, p_to date
)
returns json
language sql
stable
security invoker
set search_path = public, app
as $cf$
  with cash as (
    select app.cash_account_ids(p_company) as ids
  ),
  -- เงินสดต้นงวดและปลายงวด อ่านจากบัญชีเงินสดตรง ๆ
  opening as (
    select coalesce(sum(jl.debit - jl.credit), 0) as amt
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.entry_id and je.status = 'posted'
    cross join cash
    where jl.company_id = p_company
      and jl.account_id = any (cash.ids)
      and je.entry_date < p_from
  ),
  closing as (
    select coalesce(sum(jl.debit - jl.credit), 0) as amt
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.entry_id and je.status = 'posted'
    cross join cash
    where jl.company_id = p_company
      and jl.account_id = any (cash.ids)
      and je.entry_date <= p_to
  ),
  -- ใบสำคัญในงวดที่มีบรรทัดแตะเงินสด
  cash_entries as (
    select distinct je.id
    from public.journal_entries je
    join public.journal_lines jl on jl.entry_id = je.id
    cross join cash
    where je.company_id = p_company
      and je.status = 'posted'
      and je.entry_date between p_from and p_to
      and jl.account_id = any (cash.ids)
  ),
  -- บัญชีที่ถือเป็นกิจกรรมลงทุน
  --
  --  สองทาง เพราะทางเดียวไม่พอ
  --    1) บัญชีที่ผูกกับทะเบียนสินทรัพย์ถาวรจริง — แม่นที่สุด
  --    2) บัญชีที่อยู่ใต้ "สินทรัพย์ไม่หมุนเวียน" ในผังบัญชี — เผื่อกรณี
  --       ซื้อสินทรัพย์ด้วยรายการรายวันโดยยังไม่ได้ลงทะเบียน ซึ่งเกิดขึ้นจริง
  --       ถ้าใช้แต่ทางแรก การซื้อรถจะไปโผล่ในกิจกรรมดำเนินงาน ซึ่งผิด
  noncurrent as (
    -- ไล่ลงจากหัวข้อ 1200 ไปทุกชั้น เผื่อผังบัญชีที่ซ้อนลึกกว่าสองชั้น
    with recursive tree as (
      select a.id, a.code from public.accounts a
      where a.company_id = p_company and a.code = '1200'
      union all
      select ch.id, ch.code
      from public.accounts ch
      join tree t on ch.parent_code = t.code
      where ch.company_id = p_company
    )
    select coalesce(array_agg(id), '{}'::uuid[]) as ids from tree
  ),
  asset_accounts as (
    select coalesce(array_agg(distinct x), '{}'::uuid[]) as ids
    from (
      select fa.asset_account_id as x from public.fixed_assets fa
      where fa.company_id = p_company and fa.asset_account_id is not null
      union
      select fa.accum_dep_account_id from public.fixed_assets fa
      where fa.company_id = p_company and fa.accum_dep_account_id is not null
      union
      select unnest(nc.ids) from noncurrent nc
    ) t
    where x is not null
  ),
  -- บรรทัดอีกฝั่งของเงินสด = ที่มา/ที่ไปของเงิน
  moves as (
    select a.id as account_id, a.code, a.name_th, a.name_en, a.name_zh, a.type::text as acc_type,
           a.parent_code,
           sum(jl.credit - jl.debit) as amount
    from public.journal_lines jl
    join cash_entries ce on ce.id = jl.entry_id
    join public.accounts a on a.id = jl.account_id
    cross join cash
    where jl.company_id = p_company
      and not (jl.account_id = any (cash.ids))
    group by a.id, a.code, a.name_th, a.name_en, a.name_zh, a.type, a.parent_code
    having sum(jl.credit - jl.debit) <> 0
  ),
  classified as (
    select m.*,
           case
             when m.account_id = any (aa.ids) then 'investing'
             when m.acc_type = 'equity' then 'financing'
             when m.acc_type = 'liability' and m.parent_code = '2200' then 'financing'
             else 'operating'
           end as activity
    from moves m
    cross join asset_accounts aa
  )
  select json_build_object(
    'from', p_from, 'to', p_to,
    'opening', round((select amt from opening), 2),
    'closing', round((select amt from closing), 2),
    'net_change', round((select amt from closing) - (select amt from opening), 2),
    'operating_total', round(coalesce((select sum(amount) from classified where activity='operating'), 0), 2),
    'investing_total', round(coalesce((select sum(amount) from classified where activity='investing'), 0), 2),
    'financing_total', round(coalesce((select sum(amount) from classified where activity='financing'), 0), 2),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'activity', activity,
        'account_id', account_id,
        'code', code,
        'name_th', name_th, 'name_en', name_en, 'name_zh', name_zh,
        'amount', round(amount, 2)
      ) order by activity, code)
      from classified), '[]'::jsonb)
  );
$cf$;

grant execute on function public.rpt_cash_flow(uuid, date, date) to authenticated;

comment on function public.rpt_cash_flow is
  'งบกระแสเงินสดจากสมุดรายวันจริง — ผลรวมสามกิจกรรมเท่ากับเงินสดที่เปลี่ยนไปเสมอ';

-- ------------------------------------------------------------------------
-- 3) ตัวชี้วัดสำหรับผู้บริหาร
--
--  ทุกตัวคำนวณจากตัวเลขในสมุดรายวัน ไม่มีค่าที่กรอกเอง
--  ตัวหารเป็นศูนย์คืน null ไม่ใช่ 0 เพื่อให้หน้าจอแยกออกว่า
--  "คำนวณไม่ได้" กับ "ค่าเป็นศูนย์จริง"
-- ------------------------------------------------------------------------
create or replace function public.rpt_kpi(
  p_company uuid, p_from date, p_to date
)
returns json
language sql
stable
security invoker
set search_path = public, app
as $kpi$
  with days as (select greatest(1, (p_to - p_from) + 1) as n),
  -- ยอดคงเหลือของกลุ่มบัญชีหนึ่ง ณ วันที่กำหนด (ด้านเดบิตเป็นบวก)
  bal as (
    select
      coalesce(sum(case when je.entry_date <  p_from and a.system_key = 'ar' then jl.debit - jl.credit end), 0) as ar_open,
      coalesce(sum(case when je.entry_date <= p_to   and a.system_key = 'ar' then jl.debit - jl.credit end), 0) as ar_close,
      coalesce(sum(case when je.entry_date <  p_from and a.system_key = 'ap' then jl.credit - jl.debit end), 0) as ap_open,
      coalesce(sum(case when je.entry_date <= p_to   and a.system_key = 'ap' then jl.credit - jl.debit end), 0) as ap_close,
      coalesce(sum(case when je.entry_date <  p_from and a.system_key = 'inventory' then jl.debit - jl.credit end), 0) as inv_open,
      coalesce(sum(case when je.entry_date <= p_to   and a.system_key = 'inventory' then jl.debit - jl.credit end), 0) as inv_close
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.entry_id and je.status = 'posted'
    join public.accounts a on a.id = jl.account_id
    where jl.company_id = p_company
      and a.system_key in ('ar','ap','inventory')
      and je.entry_date <= p_to
  ),
  pl as (
    select
      coalesce(sum(case when a.type in ('revenue')        then jl.credit - jl.debit end), 0) as revenue,
      coalesce(sum(case when a.type in ('cost_of_sales')  then jl.debit - jl.credit end), 0) as cogs,
      coalesce(sum(case when a.type in ('expense')        then jl.debit - jl.credit end), 0) as opex,
      coalesce(sum(case when a.type in ('other_income')   then jl.credit - jl.debit end), 0) as other_income,
      coalesce(sum(case when a.type in ('other_expense','tax') then jl.debit - jl.credit end), 0) as other_expense
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.entry_id and je.status = 'posted'
    join public.accounts a on a.id = jl.account_id
    where jl.company_id = p_company
      and je.entry_date between p_from and p_to
  ),
  overdue as (
    select
      coalesce(sum(d.net_payable - d.paid_amount), 0) as total,
      coalesce(sum(case when d.due_date is not null and d.due_date < p_to
                        then d.net_payable - d.paid_amount end), 0) as late
    from public.documents d
    where d.company_id = p_company
      and d.accounting_doc_id is null
      and d.status::text in ('approved','partial','overdue')
      and d.doc_date <= p_to
      and d.kind::text in ('invoice','tax_invoice','debit_note')
  ),
  m as (
    select
      pl.revenue, pl.cogs, pl.opex,
      pl.revenue - pl.cogs as gross_profit,
      pl.revenue - pl.cogs - pl.opex + pl.other_income - pl.other_expense as net_profit,
      (bal.ar_open  + bal.ar_close)  / 2.0 as ar_avg,
      (bal.ap_open  + bal.ap_close)  / 2.0 as ap_avg,
      (bal.inv_open + bal.inv_close) / 2.0 as inv_avg,
      days.n as days,
      overdue.total as ar_total, overdue.late as ar_late
    from pl, bal, days, overdue
  ),
  calc as (
    select m.*,
      case when m.revenue > 0 then round(m.ar_avg  / m.revenue * m.days, 1) end as dso,
      case when m.cogs    > 0 then round(m.ap_avg  / m.cogs    * m.days, 1) end as dpo,
      case when m.cogs    > 0 then round(m.inv_avg / m.cogs    * m.days, 1) end as dio,
      case when m.cogs    > 0 and m.inv_avg > 0 then round(m.cogs / m.inv_avg, 2) end as inv_turnover
    from m
  )
  select json_build_object(
    'from', p_from, 'to', p_to, 'days', days,
    'revenue', round(revenue, 2), 'cogs', round(cogs, 2), 'opex', round(opex, 2),
    'gross_profit', round(gross_profit, 2), 'net_profit', round(net_profit, 2),
    'gross_margin', case when revenue > 0 then round(gross_profit / revenue * 100, 2) end,
    'net_margin',   case when revenue > 0 then round(net_profit   / revenue * 100, 2) end,
    'ar_avg', round(ar_avg, 2), 'ap_avg', round(ap_avg, 2), 'inventory_avg', round(inv_avg, 2),
    'dso', dso, 'dpo', dpo, 'dio', dio,
    'inventory_turnover', inv_turnover,
    -- วงจรเงินสด = เก็บเงินกี่วัน + ของค้างสต๊อกกี่วัน − จ่ายเจ้าหนี้ช้ากี่วัน
    'cash_conversion_cycle', case when dso is not null and dio is not null and dpo is not null
                                  then round(dso + dio - dpo, 1) end,
    'ar_total', round(ar_total, 2), 'ar_overdue', round(ar_late, 2),
    'ar_overdue_pct', case when ar_total > 0 then round(ar_late / ar_total * 100, 2) end
  )
  from calc;
$kpi$;

grant execute on function public.rpt_kpi(uuid, date, date) to authenticated;

comment on function public.rpt_kpi is
  'ตัวชี้วัดผู้บริหาร — อัตรากำไร ระยะเวลาเก็บหนี้/จ่ายหนี้/ขายสินค้า และวงจรเงินสด คำนวณจากสมุดรายวันทั้งหมด';
