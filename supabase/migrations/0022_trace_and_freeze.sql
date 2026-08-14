-- =====================================================================
-- 0022 : สืบที่มาของตัวเลข + ปิดงวดพร้อมหลักฐานความถูกต้อง
--
--  แนวคิดจากระบบ ERP ขนาดใหญ่ (SAP)
--    1) Document Flow  — เอกสารทุกใบต้องบอกได้ว่ามาจากใบไหนและไปจบที่ใบไหน
--    2) Drill-down     — ตัวเลขในงบทุกตัวต้องกดลงไปดูรายการที่ประกอบกันขึ้นมาได้
--    3) Period control — ปิดงวดแล้วต้อง "พิสูจน์ได้" ว่าตัวเลขไม่ถูกแก้ย้อนหลัง
-- =====================================================================

-- ------------------------------------------------------------------------
-- 1) สายธารเอกสาร : ต้นทาง → ปลายทาง → บัญชี → เงิน → สต๊อก
-- ------------------------------------------------------------------------
create or replace function public.rpt_document_trace(p_document uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_doc     public.documents%rowtype;
  v_company uuid;
begin
  select * into v_doc from public.documents where id = p_document;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  v_company := v_doc.company_id;

  if not app.has_perm(v_company, 'documents', 'view') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์ดูเอกสาร';
  end if;

  return json_build_object(
    'document', (
      select to_jsonb(d) - 'contact_snapshot'
             || jsonb_build_object('contact_name',
                  coalesce(c.name, d.contact_snapshot->>'name'))
      from public.documents d
      left join public.contacts c on c.id = d.contact_id
      where d.id = p_document
    ),

    -- บรรทัดรายการพร้อมบัญชีที่ผูกไว้ เห็นได้ว่าเงินแต่ละก้อนไปลงบัญชีอะไร
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'line_no', l.line_no, 'description', l.description,
        'quantity', l.quantity, 'unit', l.unit, 'unit_price', l.unit_price,
        'line_amount', l.line_amount, 'vat_amount', l.vat_amount, 'wht_amount', l.wht_amount,
        'account', case when a.id is null then null
                        else jsonb_build_object('id', a.id, 'code', a.code, 'name', a.name_th) end,
        'product', case when p.id is null then null
                        else jsonb_build_object('id', p.id, 'sku', p.sku, 'name', p.name) end
      ) order by l.line_no)
      from public.document_lines l
      left join public.accounts a on a.id = l.account_id
      left join public.products p on p.id = l.product_id
      where l.document_id = p_document
    ), '[]'::jsonb),

    -- ต้นทาง : ไล่ย้อนขึ้นไปตาม ref_document_id จนสุดสาย
    'upstream', coalesce((
      with recursive up as (
        select d.id, d.kind, d.doc_number, d.doc_date, d.status, d.grand_total,
               d.ref_document_id, 1 as depth
        from public.documents d where d.id = v_doc.ref_document_id
        union all
        select d.id, d.kind, d.doc_number, d.doc_date, d.status, d.grand_total,
               d.ref_document_id, up.depth + 1
        from public.documents d join up on d.id = up.ref_document_id
        where up.depth < 10
      )
      select jsonb_agg(to_jsonb(up) order by up.depth desc) from up
    ), '[]'::jsonb),

    -- ปลายทาง : เอกสารที่ถูกสร้างต่อจากใบนี้
    'downstream', coalesce((
      with recursive down as (
        select d.id, d.kind, d.doc_number, d.doc_date, d.status, d.grand_total, 1 as depth
        from public.documents d where d.ref_document_id = p_document
        union all
        select d.id, d.kind, d.doc_number, d.doc_date, d.status, d.grand_total, down.depth + 1
        from public.documents d join down on d.ref_document_id = down.id
        where down.depth < 10
      )
      select jsonb_agg(to_jsonb(down) order by down.depth, down.doc_date) from down
    ), '[]'::jsonb),

    -- สมุดรายวันที่เกิดจากเอกสารใบนี้ พร้อมบรรทัดเดบิต/เครดิตทุกบรรทัด
    'journal', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', je.id, 'entry_number', je.entry_number, 'entry_date', je.entry_date,
        'book', je.book, 'status', je.status,
        'total_debit', je.total_debit, 'total_credit', je.total_credit,
        'lines', (
          select jsonb_agg(jsonb_build_object(
            'line_no', jl.line_no, 'description', jl.description,
            'debit', jl.debit, 'credit', jl.credit,
            'account_id', a.id, 'account_code', a.code, 'account_name', a.name_th
          ) order by jl.line_no)
          from public.journal_lines jl
          join public.accounts a on a.id = jl.account_id
          where jl.entry_id = je.id
        )
      ) order by je.entry_date, je.entry_number)
      from public.journal_entries je
      where je.company_id = v_company
        and ((je.source_type = 'document' and je.source_id = p_document)
             or je.id = v_doc.journal_entry_id)
    ), '[]'::jsonb),

    -- การรับ/จ่ายเงินที่ตัดกับเอกสารใบนี้
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pm.id, 'payment_number', pm.doc_number, 'payment_date', pm.doc_date,
        'direction', pm.direction, 'amount_allocated', pa.amount, 'amount_total', pm.amount,
        'status', pm.status, 'channel', fc.name
      ) order by pm.doc_date)
      from public.payment_allocations pa
      join public.payments pm on pm.id = pa.payment_id
      left join public.financial_channels fc on fc.id = pm.channel_id
      where pa.document_id = p_document
    ), '[]'::jsonb),

    -- ความเคลื่อนไหวสต๊อกที่เกิดจากเอกสารใบนี้
    'inventory', coalesce((
      select jsonb_agg(jsonb_build_object(
        'move_date', m.move_date, 'kind', m.kind,
        'sku', p.sku, 'product', p.name,
        'qty_in', m.qty_in, 'qty_out', m.qty_out,
        'unit_cost', m.unit_cost, 'value_in', m.value_in, 'value_out', m.value_out
      ) order by m.move_date, m.created_at)
      from public.inventory_moves m
      join public.products p on p.id = m.product_id
      where m.document_id = p_document
    ), '[]'::jsonb),

    -- เอกสารภาษีที่ออกจากใบนี้
    'tax_docs', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object('type', 'e-Tax', 'ref', e.provider_ref,
                                  'status', e.status, 'created_at', e.created_at) as x
        from public.etax_documents e where e.document_id = p_document
        union all
        select jsonb_build_object('type', '50 ทวิ', 'ref', w.cert_number,
                                  'status', w.status, 'created_at', w.created_at)
        from public.wht_certificates w where w.document_id = p_document
      ) t
    ), '[]'::jsonb),

    -- หลักฐานประกอบ
    'attachments', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'file_name', a.file_name,
                                          'size_bytes', a.size_bytes, 'created_at', a.created_at)
             order by a.created_at)
      from public.attachments a where a.document_id = p_document
    ), '[]'::jsonb),

    'prints', coalesce((
      select jsonb_agg(jsonb_build_object('copy_no', pr.copy_no, 'printed_at', pr.printed_at,
                                          'by', coalesce(pf.full_name, pf.email))
             order by pr.copy_no)
      from public.document_prints pr
      left join public.profiles pf on pf.id = pr.printed_by
      where pr.document_id = p_document
    ), '[]'::jsonb),

    -- ประวัติการแก้ไข : ใครทำอะไรกับเอกสารใบนี้บ้าง
    'audit', coalesce((
      select jsonb_agg(jsonb_build_object(
        'action', al.action, 'user_email', al.user_email,
        'created_at', al.created_at, 'resource', al.resource
      ) order by al.created_at desc)
      from public.audit_logs al
      where al.company_id = v_company and al.record_id = p_document::text
      limit 50
    ), '[]'::jsonb),

    -- ปิดงวดคลุมเอกสารใบนี้แล้วหรือยัง
    'frozen', (app.locked_through(v_company) >= v_doc.doc_date)
  );
