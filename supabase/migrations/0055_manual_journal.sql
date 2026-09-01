-- =====================================================================
-- 0055 : สมุดรายวันทั่วไป — คีย์รายการเองได้จริง
--
--  ตรวจก่อนลงมือแล้วพบว่าเป็นรูปแบบเดิมอีกครั้ง เหมือน 0054
--    - ตาราง journal_entries กับ journal_lines มีตั้งแต่ 0003 พร้อม RLS
--    - หน้าสมุดรายวันและบัญชีแยกประเภทมี แต่เป็นการอ่านอย่างเดียว
--    - ไม่มีฟังก์ชันไหนในฐานข้อมูลสร้างรายการบัญชีด้วยมือเลย
--    - ฝั่งแอปไม่มี action ใดแตะ journal_entries
--
--  รายการที่ลงเองได้เท่านั้นและตอนนี้ทำไม่ได้เลย
--    - ยอดยกมาตอนเริ่มใช้ระบบ
--    - ปรับปรุงปลายงวด เช่น ค่าใช้จ่ายค้างจ่าย รายได้ค้างรับ ค่าใช้จ่ายจ่ายล่วงหน้า
--    - ตั้งสำรองต่าง ๆ และการแก้ไขที่ผิดพลาด
--    - ปิดบัญชีสิ้นปี
--
--  ระบบบัญชีแยกประเภทเป็นหนึ่งใน 12 ระบบที่ Express ประกาศไว้ (เมนู 5.บัญชี)
--  ขาดตรงนี้แปลว่าปิดงบจริงไม่ได้ ต้องไปทำนอกระบบแล้วยกกลับเข้ามา
--
--  กติกาที่ยึด
--    - เดบิตต้องเท่ากับเครดิตเสมอ ไม่มีข้อยกเว้น
--    - รายการที่ระบบสร้างเองห้ามแก้ด้วยมือ ต้องแก้ที่ต้นทาง
--    - ผ่านรายการแล้วแก้ไม่ได้ ใช้การกลับรายการเท่านั้น เพื่อให้ตรวจย้อนหลังได้
-- =====================================================================

-- ------------------------------------------------------------------------
-- 1) บันทึกรายการบัญชีด้วยมือ
--
--  p_lines รูปแบบ
--    [{"account_id":"...","description":"...","debit":100,"credit":0,
--      "contact_id":null,"dimension_id":null}, ...]
--
--  p_post = true  ผ่านรายการทันที
--  p_post = false เก็บเป็นร่างไว้ให้ตรวจก่อน
-- ------------------------------------------------------------------------
create or replace function public.save_journal_entry(
  p_company     uuid,
  p_entry_date  date,
  p_description text,
  p_lines       jsonb,
  p_book        text default 'GL',
  p_post        boolean default true,
  p_entry_id    uuid default null,
  p_reference   text default null
)
returns json
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_entry  uuid;
  v_debit  numeric := 0;
  v_credit numeric := 0;
  v_n      int := 0;
  v_cur    record;
  l        record;
