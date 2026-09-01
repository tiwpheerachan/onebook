-- =====================================================================
-- 0063 : กลไกอนุมัติหลายขั้นตามวงเงิน
--
--  ของเดิม : ใครมีสิทธิ์ documents.approve ก็กดอนุมัติได้ทุกใบ ทุกวงเงิน
--  สถานะ awaiting_approval มีอยู่ในระบบตั้งแต่ 0001 แต่ไม่เคยมีอะไรพาเข้าไป
--  และไม่มีตารางกฎการอนุมัติเลย ค้นทั้งฐานข้อมูลแล้วไม่พบ
--
-- ---------------------------------------------------------------------
--  สิ่งที่เพิ่ม
--
--    approval_rules  กฎว่าเอกสารชนิดไหน วงเงินเท่าไร ต้องผ่านใครบ้าง
--    approval_steps  ขั้นตอนจริงของเอกสารแต่ละใบ สร้างตอนส่งอนุมัติ
--
--  ทำไมต้องเก็บขั้นตอนจริงแยกจากกฎ : กฎแก้ได้ตลอดเวลา ถ้าไม่บันทึกไว้
--  เอกสารเก่าจะเปลี่ยนเส้นทางอนุมัติย้อนหลังทุกครั้งที่ใครแก้กฎ
--  ซึ่งทำให้ audit trail ใช้อ้างอิงไม่ได้
--
-- ---------------------------------------------------------------------
--  วงเงินเทียบกับอะไร
--
--  ใช้ grand_total เสมอ ไม่ใช่ net_payable
--  เพราะ net_payable หักภาษี ณ ที่จ่ายและมัดจำไปแล้ว การแบ่งบิลให้
--  หัก ณ ที่จ่ายเยอะ ๆ จะเลี่ยงขั้นอนุมัติได้
--
-- ---------------------------------------------------------------------
--  จุดบังคับใช้
--
--  post_document เป็นทางเดียวที่เอกสารจะได้สถานะ approved
--  จึงตรวจที่นั่น เรียกผ่าน API ตรงก็ข้ามไม่ได้
-- =====================================================================

-- ------------------------------------------------------------------------
-- 1) กฎการอนุมัติ
--
--  doc_kind = null แปลว่าใช้กับเอกสารทุกชนิดที่เข้าเงื่อนไขวงเงิน
--  min_amount รวม, max_amount ไม่รวม (null = ไม่จำกัด)
-- ------------------------------------------------------------------------
create table if not exists public.approval_rules (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  doc_kind    text,
  min_amount  numeric(18,2) not null default 0,
  max_amount  numeric(18,2),
  step_no     smallint not null default 1,
  role_id     uuid not null references public.roles(id) on delete restrict,
  is_active   boolean not null default true,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint approval_rules_step_chk  check (step_no between 1 and 10),
  constraint approval_rules_range_chk check (max_amount is null or max_amount > min_amount),
  constraint approval_rules_min_chk   check (min_amount >= 0)
);

create index if not exists approval_rules_company_idx
  on public.approval_rules (company_id, is_active, step_no);

comment on table public.approval_rules is
  'กฎการอนุมัติตามชนิดเอกสารและวงเงิน — เก็บเป็นกฎอย่างเดียว ขั้นตอนจริงของแต่ละใบอยู่ที่ approval_steps';
comment on column public.approval_rules.doc_kind is
  'null = ใช้กับเอกสารทุกชนิดที่เข้าเงื่อนไขวงเงิน';
comment on column public.approval_rules.max_amount is
  'ไม่รวมค่านี้ (น้อยกว่า) null = ไม่จำกัดเพดาน';

alter table public.approval_rules enable row level security;
alter table public.approval_rules force row level security;

drop policy if exists "approval_rules_sel" on public.approval_rules;
create policy "approval_rules_sel" on public.approval_rules for select to authenticated
  using (app.can_access_company(company_id, auth.uid()));

drop policy if exists "approval_rules_all" on public.approval_rules;
create policy "approval_rules_all" on public.approval_rules for all to authenticated
  using (app.has_perm(company_id, 'settings.roles', 'edit'))
  with check (app.has_perm(company_id, 'settings.roles', 'edit'));

drop trigger if exists trg_approval_rules_touch on public.approval_rules;
create trigger trg_approval_rules_touch before update on public.approval_rules
  for each row execute function app.touch_updated_at();

