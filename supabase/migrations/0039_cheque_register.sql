-- =====================================================================
-- 0039 : ทะเบียนเช็ค
--
--  ปัญหาเดิม : เช็คถูกบันทึกเหมือนเงินสด พอรับเช็คมายอดเงินฝากขึ้นทันที
--  ทั้งที่เช็คยังไม่ขึ้นเงิน ยอดเงินในระบบจึงสูงกว่าความจริงเสมอ
--  และไม่มีที่ไหนบอกว่าเช็คใบไหนถึงกำหนดวันไหน หรือใบไหนเด้งกลับมา
--
--  วิธีที่เลือก : ต่อยอดของเดิม ไม่รื้อกลไกรับ-จ่ายเงิน
--    channel_kind มีค่า 'cheque' อยู่แล้วตั้งแต่ต้น
--    เปิดช่องทางการเงินชนิดเช็คที่ผูกกับบัญชีพักเช็ค
--    การรับ-จ่ายเงินผ่านช่องทางนั้นจะลงบัญชีพักให้เองด้วยกลไกเดิม
--    ทะเบียนนี้จึงรับผิดชอบแค่สองเรื่อง คือ "ขึ้นเงิน" กับ "เช็คเด้ง"
--
--  ขึ้นเงิน  เช็ครับ : เดบิต เงินฝากธนาคาร / เครดิต เช็ครับลงวันที่ล่วงหน้า
--            เช็คจ่าย : เดบิต เช็คจ่ายลงวันที่ล่วงหน้า / เครดิต เงินฝากธนาคาร
--  เช็คเด้ง  เช็ครับ : เดบิต ลูกหนี้การค้า / เครดิต เช็ครับ (หนี้กลับมาเป็นลูกหนี้)
--            เช็คจ่าย : เดบิต เช็คจ่าย / เครดิต เจ้าหนี้การค้า
-- =====================================================================

-- บัญชีพักเช็ค จำเป็นต้องมี ไม่งั้นแยกเงินที่ยังไม่ขึ้นออกจากเงินฝากไม่ได้
-- ใส่เฉพาะบริษัทที่ยังไม่มี และเลือกรหัสที่ยังว่างอยู่ในผังมาตรฐาน
insert into public.accounts (company_id, code, name_th, name_en, type, parent_code, system_key, normal_side, is_system)
select c.id, '1121', 'เช็ครับลงวันที่ล่วงหน้า', 'Post-dated cheques received', 'asset', '1120', 'cheque_in', 'D', true
from public.companies c
where not exists (select 1 from public.accounts a
                  where a.company_id = c.id and (a.code = '1121' or a.system_key = 'cheque_in'));

insert into public.accounts (company_id, code, name_th, name_en, type, parent_code, system_key, normal_side, is_system)
select c.id, '2115', 'เช็คจ่ายลงวันที่ล่วงหน้า', 'Post-dated cheques issued', 'liability', '2100', 'cheque_out', 'C', true
from public.companies c
where not exists (select 1 from public.accounts a
                  where a.company_id = c.id and (a.code = '2115' or a.system_key = 'cheque_out'));

do $$ begin
  create type cheque_status as enum ('pending','cleared','bounced','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.cheques (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  -- ใช้ค่าเดียวกับ payments.direction ที่มีอยู่แล้ว ไม่สร้างศัพท์ใหม่ให้สับสน
  direction     text not null check (direction in ('receive','pay')),
  cheque_number text not null,
  bank_name     text,
  cheque_date   date,                                -- วันที่หน้าเช็ค
  due_date      date not null,                       -- วันที่ขึ้นเงินได้
  amount        numeric(18,2) not null check (amount > 0),
  contact_id    uuid references public.contacts(id),
  payment_id    uuid references public.payments(id) on delete set null,
  -- บัญชีธนาคารที่จะเอาเช็คไปเข้า หรือที่เช็คจะถูกตัดออก
  channel_id    uuid references public.financial_channels(id),
  status        cheque_status not null default 'pending',
  cleared_date  date,
  bounce_reason text,
  note          text,
  journal_entry_id uuid,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (company_id, direction, cheque_number)
);

create index if not exists cheques_due_idx on public.cheques (company_id, status, due_date);

alter table public.cheques enable row level security;
alter table public.cheques force  row level security;

drop policy if exists "cheques_sel" on public.cheques;
create policy "cheques_sel" on public.cheques for select to authenticated
  using (app.has_perm(company_id, 'finance.payments', 'view'));
drop policy if exists "cheques_all" on public.cheques;
create policy "cheques_all" on public.cheques for all to authenticated
  using (app.has_perm(company_id, 'finance.payments', 'edit'))
  with check (app.has_perm(company_id, 'finance.payments', 'edit'));

