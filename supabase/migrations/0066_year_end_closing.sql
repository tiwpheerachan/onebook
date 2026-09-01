-- =====================================================================
-- 0066 : ปิดบัญชีสิ้นปี ยกยอดกำไรสะสม
--
--  ระบบมีการตรวจก่อนปิดงบ (0021) และการล็อกงวด (0022) แล้ว
--  แต่ขาดตัวสุดท้ายคือ "รายการปิดบัญชี" ที่ล้างบัญชีรายได้และค่าใช้จ่าย
--  เข้ากำไรสะสม ค้นทั้งฐานข้อมูลแล้วไม่พบฟังก์ชันใดทำเรื่องนี้
--
-- ---------------------------------------------------------------------
--  ผลข้างเคียงที่มีอยู่ตอนนี้
--
--  rpt_balance_sheet คำนวณกำไรสุทธิจากรายการทั้งหมดตั้งแต่ต้นจนถึงวันที่ดู
--  ไม่เคยรีเซ็ตตามรอบปีบัญชี บริษัทที่ใช้มาสองปีจึงเห็นบรรทัด
--  "กำไร(ขาดทุน)สุทธิประจำงวด" เป็นกำไรสะสมทุกปีรวมกัน ไม่ใช่ของปีนี้
--
--  พอมีรายการปิดบัญชี ปัญหานี้หายไปเอง เพราะบัญชีรายได้-ค่าใช้จ่าย
--  ของปีก่อนถูกล้างเป็นศูนย์ ณ วันสิ้นปี ยอดที่เหลือจึงเป็นของปีปัจจุบันจริง
--
-- ---------------------------------------------------------------------
--  ปิดเข้าบัญชีไหน
--
--  ปิดเข้า "กำไร(ขาดทุน)สะสม" (3220) โดยตรง ไม่ผ่าน 3230
--
--  เหตุผล : rpt_balance_sheet สร้างบรรทัด 3230 ขึ้นมาเองจากการคำนวณ
--  ถ้าปิดเข้าบัญชี 3230 จริง งบจะแสดง 3230 สองครั้ง — ครั้งหนึ่งจากยอดบัญชีจริง
--  อีกครั้งจากตัวคำนวณ กลายเป็นนับกำไรซ้ำสองเท่าในส่วนของผู้ถือหุ้น
--
-- ---------------------------------------------------------------------
--  ปิดซ้ำไม่ได้ และย้อนกลับได้
--
--  จดการปิดไว้ใน fiscal_year_closings หนึ่งแถวต่อหนึ่งปี
--  จะปิดใหม่ได้ต้องเปิดปีก่อน ซึ่งกลับรายการปิดให้เรียบร้อยและบันทึกว่าใครทำ
-- =====================================================================

-- ------------------------------------------------------------------------
-- 1) ทะเบียนการปิดปี
-- ------------------------------------------------------------------------
create table if not exists public.fiscal_year_closings (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  fiscal_year  smallint not null,
  period_from  date not null,
  period_to    date not null,
  entry_id     uuid references public.journal_entries(id) on delete set null,
  net_profit   numeric(18,2) not null default 0,
  closed_by    uuid references public.profiles(id),
  closed_at    timestamptz not null default now(),
  reopened_by  uuid references public.profiles(id),
  reopened_at  timestamptz,
  note         text
);

-- ห้ามมีการปิดที่ยังมีผลซ้อนกันสองแถวในปีเดียว
-- แต่แถวที่เปิดกลับแล้วต้องเก็บไว้เป็นประวัติ จึงเป็น unique แบบมีเงื่อนไข
-- ถ้าใช้ unique ธรรมดา จะปิดปีใหม่หลังเปิดกลับไม่ได้เลย
create unique index if not exists fy_closings_open_idx
  on public.fiscal_year_closings (company_id, fiscal_year)
  where reopened_at is null;

create index if not exists fy_closings_company_idx
  on public.fiscal_year_closings (company_id, fiscal_year);

comment on table public.fiscal_year_closings is
  'ทะเบียนการปิดบัญชีสิ้นปี หนึ่งแถวต่อหนึ่งรอบปี — reopened_at ไม่ null แปลว่าเปิดปีกลับแล้ว';

alter table public.fiscal_year_closings enable row level security;
alter table public.fiscal_year_closings force row level security;

drop policy if exists "fy_closings_sel" on public.fiscal_year_closings;
create policy "fy_closings_sel" on public.fiscal_year_closings for select to authenticated
  using (app.has_perm(company_id, 'period', 'view'));

-- แก้ผ่านฟังก์ชันเท่านั้น
drop policy if exists "fy_closings_ins" on public.fiscal_year_closings;
create policy "fy_closings_ins" on public.fiscal_year_closings for insert to authenticated
  with check (false);

drop trigger if exists trg_audit_fy_closings on public.fiscal_year_closings;
create trigger trg_audit_fy_closings
  after insert or update or delete on public.fiscal_year_closings
  for each row execute function app.audit_trigger();