drop trigger if exists trg_audit_approval_rules on public.approval_rules;
create trigger trg_audit_approval_rules
  after insert or update or delete on public.approval_rules
  for each row execute function app.audit_trigger();

-- ------------------------------------------------------------------------
-- 2) ขั้นตอนอนุมัติจริงของเอกสารแต่ละใบ
-- ------------------------------------------------------------------------
create table if not exists public.approval_steps (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  document_id  uuid not null references public.documents(id) on delete cascade,
  step_no      smallint not null,
  role_id      uuid not null references public.roles(id) on delete restrict,
  status       text not null default 'pending',
  decided_by   uuid references public.profiles(id),
  decided_at   timestamptz,
  note         text,
  created_at   timestamptz not null default now(),
  constraint approval_steps_status_chk check (status in ('pending','approved','rejected')),
  unique (document_id, step_no)
);

create index if not exists approval_steps_doc_idx  on public.approval_steps (document_id, step_no);
create index if not exists approval_steps_role_idx on public.approval_steps (role_id) where status = 'pending';
create index if not exists approval_steps_co_idx   on public.approval_steps (company_id, status);

comment on table public.approval_steps is
  'ขั้นตอนอนุมัติที่บันทึกไว้ตอนส่งอนุมัติ — คัดจากกฎ ณ เวลานั้น กฎเปลี่ยนทีหลังไม่กระทบใบเก่า';

alter table public.approval_steps enable row level security;
alter table public.approval_steps force row level security;

drop policy if exists "approval_steps_sel" on public.approval_steps;
create policy "approval_steps_sel" on public.approval_steps for select to authenticated
  using (app.has_perm(company_id, 'documents', 'view'));

-- แก้ผ่านฟังก์ชันเท่านั้น ไม่ให้ update ตรง ๆ เพราะต้องตรวจลำดับขั้นและบทบาท
drop policy if exists "approval_steps_ins" on public.approval_steps;
create policy "approval_steps_ins" on public.approval_steps for insert to authenticated
  with check (false);

drop trigger if exists trg_audit_approval_steps on public.approval_steps;
create trigger trg_audit_approval_steps
  after insert or update or delete on public.approval_steps
  for each row execute function app.audit_trigger();

-- ------------------------------------------------------------------------
-- 3) กฎที่ใช้กับเอกสารใบนี้
-- ------------------------------------------------------------------------
create or replace function app.approval_plan(p_document uuid)
returns table (step_no smallint, role_id uuid)
language sql
stable
security definer
set search_path = public, app
as $fn$
  select r.step_no, r.role_id
  from public.documents d
  join public.approval_rules r on r.company_id = d.company_id
  where d.id = p_document
    and r.is_active
    and (r.doc_kind is null or r.doc_kind = d.kind::text)
    -- เทียบด้วยยอดรวมทั้งใบ ไม่ใช่ยอดสุทธิหลังหักภาษี ณ ที่จ่าย
    and abs(d.grand_total) >= r.min_amount
    and (r.max_amount is null or abs(d.grand_total) < r.max_amount)
  group by r.step_no, r.role_id
  order by r.step_no;
$fn$;

comment on function app.approval_plan is
  'ขั้นตอนอนุมัติที่เอกสารใบนี้ต้องผ่าน ตามกฎที่ใช้อยู่ ณ ตอนเรียก';

-- ------------------------------------------------------------------------
-- 4) ส่งเอกสารเข้าสู่การอนุมัติ
--
--  บันทึกขั้นตอนไว้กับเอกสาร แล้วเปลี่ยนสถานะเป็น awaiting_approval
--  ถ้าไม่มีกฎที่เข้าเงื่อนไขเลย จะไม่ทำอะไร ผู้ใช้อนุมัติได้ตามเดิม
-- ------------------------------------------------------------------------
create or replace function public.submit_for_approval(p_document uuid)
returns json
language plpgsql
security definer
set search_path = public, app
as $fn$
declare
  d record; r record; v_n int := 0;
