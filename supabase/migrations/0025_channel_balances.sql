-- =====================================================================
-- 0025 : ยอดคงเหลือของช่องทางการเงินทุกช่อง
--
--  ยอดยึดจาก "บัญชีแยกประเภท" เป็นหลัก ตัวเลขจึงตรงกับงบแสดงฐานะการเงินเสมอ
--
--  กรณีที่ต้องระวัง : หลายช่องทางผูกบัญชีแยกประเภทเดียวกัน
--  ถ้าเอายอดบัญชีมาใส่ทุกใบแล้วบวกกัน ยอดรวมจะเบิ้ล
--  จึงทำเครื่องหมายไว้ และนับยอดรวมจากบัญชีที่ไม่ซ้ำกันเท่านั้น
-- =====================================================================

alter table public.financial_channels
  add column if not exists bank_account_type text
    check (bank_account_type in ('savings','current','fixed')),
  add column if not exists sort_order int not null default 0;

comment on column public.financial_channels.bank_account_type is
  'ประเภทบัญชีธนาคาร : savings ออมทรัพย์ / current กระแสรายวัน / fixed ฝากประจำ';

create or replace function public.rpt_channel_balances(
  p_company uuid,
  p_as_of   date default null
)
returns json
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_as_of date := coalesce(p_as_of, current_date);
begin
  if not app.has_perm(p_company, 'finance.channels', 'view') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์ดูช่องทางการเงิน';
  end if;

  return (
    with acct_bal as (
      -- ยอดคงเหลือรายบัญชีแยกประเภท ณ วันที่ที่เลือก
      select jl.account_id, round(sum(jl.debit - jl.credit), 2) as amount
      from public.journal_lines jl
      join public.journal_entries je on je.id = jl.entry_id and je.status = 'posted'
      where jl.company_id = p_company and je.entry_date <= v_as_of
      group by jl.account_id
    ),
    shared as (
      -- บัญชีที่มีหลายช่องทางผูกอยู่
      select account_id, count(*) as n
      from public.financial_channels
      where company_id = p_company and is_active and account_id is not null
      group by account_id
    ),
    ch as (
      select
        c.id, c.code, c.name, c.kind::text as kind, c.bank_name, c.bank_branch,
        c.account_no, c.bank_account_type, c.opening_balance, c.sort_order,
        a.code as account_code, a.name_th as account_name,
        coalesce(s.n, 1) > 1 as shares_account,
        -- ช่องทางที่ไม่ได้ผูกบัญชี ใช้ยอดยกมาเป็นยอดคงเหลือไปก่อน
        case when c.account_id is null
             then c.opening_balance
             else coalesce(ab.amount, 0) + c.opening_balance
        end as balance,
        c.account_id,
        -- นับยอดรวมเฉพาะใบแรกของแต่ละบัญชี กันนับซ้ำ
        (c.account_id is null
         or c.id = (select min(c2.id::text)::uuid from public.financial_channels c2
                    where c2.company_id = p_company and c2.is_active
                      and c2.account_id = c.account_id)) as counts_in_total
      from public.financial_channels c
      left join public.accounts a on a.id = c.account_id
      left join acct_bal ab on ab.account_id = c.account_id
      left join shared s on s.account_id = c.account_id
      where c.company_id = p_company and c.is_active
    ),
    grouped as (
      select
        case
          when kind = 'bank' and bank_account_type = 'current' then 'bank_current'
          when kind = 'bank' and bank_account_type = 'fixed'   then 'bank_fixed'
          when kind = 'bank'                                    then 'bank_savings'
          else kind
        end as gkey,
        ch.*
      from ch
    )
    select json_build_object(
      'as_of', v_as_of,
      'account_count', (select count(*) from ch),
      'grand_total', coalesce((select round(sum(balance), 2) from grouped where counts_in_total), 0),
      'has_shared', exists (select 1 from ch where shares_account),
      'groups', coalesce((
        select jsonb_agg(g order by g_sort)
        from (
          select
            case gkey
              when 'cash'         then 0
              when 'bank_savings' then 1
              when 'bank_current' then 2
              when 'bank_fixed'   then 3
              when 'e_wallet'     then 4
              when 'credit_card'  then 5
              else 6
            end as g_sort,
            jsonb_build_object(
              'key', gkey,
              'label', case gkey
                when 'cash'         then 'เงินสด'
                when 'bank_savings' then 'เงินฝากธนาคารออมทรัพย์'
                when 'bank_current' then 'เงินฝากธนาคารกระแสรายวัน'
                when 'bank_fixed'   then 'เงินฝากประจำ'
                when 'e_wallet'     then 'กระเป๋าเงินอิเล็กทรอนิกส์'
                when 'credit_card'  then 'บัตรเครดิต'
                else 'เช็ค' end,
              'count', count(*),
              'total', round(sum(balance) filter (where counts_in_total), 2),
              'channels', jsonb_agg(jsonb_build_object(
                'id', id, 'code', code, 'name', name, 'kind', kind,
                'bank_name', bank_name, 'bank_branch', bank_branch, 'account_no', account_no,
                'account_code', account_code, 'account_name', account_name,
                'balance', balance, 'shares_account', shares_account,
                'counts_in_total', counts_in_total
              ) order by sort_order, code)
            ) as g
          from grouped
          group by gkey
        ) t
      ), '[]'::jsonb)
    )
  );
end $$;

grant execute on function public.rpt_channel_balances(uuid, date) to authenticated;
