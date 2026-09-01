-- =====================================================================
-- 0064 : รายการซ้ำอัตโนมัติ · ค่าใช้จ่ายค้างจ่าย · ค่าใช้จ่ายจ่ายล่วงหน้า
--
--  ทั้งสามเรื่องไม่มีในระบบเลย ค้นทั้งฐานข้อมูลแล้วไม่พบ
--  ค่าเช่ารายเดือน ประกันที่ตัดจ่าย 12 งวด และค่าใช้จ่ายค้างจ่ายสิ้นเดือน
--  ต้องคีย์เองทุกเดือน ซึ่งเป็นงานซ้ำที่ลืมง่ายและคีย์ผิดง่าย
--
-- ---------------------------------------------------------------------
--  แบ่งเป็นสองกลไก เพราะรูปแบบตัวเลขต่างกันจริง
--
--  1) แม่แบบรายการซ้ำ (recurring_journals)
--     ตัวเลขเท่ากันทุกงวด เช่น ค่าเช่า 30,000 ทุกวันที่ 1
--     ตั้ง auto_reverse ได้ กลายเป็นค่าใช้จ่ายค้างจ่ายทันที
--     คือลงวันสิ้นเดือน แล้วกลับรายการวันแรกของเดือนถัดไป
--
--  2) ตารางตัดจ่าย (amortizations)
--     ก้อนเดียวหารเป็นงวด เช่น ประกัน 120,000 ตัด 12 เดือน
--     งวดสุดท้ายรับเศษที่หารไม่ลงตัว เพื่อให้ผลรวมเท่าก้อนตั้งต้นเป๊ะ
--
-- ---------------------------------------------------------------------
--  ทำงานซ้ำได้โดยไม่พัง
--
--  ทั้งสองตัวจดว่างวดไหนสร้างไปแล้ว แล้วข้ามงวดนั้น
--  กดปุ่มสองครั้งหรือรันงานตั้งเวลาซ้ำ จะไม่ได้รายการซ้ำ
--  ข้อนี้สำคัญกว่าที่คิด เพราะรายการซ้ำที่ลงสองรอบหาเจอยากมาก
--
--  งวดที่ปิดแล้วจะถูกข้ามพร้อมรายงานเหตุผล ไม่ใช่ล้มทั้งชุด
-- =====================================================================

-- ------------------------------------------------------------------------
-- 1) แม่แบบรายการซ้ำ
-- ------------------------------------------------------------------------
create table if not exists public.recurring_journals (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  name          text not null,
  description   text not null,
  book          text not null default 'GL',
  frequency     text not null default 'monthly',
  day_of_month  smallint not null default 1,
  start_date    date not null,
  end_date      date,
  next_date     date not null,
  -- ค่าใช้จ่ายค้างจ่าย : ลงวันสิ้นงวด แล้วกลับรายการวันแรกของงวดถัดไป
  auto_reverse  boolean not null default false,
  is_active     boolean not null default true,
  last_run_date date,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint recurring_freq_chk check (frequency in ('monthly','quarterly','yearly')),
  constraint recurring_book_chk check (book in ('GL','ADJ')),
  constraint recurring_dom_chk  check (day_of_month between 1 and 31),
  constraint recurring_end_chk  check (end_date is null or end_date >= start_date)
);

create index if not exists recurring_company_idx
  on public.recurring_journals (company_id, is_active, next_date);

comment on table public.recurring_journals is
  'แม่แบบรายการซ้ำ — ตัวเลขเท่ากันทุกงวด ตั้ง auto_reverse เพื่อใช้เป็นค่าใช้จ่ายค้างจ่าย';
comment on column public.recurring_journals.day_of_month is
  'วันที่ในเดือนที่จะลงรายการ เกินจำนวนวันของเดือนนั้นจะเลื่อนเป็นวันสุดท้ายของเดือน';

create table if not exists public.recurring_journal_lines (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references public.recurring_journals(id) on delete cascade,
  company_id   uuid not null references public.companies(id) on delete cascade,
  line_no      int not null default 1,
  account_id   uuid not null references public.accounts(id) on delete restrict,
  description  text,
  debit        numeric(18,2) not null default 0,
  credit       numeric(18,2) not null default 0,
  contact_id   uuid references public.contacts(id),
  dimension_id uuid references public.dimensions(id),
  constraint recurring_line_side_chk check (debit >= 0 and credit >= 0 and (debit = 0 or credit = 0))
);