end $$;

grant execute on function public.rpt_document_trace(uuid) to authenticated;

-- ------------------------------------------------------------------------
-- 2) เจาะจากยอดในงบลงไปหารายการที่ประกอบกันขึ้นมา
--    ใช้ตอนกดตัวเลขในงบทดลอง/งบกำไรขาดทุน แล้วอยากรู้ว่ามาจากไหน
-- ------------------------------------------------------------------------
create or replace function public.rpt_account_drill(
  p_company uuid,
  p_account uuid,
  p_from    date,
  p_to      date
)
returns json
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare v_open numeric(18,2);
begin
  if not app.has_perm(p_company, 'report', 'view') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์ดูรายงาน';
  end if;

  select coalesce(sum(jl.debit - jl.credit), 0) into v_open
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.entry_id and je.status = 'posted'
  where jl.company_id = p_company and jl.account_id = p_account and je.entry_date < p_from;

  return json_build_object(
    'account', (select jsonb_build_object('id', a.id, 'code', a.code, 'name', a.name_th,
                                          'type', a.type, 'normal_side', a.normal_side)
                from public.accounts a where a.id = p_account),
    'period', json_build_object('from', p_from, 'to', p_to),
    'opening', v_open,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'entry_id', je.id, 'entry_number', je.entry_number, 'entry_date', je.entry_date,
        'book', je.book, 'description', coalesce(jl.description, je.description),
        'debit', jl.debit, 'credit', jl.credit,
        'contact', ct.name,
        -- ต้นทางของบรรทัดนี้ : มาจากเอกสารใบไหน
        'source', case
          when je.source_type = 'document' and d.id is not null
            then jsonb_build_object('kind', d.kind, 'id', d.id, 'doc_number', d.doc_number)
          when je.is_auto then jsonb_build_object('kind', 'auto', 'id', null, 'doc_number', je.book)
          else jsonb_build_object('kind', 'manual', 'id', je.id, 'doc_number', je.entry_number)
        end
      ) order by je.entry_date, je.entry_number, jl.line_no)
      from public.journal_lines jl
      join public.journal_entries je on je.id = jl.entry_id and je.status = 'posted'
      left join public.documents d on d.id = je.source_id and je.source_type = 'document'
      left join public.contacts ct on ct.id = jl.contact_id
      where jl.company_id = p_company and jl.account_id = p_account
        and je.entry_date between p_from and p_to
    ), '[]'::jsonb),
    'total_debit', coalesce((
      select sum(jl.debit) from public.journal_lines jl
      join public.journal_entries je on je.id = jl.entry_id and je.status = 'posted'
      where jl.company_id = p_company and jl.account_id = p_account
        and je.entry_date between p_from and p_to), 0),
    'total_credit', coalesce((
      select sum(jl.credit) from public.journal_lines jl
      join public.journal_entries je on je.id = jl.entry_id and je.status = 'posted'
      where jl.company_id = p_company and jl.account_id = p_account
        and je.entry_date between p_from and p_to), 0)
  );
