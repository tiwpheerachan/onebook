-- =====================================================================
-- 0024 : ภาพรวมรายจ่ายและการเบิกจ่าย
--
--  คู่กับ rpt_revenue_overview แต่มองจากฝั่งเงินออก
--  เพิ่มส่วน "ต้องจ่ายเมื่อไร" ซึ่งเป็นสิ่งที่ฝ่ายการเงินต้องดูทุกวัน
--  ยึดเอกสารที่ลงบัญชีแล้วเป็นฐานเดียว จึงไม่นับซ้ำ
-- =====================================================================

create or replace function public.rpt_expense_overview(
  p_company uuid,
  p_year    int,
  p_month   int default null
)
returns json
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_from  date := make_date(p_year, 1, 1);
  v_to    date := make_date(p_year, 12, 31);
  v_m     int  := coalesce(p_month, extract(month from current_date)::int);
  v_mfrom date := make_date(p_year, v_m, 1);
  v_mto   date := (make_date(p_year, v_m, 1) + interval '1 month - 1 day')::date;
  v_pfrom date := (v_mfrom - interval '1 month')::date;
  v_pto   date := (v_mfrom - interval '1 day')::date;
begin
  if not app.has_perm(p_company, 'report', 'view') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์ดูรายงาน';
  end if;

  return json_build_object(
    'year', p_year, 'month', v_m,

    -- กราฟรายเดือน : ตั้งหนี้เท่าไร จ่ายไปแล้วเท่าไร ค้างเท่าไร เลยกำหนดเท่าไร
    'monthly', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month', m, 'billed', billed, 'paid', paid, 'open', open_amt, 'overdue', overdue_amt
      ) order by m)
      from (
        select
          extract(month from d.doc_date)::int as m,
          round(sum(coalesce(d.net_payable, d.grand_total)), 2) as billed,
          round(sum(coalesce(d.paid_amount, 0)), 2) as paid,
          round(sum(case when coalesce(d.due_date, d.doc_date) >= current_date
                         then coalesce(d.net_payable, d.grand_total) - coalesce(d.paid_amount, 0)
                         else 0 end), 2) as open_amt,
          round(sum(case when coalesce(d.due_date, d.doc_date) < current_date
                         then coalesce(d.net_payable, d.grand_total) - coalesce(d.paid_amount, 0)
                         else 0 end), 2) as overdue_amt
        from public.documents d
        where d.company_id = p_company
          and d.kind in ('bill','expense','purchase_debit_note')
          and d.status <> 'void' and d.journal_entry_id is not null
          and d.doc_date between v_from and v_to
        group by 1
      ) x
    ), '[]'::jsonb),

    'year_total', (
      select jsonb_build_object(
        'billed', coalesce(round(sum(coalesce(d.net_payable, d.grand_total)), 2), 0),
        'paid', coalesce(round(sum(coalesce(d.paid_amount, 0)), 2), 0),
        'open_amount', coalesce(round(sum(case when coalesce(d.due_date, d.doc_date) >= current_date
                                    then coalesce(d.net_payable, d.grand_total) - coalesce(d.paid_amount, 0)
                                    else 0 end), 2), 0),
        'open_count', count(*) filter (where coalesce(d.due_date, d.doc_date) >= current_date
                                         and coalesce(d.net_payable, d.grand_total) - coalesce(d.paid_amount, 0) > 0.005),
        'overdue_amount', coalesce(round(sum(case when coalesce(d.due_date, d.doc_date) < current_date
                                       then coalesce(d.net_payable, d.grand_total) - coalesce(d.paid_amount, 0)
                                       else 0 end), 2), 0),
        'overdue_count', count(*) filter (where coalesce(d.due_date, d.doc_date) < current_date
                                            and coalesce(d.net_payable, d.grand_total) - coalesce(d.paid_amount, 0) > 0.005)
      )
      from public.documents d
      where d.company_id = p_company
        and d.kind in ('bill','expense','purchase_debit_note')
        and d.status <> 'void' and d.journal_entry_id is not null
        and d.doc_date between v_from and v_to
    ),

    -- สายงานจัดซื้อ : สั่งซื้อไปเท่าไร รับของแล้วเท่าไร ตั้งหนี้แล้วเท่าไร
    'po_funnel', (
      select jsonb_build_object(
        'issued_amount', coalesce(round(sum(po.grand_total), 2), 0),
        'issued_count', count(*),
        'waiting_amount', coalesce(round(sum(po.grand_total) filter (where nx.id is null), 2), 0),
        'waiting_count', count(*) filter (where nx.id is null),
        'received_amount', coalesce(round(sum(po.grand_total) filter (where nx.id is not null), 2), 0),
        'received_count', count(*) filter (where nx.id is not null)
      )
      from public.documents po
      left join lateral (
        select d2.id from public.documents d2 where d2.ref_document_id = po.id limit 1
      ) nx on true
      where po.company_id = p_company and po.kind = 'purchase_order'
        and po.status <> 'void' and po.doc_date between v_mfrom and v_mto
    ),

    -- จ่ายให้ใครมากที่สุด
    'top_vendors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'label', label, 'amount', cur, 'prev', prev,
        'mom', case when prev > 0 then round((cur - prev) / prev * 100, 2) else null end
      ) order by cur desc)
      from (
        select c.id, coalesce(c.name, d.contact_snapshot->>'name', 'ไม่ระบุผู้ขาย') as label,
               round(sum(coalesce(d.net_payable, d.grand_total)) filter (where d.doc_date between v_mfrom and v_mto), 2) as cur,
               round(coalesce(sum(coalesce(d.net_payable, d.grand_total)) filter (where d.doc_date between v_pfrom and v_pto), 0), 2) as prev
        from public.documents d
        left join public.contacts c on c.id = d.contact_id
        where d.company_id = p_company
          and d.kind in ('bill','expense','purchase_debit_note')
          and d.status <> 'void' and d.journal_entry_id is not null
          and d.doc_date between v_pfrom and v_mto
        group by c.id, coalesce(c.name, d.contact_snapshot->>'name', 'ไม่ระบุผู้ขาย')
        having round(sum(coalesce(d.net_payable, d.grand_total)) filter (where d.doc_date between v_mfrom and v_mto), 2) > 0
        order by cur desc limit 8
      ) t
    ), '[]'::jsonb),

    -- จ่ายค่าอะไรมากที่สุด (จากบัญชีแยกประเภทจริง)
    'top_accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'label', label, 'amount', cur, 'prev', prev,
        'mom', case when prev > 0 then round((cur - prev) / prev * 100, 2) else null end
      ) order by cur desc)
      from (
        select a.id, a.code || ' ' || a.name_th as label,
               round(sum(jl.debit - jl.credit) filter (where je.entry_date between v_mfrom and v_mto), 2) as cur,
               round(coalesce(sum(jl.debit - jl.credit) filter (where je.entry_date between v_pfrom and v_pto), 0), 2) as prev
        from public.journal_lines jl
        join public.journal_entries je on je.id = jl.entry_id and je.status = 'posted'
        join public.accounts a on a.id = jl.account_id
        where jl.company_id = p_company
          and a.type in ('cost_of_sales','expense','other_expense')
          and je.entry_date between v_pfrom and v_mto
        group by a.id, a.code, a.name_th
        having round(sum(jl.debit - jl.credit) filter (where je.entry_date between v_mfrom and v_mto), 2) > 0
        order by cur desc limit 8
      ) t
    ), '[]'::jsonb),

    -- ตารางการเบิกจ่าย : ต้องจ่ายอะไรเมื่อไร แบ่งตามความเร่งด่วน
    'payment_schedule', coalesce((
      select jsonb_agg(jsonb_build_object(
        'bucket', bucket, 'count', n, 'amount', amt
      ) order by sort)
      from (
        select
          case
            when d.due_date < current_date then 'เลยกำหนดแล้ว'
            when d.due_date <= current_date + 7 then 'ภายใน 7 วัน'
            when d.due_date <= current_date + 30 then 'ภายใน 30 วัน'
            else 'เกิน 30 วัน'
          end as bucket,
          case
            when d.due_date < current_date then 0
            when d.due_date <= current_date + 7 then 1
            when d.due_date <= current_date + 30 then 2
            else 3
          end as sort,
          count(*) as n,
          round(sum(coalesce(d.net_payable, d.grand_total) - coalesce(d.paid_amount, 0)), 2) as amt
        from public.documents d
        where d.company_id = p_company
          and d.kind in ('bill','expense','purchase_debit_note')
          and d.status in ('approved','partial','overdue')
          and coalesce(d.net_payable, d.grand_total) - coalesce(d.paid_amount, 0) > 0.005
        group by 1, 2
      ) b
    ), '[]'::jsonb),

    -- รายการที่ต้องจ่ายเร็วที่สุด
    'due_next', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'kind', d.kind, 'doc_number', d.doc_number,
        'contact', coalesce(c.name, d.contact_snapshot->>'name'),
        'due_date', d.due_date,
        'days', d.due_date - current_date,
        'outstanding', round(coalesce(d.net_payable, d.grand_total) - coalesce(d.paid_amount, 0), 2)
      ) order by d.due_date)
      from public.documents d
      left join public.contacts c on c.id = d.contact_id
      where d.company_id = p_company
        and d.kind in ('bill','expense','purchase_debit_note')
        and d.status in ('approved','partial','overdue')
        and coalesce(d.net_payable, d.grand_total) - coalesce(d.paid_amount, 0) > 0.005
      limit 12
    ), '[]'::jsonb),

    -- ภาษีของเดือนที่เลือก ใช้เตรียมยื่นแบบ
    'tax_month', (
      select jsonb_build_object(
        'vat_input', coalesce(round(sum(d.vat_amount), 2), 0),
        'wht_withheld', coalesce(round(sum(d.wht_amount), 2), 0),
        'doc_count', count(*)
      )
      from public.documents d
      where d.company_id = p_company
        and d.kind in ('bill','expense')
        and d.status <> 'void'
        and d.doc_date between v_mfrom and v_mto
    )
  );
end $$;

grant execute on function public.rpt_expense_overview(uuid, int, int) to authenticated;