create index if not exists recurring_lines_tpl_idx on public.recurring_journal_lines (template_id, line_no);

-- ------------------------------------------------------------------------
-- 2) ตารางตัดจ่ายค่าใช้จ่ายจ่ายล่วงหน้า
-- ------------------------------------------------------------------------
create table if not exists public.amortizations (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies(id) on delete cascade,
  name               text not null,
  document_id        uuid references public.documents(id) on delete set null,
  prepaid_account_id uuid not null references public.accounts(id) on delete restrict,
  expense_account_id uuid not null references public.accounts(id) on delete restrict,
  dimension_id       uuid references public.dimensions(id),
  total_amount       numeric(18,2) not null,
  months             smallint not null,
  start_date         date not null,
  posted_periods     smallint not null default 0,
  is_active          boolean not null default true,
  note               text,
  created_by         uuid references public.profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint amort_months_chk check (months between 1 and 600),
  constraint amort_total_chk  check (total_amount > 0),
  constraint amort_posted_chk check (posted_periods >= 0 and posted_periods <= months)
);

create index if not exists amort_company_idx on public.amortizations (company_id, is_active);

comment on table public.amortizations is
  'ตารางตัดจ่ายค่าใช้จ่ายจ่ายล่วงหน้า — posted_periods บอกว่าตัดไปแล้วกี่งวด ใช้กันสร้างซ้ำ';

-- ------------------------------------------------------------------------
-- 3) รายการที่แต่ละงวดสร้างขึ้น
--
--  จดไว้ว่างวดไหนของแม่แบบไหนสร้างไปแล้ว เพื่อกันสร้างซ้ำ
--  ใช้ตารางเดียวกันทั้งสองกลไก แยกด้วย kind
-- ------------------------------------------------------------------------
create table if not exists public.recurring_runs (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  kind        text not null,
  source_id   uuid not null,
  period_key  text not null,
  entry_id    uuid references public.journal_entries(id) on delete set null,
  reverse_id  uuid references public.journal_entries(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint recurring_runs_kind_chk check (kind in ('recurring','amortization')),
  unique (kind, source_id, period_key)
);

create index if not exists recurring_runs_co_idx on public.recurring_runs (company_id, kind);

comment on table public.recurring_runs is
  'บันทึกว่างวดไหนสร้างรายการไปแล้ว — ดัชนี unique เป็นตัวกันการสร้างซ้ำจริง ๆ';

-- ------------------------------------------------------------------------
-- 4) RLS
-- ------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['recurring_journals','recurring_journal_lines','amortizations','recurring_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists "%1$s_sel" on public.%1$I', t);
    execute format($p$create policy "%1$s_sel" on public.%1$I for select to authenticated
                     using (app.has_perm(company_id, 'journal', 'view'))$p$, t);
    execute format('drop policy if exists "%1$s_all" on public.%1$I', t);
    execute format($p$create policy "%1$s_all" on public.%1$I for all to authenticated
                     using (app.has_perm(company_id, 'journal', 'edit'))
                     with check (app.has_perm(company_id, 'journal', 'edit'))$p$, t);
    execute format('drop trigger if exists trg_audit_%1$s on public.%1$I', t);
    execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$I
                    for each row execute function app.audit_trigger()', t);
  end loop;
end $$;

drop trigger if exists trg_recurring_touch on public.recurring_journals;
create trigger trg_recurring_touch before update on public.recurring_journals
  for each row execute function app.touch_updated_at();

drop trigger if exists trg_amort_touch on public.amortizations;
create trigger trg_amort_touch before update on public.amortizations
  for each row execute function app.touch_updated_at();

-- ------------------------------------------------------------------------
-- 5) วันที่ลงรายการของงวดหนึ่ง
--
--  ตั้งวันที่ 31 แต่เดือนกุมภาพันธ์มี 28 วัน ต้องเลื่อนเป็นวันสุดท้ายของเดือน
--  ไม่ใช่ล้นไปเดือนถัดไป ซึ่งเป็นข้อผิดพลาดที่เจอบ่อยเวลาบวกวันตรง ๆ
-- ------------------------------------------------------------------------
create or replace function app.clamp_day(p_year int, p_month int, p_day int)
returns date
language sql
immutable
as $fn$
  select make_date(p_year, p_month,
    least(p_day, extract(day from (make_date(p_year, p_month, 1) + interval '1 month - 1 day'))::int));