begin
  if not app.has_perm(p_company, 'journal', case when p_entry_id is null then 'create' else 'edit' end) then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์บันทึกสมุดรายวัน';
  end if;
  if p_post and not app.has_perm(p_company, 'journal', 'post') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์ผ่านรายการ';
  end if;
  if p_book not in ('GL','ADJ') then
    raise exception 'BAD_BOOK: สมุดที่คีย์เองได้มีเฉพาะ GL และ ADJ';
  end if;
  if nullif(btrim(coalesce(p_description,'')), '') is null then
    raise exception 'DESCRIPTION_REQUIRED: ต้องระบุคำอธิบายรายการ';
  end if;
  if p_lines is null or jsonb_array_length(p_lines) < 2 then
    raise exception 'NEED_TWO_LINES: ต้องมีอย่างน้อยสองบรรทัด';
  end if;

  perform app.assert_period_open(p_company, p_entry_date, 'journal');
  perform app.assert_period_open(p_company, p_entry_date, 'all');

  -- แก้ของเดิม : ต้องเป็นรายการที่คีย์เองและยังไม่ผ่านรายการ
  if p_entry_id is not null then
    select id, company_id, status::text as status, is_auto, source_type
      into v_cur from public.journal_entries where id = p_entry_id;
    if v_cur.id is null then raise exception 'ENTRY_NOT_FOUND'; end if;
    if v_cur.company_id <> p_company then raise exception 'CROSS_COMPANY: รายการคนละบริษัท'; end if;
    if coalesce(v_cur.is_auto, false) or coalesce(v_cur.source_type,'') in ('document','payment') then
      raise exception 'AUTO_ENTRY: รายการที่ระบบสร้างจากเอกสารแก้ด้วยมือไม่ได้ ให้แก้ที่เอกสารต้นทาง';
    end if;
    if v_cur.status = 'posted' then
      raise exception 'ENTRY_POSTED: รายการที่ผ่านแล้วแก้ไม่ได้ ให้กลับรายการแทน';
    end if;
    delete from public.journal_lines where entry_id = p_entry_id;
    v_entry := p_entry_id;
    update public.journal_entries
       set entry_date = p_entry_date, book = p_book, description = p_description
     where id = p_entry_id;
  else
    insert into public.journal_entries
      (company_id, entry_number, entry_date, book, description,
       source_type, status, is_auto, created_by)
    values (p_company, app.next_entry_number(p_company, p_book, p_entry_date),
            p_entry_date, p_book, p_description, 'manual', 'draft', false, auth.uid())
    returning id into v_entry;
  end if;

  for l in
    select (x->>'account_id')::uuid   as account_id,
           nullif(btrim(coalesce(x->>'description','')), '') as descr,
           round(coalesce((x->>'debit')::numeric, 0), 2)  as debit,
           round(coalesce((x->>'credit')::numeric, 0), 2) as credit,
           nullif(x->>'contact_id','')::uuid   as contact_id,
           nullif(x->>'dimension_id','')::uuid as dimension_id
    from jsonb_array_elements(p_lines) x
  loop
    -- บรรทัดว่างเปล่าจากหน้าจอ ข้ามไปเงียบ ๆ ไม่ถือเป็นความผิดพลาด
    if l.account_id is null and l.debit = 0 and l.credit = 0 then
      continue;
    end if;
    if l.account_id is null then
      raise exception 'ACCOUNT_REQUIRED: ทุกบรรทัดต้องระบุบัญชี';
    end if;
    if l.debit < 0 or l.credit < 0 then
      raise exception 'NEGATIVE_AMOUNT: ใส่จำนวนติดลบไม่ได้ ให้สลับข้างเดบิต-เครดิตแทน';
    end if;
    if (l.debit > 0 and l.credit > 0) or (l.debit = 0 and l.credit = 0) then
      raise exception 'ONE_SIDE_ONLY: แต่ละบรรทัดต้องเป็นเดบิตหรือเครดิตอย่างใดอย่างหนึ่ง';
    end if;

    -- บัญชีต้องเป็นของบริษัทนี้ และต้องไม่ใช่บัญชีหัวข้อที่ใช้จัดกลุ่มเท่านั้น
    if not exists (
      select 1 from public.accounts a
      where a.id = l.account_id and a.company_id = p_company
        and a.is_active and not a.is_header
    ) then
      raise exception 'BAD_ACCOUNT: บัญชีไม่ถูกต้อง ปิดใช้งาน หรือเป็นบัญชีหัวข้อ';
    end if;

    v_n := v_n + 1;
    insert into public.journal_lines
      (entry_id, company_id, line_no, account_id, description, debit, credit, contact_id, dimension_id)
    values (v_entry, p_company, v_n, l.account_id, coalesce(l.descr, p_description),
            l.debit, l.credit, l.contact_id, l.dimension_id);

    v_debit  := v_debit + l.debit;
    v_credit := v_credit + l.credit;
  end loop;

  if v_n < 2 then
    raise exception 'NEED_TWO_LINES: ต้องมีอย่างน้อยสองบรรทัดที่กรอกครบ';
  end if;
  if abs(v_debit - v_credit) > 0.005 then
    raise exception 'NOT_BALANCED: เดบิต % ไม่เท่ากับเครดิต % ต่างกัน %',
      round(v_debit,2), round(v_credit,2), round(v_debit - v_credit, 2);
  end if;

  update public.journal_entries
     set total_debit = v_debit, total_credit = v_credit,
         status = case when p_post then 'posted' else 'draft' end::journal_status,
         posted_by = case when p_post then auth.uid() else null end,
         posted_at = case when p_post then now() else null end
   where id = v_entry;

  return json_build_object('ok', true, 'entry_id', v_entry,
                           'total_debit', v_debit, 'total_credit', v_credit);