begin
  select * into d from public.documents where id = p_document;
  if not found then raise exception 'DOC_NOT_FOUND'; end if;
  if not app.has_perm(d.company_id, 'documents', 'edit') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์ส่งเอกสารเข้าอนุมัติ';
  end if;
  if d.status::text not in ('draft','awaiting_approval') then
    raise exception 'DOC_NOT_DRAFT';
  end if;
  perform app.assert_period_open(d.company_id, d.doc_date, 'all');

  -- ส่งใหม่ได้ถ้ายังไม่มีใครตัดสิน แต่ห้ามล้างขั้นที่ตัดสินไปแล้ว
  if exists (select 1 from public.approval_steps
             where document_id = p_document and status <> 'pending') then
    raise exception 'APPROVAL_IN_PROGRESS';
  end if;
  delete from public.approval_steps where document_id = p_document;

  for r in select * from app.approval_plan(p_document) loop
    insert into public.approval_steps(company_id, document_id, step_no, role_id)
    values (d.company_id, p_document, r.step_no, r.role_id);
    v_n := v_n + 1;
  end loop;

  if v_n > 0 then
    update public.documents set status = 'awaiting_approval' where id = p_document;
  end if;

  return json_build_object('steps', v_n);
end $fn$;

grant execute on function public.submit_for_approval(uuid) to authenticated;

-- ------------------------------------------------------------------------
-- 5) ตัดสินขั้นอนุมัติ
--
--  อนุมัติได้เฉพาะขั้นที่ค้างอยู่ลำดับต่ำสุด และผู้ตัดสินต้องมีบทบาทตรงกับขั้นนั้น
--  ปฏิเสธได้ทุกขั้นที่ยังค้าง เอกสารกลับเป็นร่างพร้อมเหตุผล
-- ------------------------------------------------------------------------
create or replace function public.decide_approval(
  p_document uuid, p_approve boolean, p_note text default null
)
returns json
language plpgsql
security definer
set search_path = public, app
as $fn$
declare
  d record; s record; v_has_role boolean; v_left int;
begin
  select * into d from public.documents where id = p_document;
  if not found then raise exception 'DOC_NOT_FOUND'; end if;
  if not app.has_perm(d.company_id, 'documents', 'approve') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์อนุมัติเอกสาร';
  end if;

  select * into s from public.approval_steps
   where document_id = p_document and status = 'pending'
   order by step_no limit 1;
  if not found then raise exception 'NO_PENDING_STEP'; end if;

  -- ต้องเป็นคนที่ถือบทบาทของขั้นนี้ในบริษัทนี้จริง
  select exists (
    select 1 from public.user_companies uc
    where uc.user_id = auth.uid() and uc.company_id = d.company_id
      and uc.is_active and uc.role_id = s.role_id
  ) into v_has_role;
  if not v_has_role then raise exception 'NOT_YOUR_STEP'; end if;

  if p_approve then
    update public.approval_steps
       set status = 'approved', decided_by = auth.uid(), decided_at = now(), note = p_note
     where id = s.id;

    select count(*) into v_left from public.approval_steps
     where document_id = p_document and status = 'pending';

    -- ครบทุกขั้นแล้วยังไม่ลงบัญชีให้เอง คนสุดท้ายต้องกดอนุมัติอีกครั้ง
    -- เพื่อให้จุดที่ตัวเลขเข้าสมุดรายวันเป็นการกระทำที่ตั้งใจเสมอ
    return json_build_object('approved_step', s.step_no, 'remaining', v_left);
  else
    update public.approval_steps
       set status = 'rejected', decided_by = auth.uid(), decided_at = now(), note = p_note
     where id = s.id;
    update public.documents set status = 'draft' where id = p_document;
    return json_build_object('rejected_step', s.step_no);
  end if;
end $fn$;

grant execute on function public.decide_approval(uuid, boolean, text) to authenticated;