$fn$;

comment on function app.clamp_day is
  'วันที่ในเดือนโดยไม่ล้นเดือน — วันที่ 31 ในเดือนกุมภาพันธ์ได้วันสุดท้ายของเดือนแทน';

-- ------------------------------------------------------------------------
-- 5b) งวดนี้ปิดแล้วหรือยัง
--
--  ตั้งใจไม่ใช้ app.assert_period_open เพราะตัวนั้นปล่อยผ่านให้ผู้มีสิทธิ์ปลดล็อก
--  การสร้างรายการอัตโนมัติเข้างวดที่ปิดแล้วโดยเงียบ ๆ เป็นเรื่องที่ไม่ควรเกิด
--  ต่อให้คนกดปุ่มมีสิทธิ์ปลดล็อกก็ตาม ให้ข้ามงวดนั้นแล้วรายงานแทน
-- ------------------------------------------------------------------------
create or replace function app.is_period_locked(
  p_company uuid, p_date date, p_scope text default 'all'
)
returns boolean
language sql
stable
security definer
set search_path = public, app
as $fn$
  select coalesce(app.locked_through(p_company, p_scope) >= p_date, false);
$fn$;

comment on function app.is_period_locked is
  'งวดของวันที่นี้ถูกปิดหรือยัง — ไม่มีข้อยกเว้นให้ผู้มีสิทธิ์ปลดล็อก ต่างจาก assert_period_open';

-- ------------------------------------------------------------------------
-- 6) สร้างรายการซ้ำที่ถึงกำหนด
--
--  วนสร้างย้อนหลังให้ครบทุกงวดที่ค้าง ไม่ใช่สร้างแค่งวดล่าสุด
--  เพราะถ้าไม่ได้เข้าระบบสามเดือน ต้องได้ครบสามงวด ไม่ใช่งวดเดียว
-- ------------------------------------------------------------------------
create or replace function public.generate_recurring(
  p_company uuid, p_as_of date default current_date
)
returns json
language plpgsql
security definer
set search_path = public, app
as $fn$
declare
  tpl record;
  v_date date; v_key text; v_lines jsonb; v_res json; v_entry uuid;
  v_made int := 0; v_skipped int := 0;
  v_notes jsonb := '[]'::jsonb;
  v_guard int;
  v_rev_date date; v_rev_lines jsonb; v_rev json;