end $$;

grant execute on function public.save_journal_entry(uuid, date, text, jsonb, text, boolean, uuid, text) to authenticated;

-- ------------------------------------------------------------------------
-- 2) กลับรายการ
--
-- ไม่ลบของเดิม สร้างรายการตรงข้ามลงวันที่ที่ระบุ
-- เพื่อให้เห็นทั้งรายการเดิมและการแก้ไขในสมุดรายวัน
-- ------------------------------------------------------------------------
create or replace function public.reverse_journal_entry(
  p_entry  uuid,
  p_date   date default null,
  p_reason text default null
)
returns json
language plpgsql
security definer
set search_path = public, app
as $$
declare je record; v_rev uuid; l record; i int := 0; v_date date;
begin
  select * into je from public.journal_entries where id = p_entry;
  if je.id is null then raise exception 'ENTRY_NOT_FOUND'; end if;
  if not app.has_perm(je.company_id, 'journal', 'void') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์กลับรายการ';
  end if;
  if je.status::text <> 'posted' then
    raise exception 'NOT_POSTED: กลับรายการได้เฉพาะรายการที่ผ่านแล้ว';
  end if;
  if je.reversed_by is not null then
    raise exception 'ALREADY_REVERSED: รายการนี้ถูกกลับไปแล้ว';
  end if;

  v_date := coalesce(p_date, je.entry_date);
  perform app.assert_period_open(je.company_id, v_date, 'journal');
  perform app.assert_period_open(je.company_id, v_date, 'all');

  insert into public.journal_entries
    (company_id, entry_number, entry_date, book, description,
     source_type, source_id, status, is_auto, created_by, posted_by, posted_at)
  values (je.company_id, app.next_entry_number(je.company_id, je.book, v_date), v_date, je.book,
          'กลับรายการ: ' || je.description || coalesce(' (' || p_reason || ')', ''),
          'reversal', je.id, 'posted', false, auth.uid(), auth.uid(), now())
  returning id into v_rev;

  for l in select * from public.journal_lines where entry_id = p_entry order by line_no loop
    i := i + 1;
    insert into public.journal_lines
      (entry_id, company_id, line_no, account_id, description, debit, credit, contact_id, dimension_id)
    values (v_rev, je.company_id, i, l.account_id, 'กลับรายการ: ' || coalesce(l.description,''),
            l.credit, l.debit, l.contact_id, l.dimension_id);
  end loop;

  update public.journal_entries
     set total_debit = je.total_credit, total_credit = je.total_debit
   where id = v_rev;
  update public.journal_entries set reversed_by = v_rev where id = p_entry;

  return json_build_object('ok', true, 'reversal_entry_id', v_rev);
end $$;

grant execute on function public.reverse_journal_entry(uuid, date, text) to authenticated;