-- เช็คที่ขึ้นเงินหรือเด้งไปแล้ว ห้ามแก้ยอดหรือเลขที่ย้อนหลัง
create or replace function app.cheque_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and old.status in ('cleared','bounced')
     and (new.amount is distinct from old.amount
          or new.cheque_number is distinct from old.cheque_number
          or new.direction is distinct from old.direction) then
    raise exception 'CHEQUE_SETTLED: เช็คที่ขึ้นเงินหรือเด้งแล้ว แก้ยอดหรือเลขที่ไม่ได้';
  end if;
  if tg_op = 'DELETE' and old.status in ('cleared','bounced') then
    raise exception 'CHEQUE_SETTLED: เช็คที่ขึ้นเงินหรือเด้งแล้ว ลบไม่ได้';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists cheque_guard on public.cheques;
create trigger cheque_guard before update or delete on public.cheques
  for each row execute function app.cheque_guard();

-- ------------------------------------------------------------------------
-- ขึ้นเงิน
-- ------------------------------------------------------------------------
create or replace function public.clear_cheque(
  p_cheque  uuid,
  p_date    date default current_date,
  p_channel uuid default null
)
returns json
language plpgsql
security definer
set search_path = public, app
as $$
declare
  ch      public.cheques%rowtype;
  v_entry uuid;
  v_bank  uuid;
  v_hold  uuid;
  v_ch    uuid;
begin
  select * into ch from public.cheques where id = p_cheque;
  if not found then raise exception 'CHEQUE_NOT_FOUND'; end if;

  if not app.has_perm(ch.company_id, 'finance.payments', 'edit') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์จัดการเช็ค';
  end if;
  if ch.status <> 'pending' then
    raise exception 'CHEQUE_NOT_PENDING: เช็คใบนี้ไม่ได้อยู่ในสถานะรอขึ้นเงิน';
  end if;
  perform app.assert_period_open(ch.company_id, p_date);

  v_ch := coalesce(p_channel, ch.channel_id);
  if v_ch is null then raise exception 'NO_CHANNEL: ยังไม่ได้ระบุบัญชีธนาคารที่จะนำเช็คเข้า'; end if;

  select account_id into v_bank from public.financial_channels
  where id = v_ch and company_id = ch.company_id;
  if v_bank is null then raise exception 'NO_CHANNEL_ACCOUNT: ช่องทางการเงินนี้ยังไม่ได้ผูกบัญชี'; end if;

  v_hold := app.acc(ch.company_id, case ch.direction when 'receive' then 'cheque_in' else 'cheque_out' end);

  -- ล็อกสถานะก่อนลงบัญชี กันกดขึ้นเงินซ้ำจากสองหน้าจอ
  update public.cheques
     set status = 'cleared', cleared_date = p_date, channel_id = v_ch, updated_at = now()
   where id = p_cheque and status = 'pending';
  if not found then raise exception 'CHEQUE_RACE: เช็คใบนี้ถูกจัดการไปแล้ว'; end if;

  insert into public.journal_entries(company_id, entry_number, entry_date, book, description,
    source_type, source_id, status, is_auto, created_by, posted_by, posted_at)
  values (ch.company_id, app.next_entry_number(ch.company_id, 'ADJ', p_date), p_date, 'ADJ',
    'ขึ้นเงินเช็ค ' || ch.cheque_number, 'cheque', p_cheque, 'posted', true,
    auth.uid(), auth.uid(), now())
  returning id into v_entry;

  if ch.direction = 'receive' then
    insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
    values (v_entry, ch.company_id, 1, v_bank, 'เช็ครับขึ้นเงิน ' || ch.cheque_number, ch.amount, 0, ch.contact_id),
           (v_entry, ch.company_id, 2, v_hold, 'ตัดเช็ครับลงวันที่ล่วงหน้า', 0, ch.amount, ch.contact_id);
  else
    insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
    values (v_entry, ch.company_id, 1, v_hold, 'ตัดเช็คจ่ายลงวันที่ล่วงหน้า', ch.amount, 0, ch.contact_id),
           (v_entry, ch.company_id, 2, v_bank, 'เช็คจ่ายถูกขึ้นเงิน ' || ch.cheque_number, 0, ch.amount, ch.contact_id);
  end if;

  update public.cheques set journal_entry_id = v_entry where id = p_cheque;
  return json_build_object('ok', true, 'journal_entry_id', v_entry);
end $$;

grant execute on function public.clear_cheque(uuid, date, uuid) to authenticated;

-- ------------------------------------------------------------------------
-- เช็คเด้ง : หนี้กลับมาเป็นลูกหนี้/เจ้าหนี้ตามเดิม
-- ------------------------------------------------------------------------
create or replace function public.bounce_cheque(
  p_cheque uuid,
  p_date   date default current_date,
  p_reason text default null
)
returns json
language plpgsql
security definer
set search_path = public, app
as $$
declare
  ch      public.cheques%rowtype;
  v_entry uuid;
  v_hold  uuid;
  v_party uuid;