-- ------------------------------------------------------------------------
-- 6) ด่านตอนลงบัญชี
--
--  เอกสารที่เข้าเงื่อนไขกฎ ต้องผ่านครบทุกขั้นก่อนจึงลงบัญชีได้
--
--  ตรวจจากขั้นที่บันทึกไว้จริง ไม่ใช่จากกฎปัจจุบัน เพราะกฎอาจถูกแก้
--  ระหว่างที่เอกสารรออนุมัติอยู่
--
--  ถ้ายังไม่เคยส่งเข้าอนุมัติเลยแต่กฎบอกว่าต้องผ่าน ก็ปฏิเสธเช่นกัน
--  ไม่งั้นข้ามขั้นได้ด้วยการกดอนุมัติตรง ๆ
-- ------------------------------------------------------------------------
create or replace function app.assert_approved(p_document uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, app
as $fn$
declare v_planned int; v_recorded int; v_pending int; v_rejected int;
begin
  select count(*) into v_planned from app.approval_plan(p_document);
  if v_planned = 0 then return; end if;

  select count(*) filter (where true),
         count(*) filter (where status = 'pending'),
         count(*) filter (where status = 'rejected')
    into v_recorded, v_pending, v_rejected
    from public.approval_steps where document_id = p_document;

  if v_recorded = 0 then
    raise exception 'APPROVAL_REQUIRED: % ขั้น', v_planned
      using hint = 'เอกสารนี้ต้องผ่านการอนุมัติตามวงเงิน กดส่งอนุมัติก่อน';
  end if;
  if v_rejected > 0 then
    raise exception 'APPROVAL_REJECTED'
      using hint = 'มีผู้ปฏิเสธเอกสารนี้ แก้ไขแล้วส่งอนุมัติใหม่';
  end if;
  if v_pending > 0 then
    raise exception 'APPROVAL_PENDING: เหลือ % ขั้น', v_pending
      using hint = 'ยังมีขั้นอนุมัติที่ยังไม่ผ่าน';
  end if;
end $fn$;

-- ------------------------------------------------------------------------
-- 7) สถานะการอนุมัติของเอกสาร สำหรับหน้าจอ
-- ------------------------------------------------------------------------
create or replace function public.rpt_approval(p_document uuid)
returns json
language sql
stable
security invoker
set search_path = public, app
as $rp$
  select json_build_object(
    'required', (select count(*) from app.approval_plan(p_document)),
    'steps', coalesce((
      select jsonb_agg(jsonb_build_object(
        'step_no', s.step_no,
        'role_id', s.role_id,
        'role_name', r.name_th,
        'role_name_en', r.name_en,
        'role_name_zh', r.name_zh,
        'status', s.status,
        'decided_by', p.full_name,
        'decided_at', s.decided_at,
        'note', s.note
      ) order by s.step_no)
      from public.approval_steps s
      join public.roles r on r.id = s.role_id
      left join public.profiles p on p.id = s.decided_by
      where s.document_id = p_document), '[]'::jsonb),
    -- ขั้นถัดไปที่ผู้ใช้คนนี้ตัดสินได้
    'my_turn', exists (
      select 1 from public.approval_steps s
      join public.user_companies uc
        on uc.role_id = s.role_id and uc.user_id = auth.uid()
       and uc.company_id = s.company_id and uc.is_active
      where s.document_id = p_document
        and s.status = 'pending'
        and s.step_no = (select min(step_no) from public.approval_steps
                         where document_id = p_document and status = 'pending')
    )
  );
$rp$;

grant execute on function public.rpt_approval(uuid) to authenticated;

comment on function public.rpt_approval is
  'ขั้นอนุมัติของเอกสารหนึ่งใบ พร้อมบอกว่าถึงคิวผู้ใช้คนนี้หรือยัง';

-- ------------------------------------------------------------------------
-- 8) เอกสารที่รอผู้ใช้คนนี้อนุมัติ
-- ------------------------------------------------------------------------
create or replace function public.rpt_my_approvals(p_company uuid)
returns json
language sql
stable
security invoker
set search_path = public, app
as $my$
  select coalesce(jsonb_agg(x order by x->>'doc_date'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', d.id,
      'kind', d.kind::text,
      'doc_number', d.doc_number,
      'doc_date', d.doc_date,
      'contact_name', coalesce(c.name, d.contact_snapshot->>'name'),
      'grand_total', d.grand_total,
      'step_no', s.step_no
    ) as x
    from public.approval_steps s
    join public.documents d on d.id = s.document_id
    left join public.contacts c on c.id = d.contact_id
    join public.user_companies uc
      on uc.role_id = s.role_id and uc.user_id = auth.uid()
     and uc.company_id = s.company_id and uc.is_active
    where s.company_id = p_company
      and s.status = 'pending'
      and d.status::text = 'awaiting_approval'
      and s.step_no = (select min(step_no) from public.approval_steps
                       where document_id = s.document_id and status = 'pending')
  ) t;
$my$;

grant execute on function public.rpt_my_approvals(uuid) to authenticated;

comment on function public.rpt_my_approvals is
  'เอกสารที่รอให้ผู้ใช้คนนี้ตัดสินในขั้นถัดไป';