-- ------------------------------------------------------------------------
-- 2) ช่วงวันของรอบปีบัญชี
--
--  ปีบัญชีเรียกชื่อตามปีที่เริ่ม บริษัทที่เริ่มรอบเดือนตุลาคม
--  ปีบัญชี 2026 จึงกินตั้งแต่ 1 ต.ค. 2026 ถึง 30 ก.ย. 2027
-- ------------------------------------------------------------------------
create or replace function app.fiscal_span(p_company uuid, p_year int)
returns table (d_from date, d_to date)
language sql
stable
security definer
set search_path = public, app
as $fn$
  select make_date(p_year, c.fiscal_year_start, 1) as d_from,
         (make_date(p_year, c.fiscal_year_start, 1) + interval '1 year - 1 day')::date as d_to
  from public.companies c where c.id = p_company;
$fn$;

comment on function app.fiscal_span is
  'ช่วงวันของรอบปีบัญชี เรียกชื่อปีตามปีที่รอบเริ่ม รองรับรอบที่ไม่ตรงปีปฏิทิน';

-- ------------------------------------------------------------------------
-- 3) สถานะของรอบปี — ใช้ดูก่อนตัดสินใจปิด
-- ------------------------------------------------------------------------
create or replace function public.rpt_fiscal_year(p_company uuid, p_year int)
returns json
language sql
stable
security invoker
set search_path = public, app
as $fy$
  with span as (select * from app.fiscal_span(p_company, p_year)),
  pl as (
    select
      coalesce(sum(case when a.type in ('revenue','other_income')
                        then jl.credit - jl.debit end), 0) as revenue,
      coalesce(sum(case when a.type in ('cost_of_sales','expense','other_expense','tax')
                        then jl.debit - jl.credit end), 0) as expense,
      count(*) as line_count
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.entry_id and je.status = 'posted'
    join public.accounts a on a.id = jl.account_id
    cross join span
    where jl.company_id = p_company
      and je.entry_date between span.d_from and span.d_to
      and a.type in ('revenue','other_income','cost_of_sales','expense','other_expense','tax')
  ),
  draft as (
    select count(*) as n from public.journal_entries je
    cross join span
    where je.company_id = p_company and je.status = 'draft'
      and je.entry_date between span.d_from and span.d_to
  ),
  closing as (
    select * from public.fiscal_year_closings
    where company_id = p_company and fiscal_year = p_year
  )
  select json_build_object(
    'fiscal_year', p_year,
    'from', (select d_from from span),
    'to',   (select d_to from span),
    'revenue', round((select revenue from pl), 2),
    'expense', round((select expense from pl), 2),
    'net_profit', round((select revenue - expense from pl), 2),
    'draft_entries', (select n from draft),
    'closed', exists (select 1 from closing where reopened_at is null),
    'closed_at', (select closed_at from closing where reopened_at is null),
    'entry_id', (select entry_id from closing where reopened_at is null)
  );
$fy$;

grant execute on function public.rpt_fiscal_year(uuid, int) to authenticated;

-- ------------------------------------------------------------------------
-- 4) ปิดบัญชีสิ้นปี
--
--  ล้างบัญชีรายได้และค่าใช้จ่ายทีละบัญชีตามยอดคงเหลือของรอบปีนั้น
--  แล้วปิดผลต่างเข้ากำไรสะสมด้วยบรรทัดเดียว
--
--  ล้างรายบัญชี ไม่ใช่รวมยอดเดียว เพื่อให้บัญชีแยกประเภทของแต่ละบัญชี
--  มียอดยกไปเป็นศูนย์จริง ตรวจสอบย้อนกลับได้ว่าปิดจากอะไรเท่าไร
-- ------------------------------------------------------------------------
create or replace function public.close_fiscal_year(
  p_company uuid, p_year int, p_note text default null
)
returns json
language plpgsql
security definer
set search_path = public, app
as $fn$
declare
  v_from date; v_to date;
  r record;
  v_lines jsonb := '[]'::jsonb;
  v_net numeric := 0;
  v_re uuid;
  v_res json; v_entry uuid;
  v_draft int;