begin
  select * into ch from public.cheques where id = p_cheque;
  if not found then raise exception 'CHEQUE_NOT_FOUND'; end if;

  if not app.has_perm(ch.company_id, 'finance.payments', 'edit') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์จัดการเช็ค';
  end if;
  if ch.status <> 'pending' then
    raise exception 'CHEQUE_NOT_PENDING: เช็คใบนี้ไม่ได้อยู่ในสถานะรอขึ้นเงิน';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'NEED_REASON: ต้องระบุเหตุผลที่เช็คเด้ง';
  end if;
  perform app.assert_period_open(ch.company_id, p_date);

  v_hold  := app.acc(ch.company_id, case ch.direction when 'receive' then 'cheque_in' else 'cheque_out' end);
  v_party := app.acc(ch.company_id, case ch.direction when 'receive' then 'ar' else 'ap' end);

  update public.cheques
     set status = 'bounced', bounce_reason = p_reason, updated_at = now()
   where id = p_cheque and status = 'pending';
  if not found then raise exception 'CHEQUE_RACE: เช็คใบนี้ถูกจัดการไปแล้ว'; end if;

  insert into public.journal_entries(company_id, entry_number, entry_date, book, description,
    source_type, source_id, status, is_auto, created_by, posted_by, posted_at)
  values (ch.company_id, app.next_entry_number(ch.company_id, 'ADJ', p_date), p_date, 'ADJ',
    'เช็คเด้ง ' || ch.cheque_number || ' — ' || p_reason, 'cheque', p_cheque, 'posted', true,
    auth.uid(), auth.uid(), now())
  returning id into v_entry;

  if ch.direction = 'receive' then
    insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
    values (v_entry, ch.company_id, 1, v_party, 'ลูกหนี้กลับมาจากเช็คเด้ง', ch.amount, 0, ch.contact_id),
           (v_entry, ch.company_id, 2, v_hold, 'ตัดเช็ครับที่เด้ง', 0, ch.amount, ch.contact_id);
  else
    insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
    values (v_entry, ch.company_id, 1, v_hold, 'ตัดเช็คจ่ายที่เด้ง', ch.amount, 0, ch.contact_id),
           (v_entry, ch.company_id, 2, v_party, 'เจ้าหนี้กลับมาจากเช็คเด้ง', 0, ch.amount, ch.contact_id);
  end if;

  update public.cheques set journal_entry_id = v_entry where id = p_cheque;
  return json_build_object('ok', true, 'journal_entry_id', v_entry);
end $$;

grant execute on function public.bounce_cheque(uuid, date, text) to authenticated;

-- ------------------------------------------------------------------------
-- ทะเบียนเช็คพร้อมสรุปยอดที่ยังไม่ขึ้นเงิน
-- ------------------------------------------------------------------------
create or replace function public.rpt_cheques(
  p_company uuid,
  p_filter  text default 'pending',   -- pending | due_soon | overdue | cleared | bounced | all
  p_q       text default null
)
returns json
language sql
stable
set search_path = public, app
as $$
with args as (
  select '%' || replace(replace(btrim(coalesce(p_q,'')),'%','\%'),'_','\_') || '%' as pat,
         nullif(btrim(coalesce(p_q,'')),'') as raw
),
rows as (
  select c.id, c.direction, c.cheque_number, c.bank_name, c.cheque_date, c.due_date,
         c.amount, c.status::text, c.cleared_date, c.bounce_reason, c.note,
         ct.name as contact_name, fc.name as channel_name,
         (current_date - c.due_date)::int as days_late
  from public.cheques c
  left join public.contacts ct on ct.id = c.contact_id
  left join public.financial_channels fc on fc.id = c.channel_id
  cross join args a
  where c.company_id = p_company
    and (a.raw is null or c.cheque_number ilike a.pat or ct.name ilike a.pat or c.bank_name ilike a.pat)
)
select json_build_object(
  'rows', coalesce((
    select jsonb_agg(to_jsonb(x) order by x.due_date)
    from (
      select * from rows
      where p_filter is null or p_filter = 'all'
         or (p_filter = 'pending'  and status = 'pending')
         or (p_filter = 'cleared'  and status = 'cleared')
         or (p_filter = 'bounced'  and status = 'bounced')
         or (p_filter = 'overdue'  and status = 'pending' and days_late > 0)
         or (p_filter = 'due_soon' and status = 'pending' and days_late between -7 and 0)
    ) x
  ), '[]'::jsonb),
  'summary', json_build_object(
    -- ยอดสองก้อนนี้คือหัวใจ : เงินที่ยังไม่ใช่เงินจริงในมือ
    'pending_in',   (select coalesce(sum(amount),0) from rows where status='pending' and direction='receive'),
    'pending_out',  (select coalesce(sum(amount),0) from rows where status='pending' and direction='pay'),
    'pending_count',(select count(*) from rows where status='pending'),
    'overdue',      (select count(*) from rows where status='pending' and days_late > 0),
    'due_soon',     (select count(*) from rows where status='pending' and days_late between -7 and 0),
    'bounced',      (select count(*) from rows where status='bounced')
  )
);
$$;

grant execute on function public.rpt_cheques(uuid, text, text) to authenticated;

comment on table public.cheques is
  'ทะเบียนเช็ค — แยกเงินที่ยังไม่ขึ้นเงินออกจากยอดเงินฝาก และรองรับเช็คเด้ง';