-- ------------------------------------------------------------------------
-- 3) ผ่านรายการร่างที่คีย์ไว้
-- ------------------------------------------------------------------------
create or replace function public.post_journal_entry(p_entry uuid)
returns json
language plpgsql
security definer
set search_path = public, app
as $$
declare je record; v_d numeric; v_c numeric;
begin
  select * into je from public.journal_entries where id = p_entry;
  if je.id is null then raise exception 'ENTRY_NOT_FOUND'; end if;
  if not app.has_perm(je.company_id, 'journal', 'post') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์ผ่านรายการ';
  end if;
  if je.status::text = 'posted' then raise exception 'ALREADY_POSTED: ผ่านรายการไปแล้ว'; end if;
  perform app.assert_period_open(je.company_id, je.entry_date, 'journal');
  perform app.assert_period_open(je.company_id, je.entry_date, 'all');

  select coalesce(sum(debit),0), coalesce(sum(credit),0) into v_d, v_c
  from public.journal_lines where entry_id = p_entry;
  if abs(v_d - v_c) > 0.005 then
    raise exception 'NOT_BALANCED: เดบิต % ไม่เท่ากับเครดิต %', round(v_d,2), round(v_c,2);
  end if;

  update public.journal_entries
     set status = 'posted', posted_by = auth.uid(), posted_at = now(),
         total_debit = v_d, total_credit = v_c
   where id = p_entry;

  return json_build_object('ok', true);
end $$;

grant execute on function public.post_journal_entry(uuid) to authenticated;

-- ------------------------------------------------------------------------
-- 4) รายการบัญชีหนึ่งใบพร้อมบรรทัด — ให้หน้าจอโหลดมาแก้
-- ------------------------------------------------------------------------
create or replace function public.rpt_journal_entry(p_entry uuid)
returns json
language sql
stable
set search_path = public, app
as $$
  select json_build_object(
    'entry', (
      select jsonb_build_object(
        'id', je.id, 'entry_number', je.entry_number, 'entry_date', je.entry_date,
        'book', je.book, 'description', je.description, 'status', je.status::text,
        'is_auto', je.is_auto, 'source_type', je.source_type,
        'total_debit', je.total_debit, 'total_credit', je.total_credit,
        'reversed_by', je.reversed_by,
        -- แก้ได้เฉพาะรายการที่คีย์เองและยังไม่ผ่านรายการ
        'editable', (not coalesce(je.is_auto, false)
                     and coalesce(je.source_type,'') not in ('document','payment')
                     and je.status::text <> 'posted')
      )
      from public.journal_entries je where je.id = p_entry
    ),
    'lines', coalesce((
      select jsonb_agg(y order by (y->>'line_no')::int)
      from (
        select jsonb_build_object(
          'id', jl.id, 'line_no', jl.line_no,
          'account_id', jl.account_id, 'account_code', a.code, 'account_name', a.name_th,
          'description', jl.description, 'debit', jl.debit, 'credit', jl.credit,
          'contact_id', jl.contact_id, 'contact_name', c.name,
          'dimension_id', jl.dimension_id, 'dimension_name', dm.name
        ) as y
        from public.journal_lines jl
        join public.accounts a on a.id = jl.account_id
        left join public.contacts c on c.id = jl.contact_id
        left join public.dimensions dm on dm.id = jl.dimension_id
        where jl.entry_id = p_entry
      ) z), '[]'::jsonb)
  );
$$;

grant execute on function public.rpt_journal_entry(uuid) to authenticated;

comment on function public.save_journal_entry is
  'บันทึกสมุดรายวันด้วยมือ — เดบิตต้องเท่าเครดิต รายการที่ระบบสร้างจากเอกสารแก้ไม่ได้';
comment on function public.reverse_journal_entry is
  'กลับรายการที่ผ่านแล้ว โดยไม่ลบของเดิม เพื่อให้ตรวจย้อนหลังเห็นทั้งรายการเดิมและการแก้ไข';