begin
  if not app.has_perm(p_company, 'journal', 'post') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์ผ่านรายการ';
  end if;

  for tpl in
    select * from public.recurring_journals
    where company_id = p_company and is_active and next_date <= p_as_of
    order by next_date
  loop
    v_date := tpl.next_date;
    v_guard := 0;

    -- วนจนกว่าจะเลยวันที่กำหนด หรือเลยวันสิ้นสุดของแม่แบบ
    while v_date <= p_as_of and (tpl.end_date is null or v_date <= tpl.end_date) loop
      v_guard := v_guard + 1;
      exit when v_guard > 120;   -- กันวนไม่รู้จบถ้าข้อมูลเพี้ยน

      v_key := to_char(v_date, 'YYYY-MM-DD');

      if exists (select 1 from public.recurring_runs
                 where kind = 'recurring' and source_id = tpl.id and period_key = v_key) then
        v_skipped := v_skipped + 1;
      elsif app.is_period_locked(p_company, v_date, 'journal')
         or app.is_period_locked(p_company, v_date, 'all') then
        -- งวดปิดแล้วข้ามไป ไม่ล้มทั้งชุด แล้วรายงานให้ผู้ใช้เห็น
        v_skipped := v_skipped + 1;
        v_notes := v_notes || jsonb_build_array(jsonb_build_object(
          'template', tpl.name, 'date', v_date, 'reason', 'period_locked'));
      else
        select jsonb_agg(jsonb_build_object(
                 'account_id', l.account_id,
                 'description', coalesce(l.description, tpl.description),
                 'debit', l.debit, 'credit', l.credit,
                 'contact_id', l.contact_id, 'dimension_id', l.dimension_id)
               order by l.line_no)
          into v_lines
          from public.recurring_journal_lines l where l.template_id = tpl.id;

        if v_lines is null or jsonb_array_length(v_lines) < 2 then
          v_skipped := v_skipped + 1;
          v_notes := v_notes || jsonb_build_array(jsonb_build_object(
            'template', tpl.name, 'date', v_date, 'reason', 'no_lines'));
        else
          v_res := public.save_journal_entry(
            p_company, v_date, tpl.description, v_lines, tpl.book, true, null, tpl.name);
          v_entry := (v_res->>'entry_id')::uuid;

          -- ค่าใช้จ่ายค้างจ่าย : กลับรายการวันแรกของงวดถัดไป
          if tpl.auto_reverse then
            v_rev_date := (date_trunc('month', v_date) + interval '1 month')::date;
            if not app.is_period_locked(p_company, v_rev_date, 'all') then
              select jsonb_agg(jsonb_build_object(
                       'account_id', l.account_id,
                       'description', coalesce(l.description, tpl.description),
                       'debit', l.credit, 'credit', l.debit,
                       'contact_id', l.contact_id, 'dimension_id', l.dimension_id)
                     order by l.line_no)
                into v_rev_lines
                from public.recurring_journal_lines l where l.template_id = tpl.id;
              v_rev := public.save_journal_entry(
                p_company, v_rev_date, tpl.description, v_rev_lines, tpl.book, true, null, tpl.name);
            end if;
          end if;

          insert into public.recurring_runs(company_id, kind, source_id, period_key, entry_id, reverse_id)
          values (p_company, 'recurring', tpl.id, v_key, v_entry, (v_rev->>'entry_id')::uuid);
          v_made := v_made + 1;
        end if;
      end if;

      -- งวดถัดไป
      v_date := case tpl.frequency
        when 'monthly'   then app.clamp_day(extract(year from v_date + interval '1 month')::int,
                                            extract(month from v_date + interval '1 month')::int, tpl.day_of_month)
        when 'quarterly' then app.clamp_day(extract(year from v_date + interval '3 month')::int,
                                            extract(month from v_date + interval '3 month')::int, tpl.day_of_month)
        else                  app.clamp_day(extract(year from v_date + interval '1 year')::int,
                                            extract(month from v_date + interval '1 year')::int, tpl.day_of_month)
      end;
      v_rev := null;
    end loop;

    update public.recurring_journals
       set next_date = v_date, last_run_date = p_as_of
     where id = tpl.id;
  end loop;

  return json_build_object('created', v_made, 'skipped', v_skipped, 'notes', v_notes);
end $fn$;

grant execute on function public.generate_recurring(uuid, date) to authenticated;

comment on function public.generate_recurring is
  'สร้างรายการซ้ำทุกงวดที่ค้างจนถึงวันที่กำหนด — สร้างซ้ำไม่ได้เพราะจดงวดที่สร้างแล้วไว้';

-- ------------------------------------------------------------------------
-- 7) ตัดจ่ายค่าใช้จ่ายจ่ายล่วงหน้า
--
--  งวดสุดท้ายรับเศษ เพื่อให้ผลรวมทุกงวดเท่าก้อนตั้งต้นพอดี
--  ถ้าหารเท่ากันทุกงวดแล้วปัดทศนิยม ยอดคงเหลือในบัญชีจ่ายล่วงหน้า
--  จะเหลือเศษค้างอยู่ตลอดไป ซึ่งไปโผล่ในงบแสดงฐานะการเงิน
-- ------------------------------------------------------------------------
create or replace function public.generate_amortization(
  p_company uuid, p_as_of date default current_date
)
returns json
language plpgsql
security definer
set search_path = public, app
as $fn$
declare
  am record;
  v_period int; v_date date; v_key text;
  v_each numeric(18,2); v_amt numeric(18,2);
  v_lines jsonb; v_res json;
  v_made int := 0; v_skipped int := 0;
  v_notes jsonb := '[]'::jsonb;
