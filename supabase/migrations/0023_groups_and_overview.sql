-- =====================================================================
-- 0023 : กลุ่มผู้ติดต่อกำหนดเอง + หน้าภาพรวมรายรับ
--
--  กลุ่มผู้ติดต่อ : ธุรกิจที่ขายหลายช่องทาง/หลายแบรนด์ต้องแยกกลุ่มลูกค้าเอง
--                  เช่น ร้านในแพลตฟอร์ม ฝากขาย บริษัทในเครือ
--  ภาพรวมรายรับ  : รวมตัวเลขที่ต้องดูทุกวันไว้หน้าเดียว พร้อมเทียบเดือนก่อน
-- =====================================================================

create table if not exists public.contact_groups (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name       text not null,
  color      text not null default 'brand',
  sort_order int  not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

create table if not exists public.contact_group_members (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  group_id   uuid not null references public.contact_groups(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (contact_id, group_id)
);
create index if not exists contact_group_members_group_idx on public.contact_group_members (group_id);

alter table public.contact_groups        enable row level security;
alter table public.contact_groups        force  row level security;
alter table public.contact_group_members enable row level security;
alter table public.contact_group_members force  row level security;

do $$
declare tbl text;
begin
  foreach tbl in array array['contact_groups','contact_group_members'] loop
    execute format('drop policy if exists %I on public.%I', tbl || '_sel', tbl);
    execute format($f$create policy %I on public.%I for select
                     using (app.has_perm(company_id, 'contacts', 'view'))$f$, tbl || '_sel', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_ins', tbl);
    execute format($f$create policy %I on public.%I for insert
                     with check (app.has_perm(company_id, 'contacts', 'edit'))$f$, tbl || '_ins', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_upd', tbl);
    execute format($f$create policy %I on public.%I for update
                     using (app.has_perm(company_id, 'contacts', 'edit'))
                     with check (app.has_perm(company_id, 'contacts', 'edit'))$f$, tbl || '_upd', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_del', tbl);
    execute format($f$create policy %I on public.%I for delete
                     using (app.has_perm(company_id, 'contacts', 'edit'))$f$, tbl || '_del', tbl);
  end loop;
end $$;

-- ------------------------------------------------------------------------
-- ใส่/เอาผู้ติดต่อออกจากกลุ่มทีละหลายราย
-- ------------------------------------------------------------------------
create or replace function public.set_contact_group(
  p_group    uuid,
  p_contacts uuid[],
  p_attach   boolean default true
)
returns int
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_company uuid;
  v_n int := 0;
begin
  select company_id into v_company from public.contact_groups where id = p_group;
  if v_company is null then raise exception 'GROUP_NOT_FOUND'; end if;
  if not app.has_perm(v_company, 'contacts', 'edit') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์จัดกลุ่มผู้ติดต่อ';
  end if;

  if p_attach then
    insert into public.contact_group_members (contact_id, group_id, company_id)
    select c.id, p_group, v_company
    from public.contacts c
    where c.id = any(p_contacts) and c.company_id = v_company
    on conflict do nothing;
    get diagnostics v_n = row_count;
  else
    delete from public.contact_group_members
    where group_id = p_group and contact_id = any(p_contacts);
    get diagnostics v_n = row_count;
  end if;

  return v_n;
end $$;

grant execute on function public.set_contact_group(uuid, uuid[], boolean) to authenticated;

-- ------------------------------------------------------------------------
-- ภาพรวมรายรับ
--   ยึด "เอกสารที่ลงบัญชีแล้ว" เป็นฐานเดียวทั้งหน้า จึงไม่มีทางนับซ้ำ
--   แม้บริษัทจะออกทั้งใบแจ้งหนี้และใบกำกับภาษีสำหรับการขายเดียวกัน
-- ------------------------------------------------------------------------
create or replace function public.rpt_revenue_overview(
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

    -- กราฟรายเดือน : ออกบิลเท่าไร เก็บได้แล้วเท่าไร ค้างอยู่เท่าไร เลยกำหนดเท่าไร
    'monthly', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month', m,
        'invoiced', invoiced, 'paid', paid,
        'open', open_amt, 'overdue', overdue_amt
      ) order by m)
      from (
        select
          extract(month from d.doc_date)::int as m,
          round(sum(coalesce(d.net_payable, d.grand_total)), 2) as invoiced,
          round(sum(coalesce(d.paid_amount, 0)), 2) as paid,
          round(sum(case when coalesce(d.due_date, d.doc_date) >= current_date
                         then coalesce(d.net_payable, d.grand_total) - coalesce(d.paid_amount, 0)
                         else 0 end), 2) as open_amt,
          round(sum(case when coalesce(d.due_date, d.doc_date) < current_date
                         then coalesce(d.net_payable, d.grand_total) - coalesce(d.paid_amount, 0)
                         else 0 end), 2) as overdue_amt
        from public.documents d
        where d.company_id = p_company
          and d.kind in ('invoice','tax_invoice','debit_note')
          and d.status <> 'void' and d.journal_entry_id is not null
          and d.doc_date between v_from and v_to
        group by 1
      ) x
    ), '[]'::jsonb),

    -- ยอดสะสมทั้งปี
    'year_total', (
      select jsonb_build_object(
        'invoiced', coalesce(round(sum(coalesce(d.net_payable, d.grand_total)), 2), 0),
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
        and d.kind in ('invoice','tax_invoice','debit_note')
        and d.status <> 'void' and d.journal_entry_id is not null
        and d.doc_date between v_from and v_to
    ),

    -- ช่องทางใบเสนอราคา : ออกไปเท่าไร รอลูกค้าตอบเท่าไร แปลงเป็นบิลแล้วเท่าไร
    'quotation_funnel', (
      select jsonb_build_object(
        'issued_amount', coalesce(round(sum(q.grand_total), 2), 0),
        'issued_count', count(*),
        'waiting_amount', coalesce(round(sum(q.grand_total) filter (where nx.id is null and q.status <> 'closed'), 2), 0),
        'waiting_count', count(*) filter (where nx.id is null and q.status <> 'closed'),
        'converted_amount', coalesce(round(sum(q.grand_total) filter (where nx.id is not null), 2), 0),
        'converted_count', count(*) filter (where nx.id is not null)
      )
      from public.documents q
      left join lateral (
        select d2.id from public.documents d2 where d2.ref_document_id = q.id limit 1
      ) nx on true
      where q.company_id = p_company and q.kind = 'quotation'
        and q.status <> 'void' and q.doc_date between v_mfrom and v_mto
    ),

    -- ขายอะไรดีที่สุด (เทียบเดือนก่อน)
    'top_products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'label', label, 'amount', cur, 'prev', prev,
        'mom', case when prev > 0 then round((cur - prev) / prev * 100, 2) else null end
      ) order by cur desc)
      from (
        select p.id, coalesce(p.sku || ' · ' || p.name, l.description) as label,
               round(sum(l.line_amount) filter (where d.doc_date between v_mfrom and v_mto), 2) as cur,
               round(coalesce(sum(l.line_amount) filter (where d.doc_date between v_pfrom and v_pto), 0), 2) as prev
        from public.document_lines l
        join public.documents d on d.id = l.document_id
        left join public.products p on p.id = l.product_id
        where d.company_id = p_company
          and d.kind in ('invoice','tax_invoice','debit_note')
          and d.status <> 'void' and d.journal_entry_id is not null
          and d.doc_date between v_pfrom and v_mto
        group by p.id, coalesce(p.sku || ' · ' || p.name, l.description)
        having round(sum(l.line_amount) filter (where d.doc_date between v_mfrom and v_mto), 2) > 0
        order by cur desc limit 8
      ) t
    ), '[]'::jsonb),

    -- ขายใครได้มากที่สุด
    'top_customers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'label', label, 'amount', cur, 'prev', prev,
        'mom', case when prev > 0 then round((cur - prev) / prev * 100, 2) else null end
      ) order by cur desc)
      from (
        select c.id, coalesce(c.name, d.contact_snapshot->>'name', 'ไม่ระบุลูกค้า') as label,
               round(sum(coalesce(d.net_payable, d.grand_total)) filter (where d.doc_date between v_mfrom and v_mto), 2) as cur,
               round(coalesce(sum(coalesce(d.net_payable, d.grand_total)) filter (where d.doc_date between v_pfrom and v_pto), 0), 2) as prev
        from public.documents d
        left join public.contacts c on c.id = d.contact_id
        where d.company_id = p_company
          and d.kind in ('invoice','tax_invoice','debit_note')
          and d.status <> 'void' and d.journal_entry_id is not null
          and d.doc_date between v_pfrom and v_mto
        group by c.id, coalesce(c.name, d.contact_snapshot->>'name', 'ไม่ระบุลูกค้า')
        having round(sum(coalesce(d.net_payable, d.grand_total)) filter (where d.doc_date between v_mfrom and v_mto), 2) > 0
        order by cur desc limit 8
      ) t
    ), '[]'::jsonb),

    -- รายได้อะไรมากที่สุด (จากบัญชีแยกประเภทจริง)
    'top_accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'label', label, 'amount', cur, 'prev', prev,
        'mom', case when prev > 0 then round((cur - prev) / prev * 100, 2) else null end
      ) order by cur desc)
      from (
        select a.id, a.code || ' ' || a.name_th as label,
               round(sum(jl.credit - jl.debit) filter (where je.entry_date between v_mfrom and v_mto), 2) as cur,
               round(coalesce(sum(jl.credit - jl.debit) filter (where je.entry_date between v_pfrom and v_pto), 0), 2) as prev
        from public.journal_lines jl
        join public.journal_entries je on je.id = jl.entry_id and je.status = 'posted'
        join public.accounts a on a.id = jl.account_id
        where jl.company_id = p_company
          and a.type in ('revenue','other_income')
          and je.entry_date between v_pfrom and v_mto
        group by a.id, a.code, a.name_th
        having round(sum(jl.credit - jl.debit) filter (where je.entry_date between v_mfrom and v_mto), 2) > 0
        order by cur desc limit 8
      ) t
    ), '[]'::jsonb),

    -- ลูกหนี้ที่ต้องติดตาม
    'follow_up', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'kind', d.kind, 'doc_number', d.doc_number,
        'contact', coalesce(c.name, d.contact_snapshot->>'name'),
        'due_date', d.due_date,
        'days_late', greatest(0, current_date - d.due_date),
        'outstanding', round(coalesce(d.net_payable, d.grand_total) - coalesce(d.paid_amount, 0), 2)
      ) order by d.due_date)
      from public.documents d
      left join public.contacts c on c.id = d.contact_id
      where d.company_id = p_company
        and d.kind in ('invoice','tax_invoice','debit_note')
        and d.status <> 'void' and d.journal_entry_id is not null
        and d.due_date < current_date
        and coalesce(d.net_payable, d.grand_total) - coalesce(d.paid_amount, 0) > 0.005
      limit 10
    ), '[]'::jsonb)
  );
end $$;

grant execute on function public.rpt_revenue_overview(uuid, int, int) to authenticated;