end $$;

grant execute on function public.rpt_account_drill(uuid, uuid, date, date) to authenticated;

-- ------------------------------------------------------------------------
-- 3) ปิดงวดพร้อมหลักฐาน
--    ตอนปิดงวดจะเก็บ "ลายนิ้วมือ" ของตัวเลขทั้งงวดไว้
--    ภายหลังตรวจสอบซ้ำได้ว่าตัวเลขยังตรงกับตอนที่ปิดหรือไม่
-- ------------------------------------------------------------------------
alter table public.period_locks
  add column if not exists snapshot      jsonb,
  add column if not exists snapshot_hash text,
  add column if not exists locked_from   date;

comment on column public.period_locks.snapshot is
  'ยอดคงเหลือรายบัญชีและจำนวนรายการ ณ เวลาที่ปิดงวด ใช้พิสูจน์ว่าข้อมูลไม่ถูกแก้ย้อนหลัง';

/* คำนวณลายนิ้วมือของงวด : ยอดรายบัญชี + จำนวนเอกสาร/รายการ */
create or replace function app.period_fingerprint(p_company uuid, p_through date)
returns jsonb
language sql
stable
security definer
set search_path = public, app
as $$
  with bal as (
    select a.code, round(sum(jl.debit - jl.credit), 2) as amount
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.entry_id and je.status = 'posted'
    join public.accounts a on a.id = jl.account_id
    where jl.company_id = p_company and je.entry_date <= p_through
    group by a.code
    having round(sum(jl.debit - jl.credit), 2) <> 0
  )
  select jsonb_build_object(
    'through', p_through,
    'accounts', coalesce((select jsonb_object_agg(code, amount) from bal), '{}'::jsonb),
    'account_count', (select count(*) from bal),
    'total_debit', coalesce((
      select round(sum(jl.debit), 2) from public.journal_lines jl
      join public.journal_entries je on je.id = jl.entry_id and je.status = 'posted'
      where jl.company_id = p_company and je.entry_date <= p_through), 0),
    'total_credit', coalesce((
      select round(sum(jl.credit), 2) from public.journal_lines jl
      join public.journal_entries je on je.id = jl.entry_id and je.status = 'posted'
      where jl.company_id = p_company and je.entry_date <= p_through), 0),
    'document_count', (select count(*) from public.documents
                       where company_id = p_company and doc_date <= p_through and status <> 'void'),
    'entry_count', (select count(*) from public.journal_entries
                    where company_id = p_company and entry_date <= p_through and status = 'posted')
  );