begin
  if not app.has_perm(p_company, 'period', 'lock') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์ปิดงวดบัญชี';
  end if;

  select d_from, d_to into v_from, v_to from app.fiscal_span(p_company, p_year);
  if v_from is null then raise exception 'COMPANY_NOT_FOUND'; end if;

  if exists (select 1 from public.fiscal_year_closings
             where company_id = p_company and fiscal_year = p_year and reopened_at is null) then
    raise exception 'ALREADY_CLOSED: ปีบัญชี % ปิดไปแล้ว', p_year;
  end if;

  -- รายการที่ยังเป็นร่างอยู่ในรอบปี ต้องจัดการก่อน ไม่งั้นตัวเลขที่ปิดไม่ครบ
  select count(*) into v_draft from public.journal_entries
   where company_id = p_company and status = 'draft'
     and entry_date between v_from and v_to;
  if v_draft > 0 then
    raise exception 'DRAFT_ENTRIES: มีรายการที่ยังไม่ผ่าน % รายการในรอบปีนี้', v_draft
      using hint = 'ผ่านรายการหรือลบรายการร่างให้หมดก่อนปิดปี';
  end if;

  v_re := app.acc(p_company, 'retained_earnings');
  if v_re is null then raise exception 'NO_RETAINED_EARNINGS: ไม่พบบัญชีกำไรสะสม'; end if;

  -- ล้างทีละบัญชี ด้านตรงข้ามกับยอดคงเหลือของบัญชีนั้น
  for r in
    select a.id, a.code, a.name_th,
           sum(jl.debit) - sum(jl.credit) as net_debit
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.entry_id and je.status = 'posted'
    join public.accounts a on a.id = jl.account_id
    where jl.company_id = p_company
      and je.entry_date between v_from and v_to
      and a.type in ('revenue','other_income','cost_of_sales','expense','other_expense','tax')
    group by a.id, a.code, a.name_th
    having round(sum(jl.debit) - sum(jl.credit), 2) <> 0
    order by a.code
  loop
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_id', r.id,
      'description', 'ปิดบัญชี ' || r.code || ' ' || r.name_th,
      'debit',  case when r.net_debit < 0 then round(-r.net_debit, 2) else 0 end,
      'credit', case when r.net_debit > 0 then round( r.net_debit, 2) else 0 end));
    -- ยอดเดบิตสุทธิของบัญชีกลุ่มนี้คือค่าใช้จ่าย จึงลบออกจากกำไร
    v_net := v_net - r.net_debit;
  end loop;

  if jsonb_array_length(v_lines) = 0 then
    raise exception 'NOTHING_TO_CLOSE: รอบปีนี้ไม่มีรายการรายได้หรือค่าใช้จ่าย';
  end if;

  -- บรรทัดปิดเข้ากำไรสะสม กำไรเป็นเครดิต ขาดทุนเป็นเดบิต
  v_net := round(v_net, 2);
  v_lines := v_lines || jsonb_build_array(jsonb_build_object(
    'account_id', v_re,
    'description', 'ยกกำไร(ขาดทุน)สุทธิเข้ากำไรสะสม',
    'debit',  case when v_net < 0 then -v_net else 0 end,
    'credit', case when v_net > 0 then  v_net else 0 end));

  v_res := public.save_journal_entry(
    p_company, v_to,
    'ปิดบัญชีสิ้นปี ' || p_year::text,
    v_lines, 'ADJ', true, null, 'CLOSE-' || p_year::text);
  v_entry := (v_res->>'entry_id')::uuid;

  insert into public.fiscal_year_closings
    (company_id, fiscal_year, period_from, period_to, entry_id, net_profit, closed_by, note)
  values (p_company, p_year, v_from, v_to, v_entry, v_net, auth.uid(), p_note);

  return json_build_object(
    'fiscal_year', p_year, 'from', v_from, 'to', v_to,
    'net_profit', v_net, 'entry_id', v_entry,
    'accounts_closed', jsonb_array_length(v_lines) - 1);
end $fn$;

grant execute on function public.close_fiscal_year(uuid, int, text) to authenticated;

comment on function public.close_fiscal_year is
  'ปิดบัญชีสิ้นปี ล้างรายได้-ค่าใช้จ่ายรายบัญชีเข้ากำไรสะสม — ปิดซ้ำไม่ได้';

-- ------------------------------------------------------------------------
-- 5) เปิดปีกลับ
--
--  กลับรายการปิดด้วย reverse_journal_entry ที่มีอยู่แล้ว ไม่ลบของเดิม
--  เพื่อให้ยังเห็นร่องรอยว่าเคยปิดแล้วเปิดกลับเมื่อไร โดยใคร
-- ------------------------------------------------------------------------
create or replace function public.reopen_fiscal_year(
  p_company uuid, p_year int, p_reason text
)
returns json
language plpgsql
security definer
set search_path = public, app
as $fn$
declare cl record; v_rev json;
begin
  if not app.has_perm(p_company, 'period', 'unlock') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์เปิดงวดที่ปิดแล้ว';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'REASON_REQUIRED: ต้องระบุเหตุผลในการเปิดปีกลับ';
  end if;

  select * into cl from public.fiscal_year_closings
   where company_id = p_company and fiscal_year = p_year and reopened_at is null;
  if not found then raise exception 'NOT_CLOSED: ปีบัญชีนี้ยังไม่ได้ปิด'; end if;

  if cl.entry_id is not null then
    -- ลำดับพารามิเตอร์คือ (entry, date, reason) ระบุชื่อไว้กันสลับ
    v_rev := public.reverse_journal_entry(
      p_entry => cl.entry_id, p_date => null, p_reason => p_reason);
  end if;

  update public.fiscal_year_closings
     set reopened_by = auth.uid(), reopened_at = now(),
         note = coalesce(note || ' · ', '') || p_reason
   where id = cl.id;

  return json_build_object('fiscal_year', p_year, 'reversed', v_rev);
end $fn$;

grant execute on function public.reopen_fiscal_year(uuid, int, text) to authenticated;

comment on function public.reopen_fiscal_year is
  'เปิดปีที่ปิดแล้วกลับ โดยกลับรายการปิด ไม่ลบของเดิม ต้องระบุเหตุผลและมีสิทธิ์ปลดล็อกงวด';
