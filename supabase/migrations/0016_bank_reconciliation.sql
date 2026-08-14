-- ============================================================================
-- ONEBOOK 0016 : กระทบยอดธนาคาร (Bank reconciliation)
--
--   bank_statements       ไฟล์ statement ที่นำเข้า 1 ครั้ง = 1 แถว
--   bank_statement_lines  รายการเดินบัญชีจากธนาคาร พร้อมสถานะจับคู่
--   bank_reconciliations  การปิดกระทบยอดของแต่ละช่องทาง ณ วันที่หนึ่ง
--
--   public.bank_auto_match()   จับคู่อัตโนมัติกับรายการรับ-จ่ายเงินในระบบ
--   public.rpt_bank_reconcile() สรุปยอดตามธนาคาร vs ตามบัญชี พร้อมรายการค้าง
--
--   สิทธิ์ : resource 'finance.reconcile' ครอบคลุมโดยสิทธิ์ 'finance' เดิม
-- ============================================================================

do $$ begin
  create type bank_line_status as enum ('unmatched','matched','ignored');
exception when duplicate_object then null; end $$;

create table if not exists public.bank_statements (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  channel_id   uuid not null references public.financial_channels(id) on delete cascade,
  file_name    text,
  period_from  date,
  period_to    date,
  opening_balance numeric(18,2),
  closing_balance numeric(18,2),
  line_count   int not null default 0,
  note         text,
  imported_by  uuid,
  created_at   timestamptz not null default now()
);
create index if not exists bank_stmt_idx on public.bank_statements(company_id, channel_id, period_to desc);