$$;

/* ปิดงวดพร้อมเก็บลายนิ้วมือ */
create or replace function public.freeze_period(
  p_company uuid,
  p_through date,
  p_scope   text default 'all',
  p_reason  text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_id   uuid;
  v_snap jsonb;
  v_prev date;
begin
  if not app.has_perm(p_company, 'period', 'create') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์ปิดงวด';
  end if;
  if p_through > current_date then
    raise exception 'FUTURE_PERIOD: ปิดงวดล่วงหน้าไม่ได้';
  end if;

  v_prev := app.locked_through(p_company, p_scope);
  if v_prev is not null and p_through <= v_prev then
    raise exception 'ALREADY_LOCKED: งวดนี้ถูกปิดไปแล้วถึงวันที่ %', v_prev;
  end if;

  v_snap := app.period_fingerprint(p_company, p_through);

  insert into public.period_locks (
    company_id, locked_from, locked_through, scope, reason,
    snapshot, snapshot_hash, locked_by
  ) values (
    p_company, v_prev, p_through, coalesce(p_scope, 'all'), p_reason,
    v_snap, md5(v_snap::text), auth.uid()
  ) returning id into v_id;

  return v_id;
end $$;

grant execute on function public.freeze_period(uuid, date, text, text) to authenticated;

/* ตรวจสอบว่าตัวเลขของงวดที่ปิดไปแล้วยังตรงกับตอนปิดหรือไม่ */
create or replace function public.verify_period_integrity(p_lock uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_lock public.period_locks%rowtype;
  v_now  jsonb;
  v_diff jsonb;
begin
  select * into v_lock from public.period_locks where id = p_lock;
  if not found then raise exception 'LOCK_NOT_FOUND'; end if;
  if not app.has_perm(v_lock.company_id, 'period', 'view') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์ตรวจสอบงวด';
  end if;
  if v_lock.snapshot is null then
    return json_build_object('status', 'no_snapshot',
      'message', 'งวดนี้ถูกปิดก่อนที่ระบบจะเก็บลายนิ้วมือ จึงตรวจสอบย้อนหลังไม่ได้');
  end if;

  v_now := app.period_fingerprint(v_lock.company_id, v_lock.locked_through);

  if md5(v_now::text) = v_lock.snapshot_hash then
    return json_build_object(
      'status', 'intact',
      'message', 'ตัวเลขตรงกับตอนปิดงวดทุกประการ',
      'locked_at', v_lock.locked_at,
      'checked_at', now(),
      'document_count', v_now->'document_count',
      'entry_count', v_now->'entry_count'
    );
  end if;

  -- หาว่าบัญชีไหนเปลี่ยนไปบ้าง
  select jsonb_agg(jsonb_build_object(
           'code', code,
           'before', (v_lock.snapshot->'accounts'->>code)::numeric,
           'after',  (v_now->'accounts'->>code)::numeric,
           'diff', coalesce((v_now->'accounts'->>code)::numeric, 0)
                 - coalesce((v_lock.snapshot->'accounts'->>code)::numeric, 0)
         ))
    into v_diff
  from (
    select code from jsonb_object_keys(v_lock.snapshot->'accounts') code
    union
    select code from jsonb_object_keys(v_now->'accounts') code
  ) k
  where coalesce((v_lock.snapshot->'accounts'->>code)::numeric, 0)
     <> coalesce((v_now->'accounts'->>code)::numeric, 0);

  return json_build_object(
    'status', 'changed',
    'message', 'ตัวเลขเปลี่ยนไปจากตอนปิดงวด ต้องหาสาเหตุก่อนใช้งบชุดนี้',
    'locked_at', v_lock.locked_at,
    'checked_at', now(),
    'changed_accounts', coalesce(v_diff, '[]'::jsonb),
    'before', jsonb_build_object(
      'document_count', v_lock.snapshot->'document_count',
      'entry_count', v_lock.snapshot->'entry_count',
      'total_debit', v_lock.snapshot->'total_debit'),
    'after', jsonb_build_object(
      'document_count', v_now->'document_count',
      'entry_count', v_now->'entry_count',
      'total_debit', v_now->'total_debit')
  );
end $$;

grant execute on function public.verify_period_integrity(uuid) to authenticated;