begin
  if not app.has_perm(p_company, 'journal', 'post') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์ผ่านรายการ';
  end if;

  for am in
    select * from public.amortizations
    where company_id = p_company and is_active and posted_periods < months
    order by start_date
  loop
    v_each := round(am.total_amount / am.months, 2);

    for v_period in (am.posted_periods + 1) .. am.months loop
      v_date := (date_trunc('month', am.start_date) + make_interval(months => v_period - 1)
                 + interval '1 month - 1 day')::date;
      exit when v_date > p_as_of;

      v_key := to_char(v_date, 'YYYY-MM-DD');
      if exists (select 1 from public.recurring_runs
                 where kind = 'amortization' and source_id = am.id and period_key = v_key) then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      if app.is_period_locked(p_company, v_date, 'journal')
         or app.is_period_locked(p_company, v_date, 'all') then
        v_skipped := v_skipped + 1;
        v_notes := v_notes || jsonb_build_array(jsonb_build_object(
          'schedule', am.name, 'date', v_date, 'reason', 'period_locked'));
        exit;   -- งวดนี้ปิดแล้ว งวดถัดไปยิ่งไม่ต้องทำ
      end if;

      -- งวดสุดท้ายรับเศษที่หารไม่ลงตัว
      v_amt := case when v_period = am.months
                    then am.total_amount - v_each * (am.months - 1)
                    else v_each end;

      v_lines := jsonb_build_array(
        jsonb_build_object('account_id', am.expense_account_id, 'description', am.name,
                           'debit', v_amt, 'credit', 0, 'dimension_id', am.dimension_id),
        jsonb_build_object('account_id', am.prepaid_account_id, 'description', am.name,
                           'debit', 0, 'credit', v_amt, 'dimension_id', am.dimension_id));

      v_res := public.save_journal_entry(
        p_company, v_date, am.name, v_lines, 'ADJ', true, null, am.name);

      insert into public.recurring_runs(company_id, kind, source_id, period_key, entry_id)
      values (p_company, 'amortization', am.id, v_key, (v_res->>'entry_id')::uuid);

      update public.amortizations set posted_periods = v_period where id = am.id;
      v_made := v_made + 1;
    end loop;
  end loop;

  return json_build_object('created', v_made, 'skipped', v_skipped, 'notes', v_notes);
end $fn$;

grant execute on function public.generate_amortization(uuid, date) to authenticated;

comment on function public.generate_amortization is
  'ตัดจ่ายค่าใช้จ่ายจ่ายล่วงหน้าทุกงวดที่ถึงกำหนด งวดสุดท้ายรับเศษให้ผลรวมเท่าก้อนตั้งต้น';

-- ------------------------------------------------------------------------
-- 8) รายการรอสร้าง สำหรับแสดงบนหน้าจอก่อนกดสร้างจริง
-- ------------------------------------------------------------------------
create or replace function public.rpt_recurring_due(
  p_company uuid, p_as_of date default current_date
)
returns json
language sql
stable
security invoker
set search_path = public, app
as $rd$
  select json_build_object(
    'recurring', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'description', t.description,
        'frequency', t.frequency, 'next_date', t.next_date,
        'auto_reverse', t.auto_reverse,
        'amount', (select coalesce(sum(l.debit), 0) from public.recurring_journal_lines l
                   where l.template_id = t.id)
      ) order by t.next_date)
      from public.recurring_journals t
      where t.company_id = p_company and t.is_active and t.next_date <= p_as_of
        and (t.end_date is null or t.next_date <= t.end_date)), '[]'::jsonb),
    'amortization', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.name,
        'total_amount', a.total_amount, 'months', a.months,
        'posted_periods', a.posted_periods,
        'per_period', round(a.total_amount / a.months, 2),
        'next_date', (date_trunc('month', a.start_date)
                      + make_interval(months => a.posted_periods)
                      + interval '1 month - 1 day')::date
      ) order by a.start_date)
      from public.amortizations a
      where a.company_id = p_company and a.is_active and a.posted_periods < a.months
        and (date_trunc('month', a.start_date)
             + make_interval(months => a.posted_periods)
             + interval '1 month - 1 day')::date <= p_as_of), '[]'::jsonb)
  );
$rd$;

grant execute on function public.rpt_recurring_due(uuid, date) to authenticated;

comment on function public.rpt_recurring_due is
  'รายการซ้ำและตารางตัดจ่ายที่ถึงกำหนดแล้วแต่ยังไม่ได้สร้าง';