create table if not exists public.bank_statement_lines (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  statement_id  uuid not null references public.bank_statements(id) on delete cascade,
  channel_id    uuid not null references public.financial_channels(id) on delete cascade,
  line_no       int not null default 1,
  txn_date      date not null,
  description   text,
  reference     text,
  -- เงินเข้า = deposit, เงินออก = withdrawal (เก็บเป็นบวกทั้งคู่)
  deposit       numeric(18,2) not null default 0,
  withdrawal    numeric(18,2) not null default 0,
  balance       numeric(18,2),
  status        bank_line_status not null default 'unmatched',
  payment_id    uuid references public.payments(id) on delete set null,
  entry_id      uuid references public.journal_entries(id) on delete set null,
  match_score   numeric(5,2),                 -- ความมั่นใจในการจับคู่อัตโนมัติ 0-100
  matched_by    uuid,
  matched_at    timestamptz,
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists bank_line_stmt_idx   on public.bank_statement_lines(statement_id, line_no);
create index if not exists bank_line_status_idx on public.bank_statement_lines(company_id, channel_id, status, txn_date);
create unique index if not exists bank_line_payment_uidx
  on public.bank_statement_lines(payment_id) where payment_id is not null;

create table if not exists public.bank_reconciliations (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  channel_id        uuid not null references public.financial_channels(id) on delete cascade,
  as_of             date not null,
  statement_balance numeric(18,2) not null default 0,
  book_balance      numeric(18,2) not null default 0,
  difference        numeric(18,2) not null default 0,
  unmatched_bank    int not null default 0,
  unmatched_book    int not null default 0,
  note              text,
  closed_by         uuid,
  closed_at         timestamptz not null default now(),
  unique (company_id, channel_id, as_of)
);

alter table public.bank_statements      enable row level security;
alter table public.bank_statement_lines enable row level security;
alter table public.bank_reconciliations enable row level security;

drop policy if exists "bank_stmt_sel" on public.bank_statements;
drop policy if exists "bank_stmt_all" on public.bank_statements;
create policy "bank_stmt_sel" on public.bank_statements for select to authenticated
  using (app.has_perm(company_id,'finance.reconcile','view'));
create policy "bank_stmt_all" on public.bank_statements for all to authenticated
  using (app.has_perm(company_id,'finance.reconcile','edit'))
  with check (app.has_perm(company_id,'finance.reconcile','edit'));

drop policy if exists "bank_line_sel" on public.bank_statement_lines;
drop policy if exists "bank_line_all" on public.bank_statement_lines;
create policy "bank_line_sel" on public.bank_statement_lines for select to authenticated
  using (app.has_perm(company_id,'finance.reconcile','view'));
create policy "bank_line_all" on public.bank_statement_lines for all to authenticated
  using (app.has_perm(company_id,'finance.reconcile','edit'))
  with check (app.has_perm(company_id,'finance.reconcile','edit'));

drop policy if exists "bank_rec_sel" on public.bank_reconciliations;
drop policy if exists "bank_rec_all" on public.bank_reconciliations;
create policy "bank_rec_sel" on public.bank_reconciliations for select to authenticated
  using (app.has_perm(company_id,'finance.reconcile','view'));
create policy "bank_rec_all" on public.bank_reconciliations for all to authenticated
  using (app.has_perm(company_id,'finance.reconcile','edit'))
  with check (app.has_perm(company_id,'finance.reconcile','edit'));

-- --------------------------------------------------------- จับคู่อัตโนมัติ
-- เกณฑ์ : จำนวนเงินตรงกันพอดี + ทิศทางตรงกัน + วันที่ห่างกันไม่เกิน p_day_window
--         คะแนน 100 = วันเดียวกัน ลดลงตามจำนวนวันที่ห่าง
--         จับคู่เฉพาะรายการที่มี "คู่เดียวเท่านั้น" เพื่อไม่ให้จับผิดตัว
create or replace function public.bank_auto_match(p_statement uuid, p_day_window int default 5)
returns int language plpgsql security definer set search_path = public, app as $$
declare
  st      record;
  l       record;
  v_pay   uuid;
  v_cnt   int;
  v_diff  int;
  v_total int := 0;
begin
  select * into st from public.bank_statements where id = p_statement;
  if not found then raise exception 'STATEMENT_NOT_FOUND'; end if;
  if not app.has_perm(st.company_id,'finance.reconcile','edit') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์กระทบยอดธนาคาร';
  end if;

  for l in
    select * from public.bank_statement_lines
    where statement_id = p_statement and status = 'unmatched'
    order by line_no
  loop
    -- หาผู้เข้าคู่ที่ยังไม่ถูกจับคู่
    -- min() ใช้กับ uuid ไม่ได้ จึงเก็บเป็น array แล้วหยิบตัวแรก
    select count(*), (array_agg(p.id))[1]
      into v_cnt, v_pay
    from public.payments p
    where p.company_id = st.company_id
      and p.channel_id = st.channel_id
      and p.status <> 'void'
      and abs(p.doc_date - l.txn_date) <= p_day_window
      and (
        (l.deposit    > 0 and p.direction = 'receive' and p.amount = l.deposit) or
        (l.withdrawal > 0 and p.direction = 'pay'     and p.amount = l.withdrawal)
      )
      and not exists (
        select 1 from public.bank_statement_lines bl
        where bl.payment_id = p.id
      );

    if v_cnt = 1 then
      select abs(p.doc_date - l.txn_date) into v_diff from public.payments p where p.id = v_pay;
      update public.bank_statement_lines
         set status = 'matched',
             payment_id = v_pay,
             match_score = greatest(100 - (v_diff * 10), 50),
             matched_by = auth.uid(),
             matched_at = now()
       where id = l.id;
      v_total := v_total + 1;
    end if;
  end loop;

  return v_total;
end $$;

-- ------------------------------------------------------------ สรุปกระทบยอด
create or replace function public.rpt_bank_reconcile(
  p_company uuid, p_channel uuid, p_as_of date
) returns json language plpgsql stable security definer set search_path = public, app as $$
declare
  v_acc        uuid;
  v_opening    numeric(18,2);
  v_book       numeric(18,2);
  v_stmt       numeric(18,2);
  v_unm_bank   int;
  v_unm_amount numeric(18,2);
  v_unm_book   int;
begin
  if not (app.has_perm(p_company,'finance.reconcile','view') or app.has_perm(p_company,'report','view')) then
    return null;
  end if;

  select account_id, opening_balance into v_acc, v_opening
  from public.financial_channels where id = p_channel and company_id = p_company;

  -- ยอดตามบัญชี = ยอดยกมาของช่องทาง + ความเคลื่อนไหวในบัญชีแยกประเภท
  select coalesce(v_opening,0) + coalesce(sum(jl.debit - jl.credit), 0) into v_book
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.entry_id and je.status = 'posted'
  where jl.company_id = p_company and jl.account_id = v_acc and je.entry_date <= p_as_of;

  -- ยอดตาม statement = ยอดคงเหลือบรรทัดสุดท้ายที่ไม่เกินวันที่กำหนด
  select bl.balance into v_stmt
  from public.bank_statement_lines bl
  where bl.company_id = p_company and bl.channel_id = p_channel
    and bl.txn_date <= p_as_of and bl.balance is not null
  order by bl.txn_date desc, bl.line_no desc
  limit 1;

  select count(*), coalesce(sum(bl.deposit - bl.withdrawal), 0)
    into v_unm_bank, v_unm_amount
  from public.bank_statement_lines bl
  where bl.company_id = p_company and bl.channel_id = p_channel
    and bl.txn_date <= p_as_of and bl.status = 'unmatched';

  -- รายการในระบบที่ยังไม่ปรากฏใน statement
  select count(*) into v_unm_book
  from public.payments p
  where p.company_id = p_company and p.channel_id = p_channel
    and p.status <> 'void' and p.doc_date <= p_as_of
    and not exists (select 1 from public.bank_statement_lines bl where bl.payment_id = p.id);

  return json_build_object(
    'as_of', p_as_of,
    'book_balance', coalesce(v_book,0),
    'statement_balance', coalesce(v_stmt,0),
    'difference', coalesce(v_stmt,0) - coalesce(v_book,0),
    'unmatched_bank_count', v_unm_bank,
    'unmatched_bank_amount', v_unm_amount,
    'unmatched_book_count', v_unm_book
  );
end $$;

grant execute on function public.bank_auto_match(uuid,int) to authenticated;
grant execute on function public.rpt_bank_reconcile(uuid,uuid,date) to authenticated;