-- ------------------------------------------------------------------------
-- 9) เอนจินลงบัญชี — เพิ่มด่านอนุมัติ
--
--  วางไว้ท้ายชุดด่านตรวจ ต่อจากจับคู่สามทางและงบประมาณ
--  คัดนิยามจริงหลัง 0062 มาแก้จุดเดียว ไม่ได้พิมพ์ใหม่
-- ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_document(p_document uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
declare
  d record; l record;
  v_entry uuid; v_book text; v_line int := 0;
  v_ar uuid; v_ap uuid; v_vat_out uuid; v_vat_in uuid; v_wht_recv uuid; v_wht_pay uuid;
  v_inv uuid; v_cogs uuid; v_dep_r uuid; v_dep_p uuid;
  v_is_purchase boolean;
  v_stock_out boolean; v_stock_in boolean;
  v_acct_src uuid;
  v_cost numeric(18,2);
  v_unit_cost numeric(18,6);
begin
  select * into d from public.documents where id = p_document;
  if not found then raise exception 'DOC_NOT_FOUND'; end if;
  if not app.has_perm(d.company_id, 'documents', 'approve') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์อนุมัติ/ลงบัญชีเอกสาร';
  end if;
  perform app.assert_period_open(d.company_id, d.doc_date, 'all');

  -- จับคู่สามทางก่อนทุกอย่าง ใบที่ตัวเลขไม่ตรงต้องไม่ผ่านตั้งแต่ต้น
  -- ไม่ว่าจะเป็นใบที่ลงบัญชีเองหรือใบที่แปลงต่อมาก็ตาม
  perform app.assert_three_way(p_document);

  -- เช็กงบก่อนอนุมัติใบขอซื้อ/ใบสั่งซื้อ ก่อนที่ใบจะกลายเป็นภาระผูกพัน
  perform app.assert_budget(p_document);

  -- ต้องผ่านขั้นอนุมัติตามวงเงินให้ครบก่อน จึงจะลงบัญชีได้
  perform app.assert_approved(p_document);

  if d.journal_entry_id is not null then return d.journal_entry_id; end if;

  v_is_purchase := d.kind::text in ('bill','expense','purchase_credit_note','purchase_debit_note','deposit_payment','goods_receipt');
  if d.kind::text in ('quotation','sales_order','purchase_request','purchase_order','billing_note') then
    update public.documents set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_document;
    return null;
  end if;

  -- เอกสารที่แปลงต่อจากใบที่ลงบัญชีไปแล้ว = รายการเดียวกัน ห้ามลงซ้ำ
  -- (ใบแจ้งหนี้ → ใบกำกับภาษี → ใบเสร็จ / ใบรับสินค้า → ซื้อสินค้า)
  v_acct_src := app.accounting_source(d.id);
  if v_acct_src is not null then
    update public.documents
       set accounting_doc_id = v_acct_src, status = 'approved',
           approved_by = auth.uid(), approved_at = now()
     where id = p_document;
    return null;
  end if;

  -- เอกสารที่ทำให้สินค้าเคลื่อนไหว
  v_stock_out := d.kind::text in ('invoice','tax_invoice','receipt','purchase_credit_note','delivery_order');
  v_stock_in  := d.kind::text in ('bill','goods_receipt','expense','credit_note');

  -- ของออกจากคลังตอนส่งของไปแล้ว ใบกำกับที่ตามมาจึงตัดสต๊อกอีกไม่ได้
  if v_stock_out and app.stock_moved_upstream(d.id) then
    v_stock_out := false;
  end if;

  v_book    := case when v_is_purchase then 'PURCHASE' else 'SALE' end;
  v_ar      := app.acc(d.company_id,'ar');
  v_ap      := app.acc(d.company_id,'ap');
  v_vat_out := app.acc(d.company_id,'vat_output');
  v_vat_in  := app.acc(d.company_id,'vat_input');
  v_wht_recv:= app.acc(d.company_id,'wht_receivable');
  v_wht_pay := app.acc(d.company_id,'wht_payable');
  v_inv     := app.acc(d.company_id,'inventory');
  v_dep_r   := app.acc(d.company_id,'deposit_received');
  v_dep_p   := app.acc(d.company_id,'deposit_paid');
  v_cogs    := app.acc(d.company_id,'cogs');

  insert into public.journal_entries(company_id, entry_number, entry_date, book, description,
    source_type, source_id, status, is_auto, created_by, posted_by, posted_at)
  values (d.company_id, app.next_entry_number(d.company_id, v_book, d.doc_date), d.doc_date, v_book,
    coalesce(nullif(btrim(d.description), ''), d.kind::text || ' ' || d.doc_number), 'document', d.id, 'posted', true, auth.uid(), auth.uid(), now())
  returning id into v_entry;

  if not v_is_purchase then
    -- ========== ฝั่งขาย ==========
    -- ใบรับเงินมัดจำยังไม่ใช่รายได้ ต้องขึ้นเป็นหนี้สินจนกว่าจะส่งมอบของ
    -- ถ้าลงเป็นรายได้ตรงนี้ กำไรจะสูงเกินจริง และจะสูงซ้ำอีกรอบตอนออกใบกำกับจริง
    if d.kind::text = 'deposit_receipt' then
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
      values (v_entry, d.company_id, v_line, v_ar, 'ลูกหนี้ - เงินมัดจำ ' || d.doc_number, d.grand_total, 0, d.contact_id);

      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
      values (v_entry, d.company_id, v_line, v_dep_r, 'เงินมัดจำรับ - ' || d.doc_number, 0, d.vat_base, d.contact_id);

      if d.vat_amount <> 0 then
        v_line := v_line + 1;
        insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
        values (v_entry, d.company_id, v_line, v_vat_out, 'ภาษีขาย - เงินมัดจำ', 0, d.vat_amount);
      end if;

      update public.documents set status = 'approved', approved_by = auth.uid(), approved_at = now(),
             journal_entry_id = v_entry where id = p_document;
      return v_entry;
    end if;

    -- ใบส่งของยังไม่รับรู้รายได้ ยังไม่ใช่จุดความรับผิดทางภาษี
    -- ลงเฉพาะต้นทุนขายกับการตัดสินค้าคงเหลือ ส่วนรายได้อยู่ที่ใบกำกับที่ตามมา
    if d.kind::text <> 'delivery_order' then
    v_line := v_line + 1;
    insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
    values (v_entry, d.company_id, v_line, v_ar, 'ลูกหนี้การค้า - ' || d.doc_number, d.grand_total, 0, d.contact_id);

    -- มัดจำที่หักไว้ ต้องแยกส่วนมูลค่าออกจากส่วนภาษี
    --
    -- ตอนรับมัดจำเราออกใบกำกับและนำส่งภาษีขายไปแล้ว พอออกใบกำกับใบจริง
    -- ระบบคิดภาษีขายจากมูลค่าเต็มอีกครั้ง ถ้าหักมัดจำเป็นก้อนเดียวเข้าบัญชี
    -- เงินมัดจำรับทั้งจำนวน ภาษีของงวดมัดจำจะค้างอยู่ในบัญชีตลอดไป
    -- และภาษีขายจะถูกนำส่งซ้ำสองรอบสำหรับเงินก้อนเดียวกัน
    --
    -- จึงกลับภาษีขายของงวดมัดจำออกตามสัดส่วน เหลือภาษีขายสุทธิเท่ากับ
    -- 7% ของมูลค่าเต็มพอดี และบัญชีเงินมัดจำรับกลับเป็นศูนย์เมื่อใช้ครบ
    for l in
      select a.amount,
             round(a.amount * (dep.vat_amount / nullif(dep.grand_total, 0)), 2) as vat_part,
             dep.doc_number as dep_number
      from public.deposit_applications a
      join public.documents dep on dep.id = a.deposit_document_id
      where a.target_document_id = d.id
    loop
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
      values (v_entry, d.company_id, v_line, v_dep_r,
              'ล้างเงินมัดจำรับ - ' || l.dep_number,
              l.amount - coalesce(l.vat_part, 0), 0, d.contact_id);

      if coalesce(l.vat_part, 0) <> 0 then
        v_line := v_line + 1;
        insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
        values (v_entry, d.company_id, v_line, v_vat_out,
                'กลับภาษีขายของเงินมัดจำ - ' || l.dep_number, l.vat_part, 0);
      end if;

      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
      values (v_entry, d.company_id, v_line, v_ar,
              'ลดลูกหนี้จากเงินมัดจำ - ' || l.dep_number, 0, l.amount, d.contact_id);
    end loop;

    for l in select dl.*, coalesce(dl.account_id, p.income_account_id, app.acc(d.company_id,'sales_revenue')) as post_acc
             from public.document_lines dl
             left join public.products p on p.id = dl.product_id
             where dl.document_id = d.id order by dl.line_no loop
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, dimension_id)
      values (v_entry, d.company_id, v_line, l.post_acc, l.description, 0, l.line_amount, l.dimension_id);
    end loop;

    if d.vat_amount <> 0 then
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
      values (v_entry, d.company_id, v_line, v_vat_out, 'ภาษีขาย 7%', 0, d.vat_amount);
    end if;
    if d.wht_amount <> 0 then
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
      values (v_entry, d.company_id, v_line, v_wht_recv, 'ภาษีถูกหัก ณ ที่จ่าย', d.wht_amount, 0, d.contact_id);
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
      values (v_entry, d.company_id, v_line, v_ar, 'ลดลูกหนี้จากภาษีถูกหัก ณ ที่จ่าย', 0, d.wht_amount, d.contact_id);
    end if;
    end if;

    -- ---------- ตัดสต๊อก FIFO + ลงต้นทุนขาย ----------
    if v_stock_out then
      for l in select dl.quantity, dl.description, dl.dimension_id, dl.product_id,
                      coalesce(p.cogs_account_id, v_cogs)      as cogs_acc,
                      coalesce(p.inventory_account_id, v_inv)  as inv_acc
               from public.document_lines dl
               join public.products p on p.id = dl.product_id
               where dl.document_id = d.id and p.track_inventory and dl.quantity > 0
               order by dl.line_no loop

        v_cost := app.inv_issue(d.company_id, l.product_id, d.doc_date, l.quantity, d.id,
                                'ขายตามเอกสาร ' || d.doc_number);

        if v_cost is not null and v_cost <> 0 and l.cogs_acc is not null and l.inv_acc is not null then
          v_line := v_line + 1;
          insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, dimension_id)
          values (v_entry, d.company_id, v_line, l.cogs_acc, 'ต้นทุนขาย - ' || l.description, v_cost, 0, l.dimension_id);
          v_line := v_line + 1;
          insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, dimension_id)
          values (v_entry, d.company_id, v_line, l.inv_acc, 'ตัดสินค้าคงเหลือ - ' || l.description, 0, v_cost, l.dimension_id);
        end if;
      end loop;
    end if;

    -- ---------- รับคืนสินค้า (ใบลดหนี้ขาย) ----------
    if v_stock_in then
      for l in select dl.quantity, dl.line_amount, dl.description, dl.dimension_id, dl.product_id,
                      coalesce(p.cogs_account_id, v_cogs)     as cogs_acc,
                      coalesce(p.inventory_account_id, v_inv) as inv_acc,
                      p.purchase_price
               from public.document_lines dl
               join public.products p on p.id = dl.product_id
               where dl.document_id = d.id and p.track_inventory and dl.quantity > 0
               order by dl.line_no loop

        v_unit_cost := coalesce(
          (select il.unit_cost from public.inventory_layers il
            where il.company_id = d.company_id and il.product_id = l.product_id
            order by il.received_at desc, il.created_at desc limit 1),
          l.purchase_price, 0);

        perform app.inv_receive(d.company_id, l.product_id, d.doc_date, l.quantity, v_unit_cost, d.id,
                                'รับคืนตามเอกสาร ' || d.doc_number);

        v_cost := round(l.quantity * v_unit_cost, 2);
        if v_cost <> 0 and l.cogs_acc is not null and l.inv_acc is not null then
          v_line := v_line + 1;
          insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, dimension_id)
          values (v_entry, d.company_id, v_line, l.inv_acc, 'รับคืนสินค้าคงเหลือ - ' || l.description, v_cost, 0, l.dimension_id);
          v_line := v_line + 1;
          insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, dimension_id)
          values (v_entry, d.company_id, v_line, l.cogs_acc, 'กลับต้นทุนขาย - ' || l.description, 0, v_cost, l.dimension_id);
        end if;
      end loop;
    end if;
  else
    -- ========== ฝั่งซื้อ ==========
    -- ใบจ่ายเงินมัดจำยังไม่ใช่ค่าใช้จ่าย เป็นสินทรัพย์ (เงินมัดจำจ่าย) จนกว่าจะรับของ
    if d.kind::text = 'deposit_payment' then
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
      values (v_entry, d.company_id, v_line, v_dep_p, 'เงินมัดจำจ่าย - ' || d.doc_number, d.vat_base, 0, d.contact_id);

      if d.vat_amount <> 0 then
        v_line := v_line + 1;
        insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
        values (v_entry, d.company_id, v_line, v_vat_in, 'ภาษีซื้อ - เงินมัดจำ', d.vat_amount, 0);
      end if;

      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
      values (v_entry, d.company_id, v_line, v_ap, 'เจ้าหนี้ - เงินมัดจำ ' || d.doc_number, 0, d.grand_total, d.contact_id);

      update public.documents set status = 'approved', approved_by = auth.uid(), approved_at = now(),
             journal_entry_id = v_entry where id = p_document;
      return v_entry;
    end if;

    for l in select dl.*, coalesce(dl.account_id, p.expense_account_id,
                    case when p.track_inventory then coalesce(p.inventory_account_id, app.acc(d.company_id,'inventory')) end,
                    app.acc(d.company_id,'default_expense')) as post_acc,
                    p.track_inventory, p.inventory_account_id
             from public.document_lines dl
             left join public.products p on p.id = dl.product_id
             where dl.document_id = d.id order by dl.line_no loop
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, dimension_id)
      values (v_entry, d.company_id, v_line, l.post_acc, l.description, l.line_amount, 0, l.dimension_id);

      -- รับสต๊อกเฉพาะบรรทัดที่เข้าบัญชีสินค้าคงเหลือจริง เพื่อให้ GL กับสต๊อกตรงกัน
      if v_stock_in and l.product_id is not null and l.track_inventory and l.quantity > 0
         and l.post_acc = coalesce(l.inventory_account_id, v_inv) then
        perform app.inv_receive(d.company_id, l.product_id, d.doc_date, l.quantity,
                                round(l.line_amount / l.quantity, 6), d.id,
                                'รับเข้าตามเอกสาร ' || d.doc_number);
      end if;
    end loop;

    if d.vat_amount <> 0 then
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
      values (v_entry, d.company_id, v_line, v_vat_in, 'ภาษีซื้อ 7%', d.vat_amount, 0);
    end if;

    v_line := v_line + 1;
    insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
    values (v_entry, d.company_id, v_line, v_ap, 'เจ้าหนี้การค้า - ' || d.doc_number, 0, d.grand_total, d.contact_id);

    -- มัดจำที่จ่ายไว้ล่วงหน้า แยกส่วนมูลค่าออกจากส่วนภาษีด้วยเหตุผลเดียวกับฝั่งขาย
    -- ภาษีซื้อของงวดมัดจำถูกใช้สิทธิ์ไปแล้ว ต้องกลับออกไม่ให้ใช้สิทธิ์ซ้ำ
    for l in
      select a.amount,
             round(a.amount * (dep.vat_amount / nullif(dep.grand_total, 0)), 2) as vat_part,
             dep.doc_number as dep_number
      from public.deposit_applications a
      join public.documents dep on dep.id = a.deposit_document_id
      where a.target_document_id = d.id
    loop
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
      values (v_entry, d.company_id, v_line, v_ap,
              'ลดเจ้าหนี้จากเงินมัดจำ - ' || l.dep_number, l.amount, 0, d.contact_id);

      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
      values (v_entry, d.company_id, v_line, v_dep_p,
              'ล้างเงินมัดจำจ่าย - ' || l.dep_number,
              0, l.amount - coalesce(l.vat_part, 0), d.contact_id);

      if coalesce(l.vat_part, 0) <> 0 then
        v_line := v_line + 1;
        insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
        values (v_entry, d.company_id, v_line, v_vat_in,
                'กลับภาษีซื้อของเงินมัดจำ - ' || l.dep_number, 0, l.vat_part);
      end if;
    end loop;

    if d.wht_amount <> 0 then
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
      values (v_entry, d.company_id, v_line, v_ap, 'ลดเจ้าหนี้จากภาษีหัก ณ ที่จ่าย', d.wht_amount, 0, d.contact_id);
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
      values (v_entry, d.company_id, v_line, v_wht_pay, 'ภาษีหัก ณ ที่จ่ายค้างจ่าย', 0, d.wht_amount, d.contact_id);
    end if;

    -- ใบลดหนี้ซื้อ (ส่งคืนผู้ขาย) : ตัดสต๊อกออกแบบ FIFO
    if v_stock_out then
      for l in select dl.quantity, dl.product_id
               from public.document_lines dl
               join public.products p on p.id = dl.product_id
               where dl.document_id = d.id and p.track_inventory and dl.quantity > 0
               order by dl.line_no loop
        perform app.inv_issue(d.company_id, l.product_id, d.doc_date, l.quantity, d.id,
                              'ส่งคืนตามเอกสาร ' || d.doc_number);
      end loop;
    end if;
  end if;

  update public.documents
     set journal_entry_id = v_entry, status = 'approved', approved_by = auth.uid(), approved_at = now()
   where id = p_document;

  return v_entry;
end $function$;
