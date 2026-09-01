-- =====================================================================
-- 0062 : งบประมาณ และการเช็กงบตอนขออนุมัติซื้อ
--
--  ระบบไม่มีงบประมาณเลย ค้นทั้งฐานข้อมูลแล้วไม่พบตารางหรือฟังก์ชันใด ๆ
--  ใบขอซื้อจึงอนุมัติได้โดยไม่มีใครรู้ว่าเกินงบที่ตั้งไว้แล้วหรือยัง
--
-- ---------------------------------------------------------------------
--  ตั้งงบได้สามระดับ ละเอียดลงเรื่อย ๆ
--
--    บัญชี              ตั้งที่หมวดบัญชีค่าใช้จ่ายใดก็ได้
--    บัญชี + แผนก        ใช้ dimension ที่มีอยู่แล้ว (0046)
--    บัญชี + แผนก + งวด  รายเดือนหรือรายปี
--
--  เลือกใช้บัญชีเป็นแกนหลัก ไม่ใช่ "หมวดงบประมาณ" ชุดใหม่
--  เพราะยอดใช้จริงต้องอ่านจากสมุดรายวัน ถ้าตั้งเป็นหมวดของตัวเอง
--  จะต้องมีตารางจับคู่อีกชั้น ซึ่งพังทันทีที่ผู้ใช้เพิ่มบัญชีใหม่แล้วลืมจับคู่
--
-- ---------------------------------------------------------------------
--  ยอดใช้จริง = สมุดรายวันที่ลงแล้ว + ภาระผูกพันที่ยังไม่ถึงบัญชี
--
--  ภาระผูกพัน (commitment) คือใบขอซื้อและใบสั่งซื้อที่อนุมัติแล้ว
--  แต่ยังไม่ได้รับของ จึงยังไม่มีรายการในสมุดรายวัน
--
--  ถ้านับแต่สมุดรายวัน งบจะดู "เหลือเยอะ" ทั้งที่สั่งซื้อไปหมดแล้ว
--  ซึ่งเป็นสาเหตุคลาสสิกที่ทำให้งบบานปลาย
--
--  ระวังการนับซ้ำ : ใบสั่งซื้อที่แปลงต่อมาจากใบขอซื้อจะนับเฉพาะใบล่างสุด
--  และเมื่อรับของแล้ว ใบนั้นถูกปิดหรือมีใบรับสินค้าอ้างถึง จึงหลุดจากภาระผูกพัน
--  ไปอยู่ในยอดสมุดรายวันแทน
--
-- ---------------------------------------------------------------------
--  โหมดบังคับใช้ เหมือน 0060 : off / warn / block  ตั้งต้นเป็น warn
-- =====================================================================

-- ------------------------------------------------------------------------
-- 1) ตารางงบประมาณ
-- ------------------------------------------------------------------------
create table if not exists public.budgets (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  account_id   uuid not null references public.accounts(id) on delete restrict,
  dimension_id uuid references public.dimensions(id) on delete restrict,
  -- งวดงบประมาณ : ปีเต็มใส่ month = null รายเดือนใส่ 1-12
  fiscal_year  smallint not null,
  month        smallint,
  amount       numeric(18,2) not null default 0,
  note         text,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint budgets_month_chk  check (month is null or month between 1 and 12),
  constraint budgets_amount_chk check (amount >= 0)
);

-- กันตั้งงบซ้ำช่องเดียวกัน — dimension เป็น null ได้ จึงต้องใช้ดัชนีสองตัว
create unique index if not exists budgets_slot_dim_idx
  on public.budgets (company_id, account_id, dimension_id, fiscal_year, coalesce(month, 0))
  where dimension_id is not null;
create unique index if not exists budgets_slot_nodim_idx
  on public.budgets (company_id, account_id, fiscal_year, coalesce(month, 0))
  where dimension_id is null;

create index if not exists budgets_company_idx on public.budgets (company_id, fiscal_year);
create index if not exists budgets_account_idx on public.budgets (account_id);
create index if not exists budgets_dim_idx     on public.budgets (dimension_id) where dimension_id is not null;

comment on table public.budgets is
  'งบประมาณรายบัญชี (เลือกระบุแผนกและงวดได้) — ยอดใช้จริงอ่านจากสมุดรายวันเสมอ ไม่มีคอลัมน์ยอดใช้ที่กรอกเอง';

alter table public.budgets enable row level security;
alter table public.budgets force row level security;

drop policy if exists "budgets_sel" on public.budgets;
create policy "budgets_sel" on public.budgets for select to authenticated
  using (app.has_perm(company_id, 'accounting.budget', 'view'));

drop policy if exists "budgets_ins" on public.budgets;
create policy "budgets_ins" on public.budgets for insert to authenticated
  with check (app.has_perm(company_id, 'accounting.budget', 'create'));

drop policy if exists "budgets_upd" on public.budgets;
create policy "budgets_upd" on public.budgets for update to authenticated
  using (app.has_perm(company_id, 'accounting.budget', 'edit'))
  with check (app.has_perm(company_id, 'accounting.budget', 'edit'));

drop policy if exists "budgets_del" on public.budgets;
create policy "budgets_del" on public.budgets for delete to authenticated
  using (app.has_perm(company_id, 'accounting.budget', 'delete'));

drop trigger if exists trg_budgets_touch on public.budgets;
create trigger trg_budgets_touch before update on public.budgets
  for each row execute function app.touch_updated_at();

drop trigger if exists trg_audit_budgets on public.budgets;
create trigger trg_audit_budgets
  after insert or update or delete on public.budgets
  for each row execute function app.audit_trigger();

-- ------------------------------------------------------------------------
-- 2) โหมดบังคับใช้ ตั้งรายบริษัท
-- ------------------------------------------------------------------------
alter table public.companies
  add column if not exists budget_enforce text not null default 'warn';

do $$ begin
  alter table public.companies
    add constraint companies_budget_enforce_chk check (budget_enforce in ('off','warn','block'));
exception when duplicate_object then null; end $$;

comment on column public.companies.budget_enforce is
  'off = ไม่เช็กงบ, warn = เช็กและแจ้งเตือน, block = เกินงบแล้วอนุมัติใบขอซื้อ/ใบสั่งซื้อไม่ได้';

-- ------------------------------------------------------------------------
-- 3) ให้บทบาทที่ดูรายงานได้ เห็นงบประมาณด้วย
--
--  ไม่ให้สิทธิ์แก้ไขอัตโนมัติ ผู้ดูแลต้องเปิดเองที่หน้าตั้งค่าบทบาท
--  เพราะการตั้งงบเป็นอำนาจทางการเงิน ไม่ควรได้มาโดยไม่รู้ตัว
-- ------------------------------------------------------------------------
insert into public.role_permissions (role_id, resource, actions)
select r.id, 'accounting.budget', array['view']
from public.roles r
where exists (
  select 1 from public.role_permissions rp
  where rp.role_id = r.id and rp.resource = 'report' and 'view' = any (rp.actions)
)
on conflict (role_id, resource) do nothing;

-- เจ้าของกิจการและสมุห์บัญชีตั้งงบได้เลย เพราะเป็นผู้อนุมัติงบอยู่แล้ว
update public.role_permissions rp
   set actions = array['view','create','edit','delete']
  from public.roles r
 where r.id = rp.role_id
   and rp.resource = 'accounting.budget'
   and r.code in ('owner','accounting_manager');

-- ------------------------------------------------------------------------
-- 4) ยอดตามงบ / ใช้จริง / ภาระผูกพัน ของช่องหนึ่ง
--
--  p_month = null หมายถึงดูทั้งปี
--  งบรายเดือนจะถูกรวมเข้ากับงบรายปีเมื่อดูทั้งปี
-- ------------------------------------------------------------------------
create or replace function app.budget_status(
  p_company   uuid,
  p_account   uuid,
  p_dimension uuid,
  p_year      smallint,
  p_month     smallint default null
)
returns jsonb
language sql
stable
security definer
set search_path = public, app
as $fn$
  with span as (
    select
      case when p_month is null then make_date(p_year, 1, 1)
           else make_date(p_year, p_month, 1) end as d_from,
      case when p_month is null then make_date(p_year, 12, 31)
           else (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date end as d_to
  ),
  budget as (
    select coalesce(sum(b.amount), 0) as amt
    from public.budgets b
    where b.company_id = p_company
      and b.account_id = p_account
      and b.fiscal_year = p_year
      and b.dimension_id is not distinct from p_dimension
      and (p_month is null or b.month is null or b.month = p_month)
  ),
  -- ใช้จริง : บรรทัดสมุดรายวันที่ลงแล้ว ด้านเดบิตเป็นค่าใช้จ่าย
  actual as (
    select coalesce(sum(jl.debit - jl.credit), 0) as amt
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.entry_id and je.status = 'posted'
    cross join span
    where jl.company_id = p_company
      and jl.account_id = p_account
      and (p_dimension is null or jl.dimension_id = p_dimension)
      and je.entry_date between span.d_from and span.d_to
  ),
  -- ภาระผูกพัน : ใบขอซื้อ/ใบสั่งซื้อที่อนุมัติแล้วแต่ยังไม่มีเอกสารปลายทางมารับช่วง
  commitment as (
    select coalesce(sum(dl.line_amount), 0) as amt
    from public.documents d
    join public.document_lines dl on dl.document_id = d.id
    cross join span
    where d.company_id = p_company
      and d.kind::text in ('purchase_request','purchase_order')
      and d.status::text in ('approved','partial')
      and d.doc_date between span.d_from and span.d_to
      and coalesce(dl.account_id, (select p.expense_account_id from public.products p where p.id = dl.product_id)) = p_account
      and (p_dimension is null or coalesce(dl.dimension_id, d.dimension_id) = p_dimension)
      -- ใบที่มีเอกสารปลายทางอ้างถึงแล้ว ถือว่าเดินต่อไปเป็นยอดจริงแล้ว
      and not exists (
        select 1 from public.documents nx
        where nx.ref_document_id = d.id and nx.status::text <> 'void'
      )
  )
  select jsonb_build_object(
    'budget', round((select amt from budget), 2),
    'actual', round((select amt from actual), 2),
    'commitment', round((select amt from commitment), 2),
    'used', round((select amt from actual) + (select amt from commitment), 2),
    'remaining', round((select amt from budget) - (select amt from actual) - (select amt from commitment), 2),
    'has_budget', (select amt from budget) > 0
  );
$fn$;

comment on function app.budget_status is
  'ยอดงบ ใช้จริง และภาระผูกพันของช่องงบหนึ่ง — ภาระผูกพันคือใบขอซื้อ/ใบสั่งซื้อที่ยังไม่เดินต่อ';

-- ------------------------------------------------------------------------
-- 5) เช็กงบของทั้งใบ
--
--  รวมยอดตามบัญชีและแผนกก่อน แล้วเทียบทีละช่อง
--  ช่องที่ยังไม่ได้ตั้งงบไว้จะข้าม ไม่ถือว่าผิด เพราะไม่ใช่ทุกบัญชีต้องมีงบ
-- ------------------------------------------------------------------------
create or replace function app.budget_check(p_document uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $fn$
declare
  d record; co record; r record;
  v_year smallint; v_month smallint;
  v_findings jsonb := '[]'::jsonb;
  v_errors int := 0;
  st jsonb;
begin
  select * into d from public.documents where id = p_document;
  if not found then return jsonb_build_object('checked', false); end if;
  if d.kind::text not in ('purchase_request','purchase_order') then
    return jsonb_build_object('checked', false, 'reason', 'kind');
  end if;

  select budget_enforce into co from public.companies where id = d.company_id;
  if co.budget_enforce = 'off' then
    return jsonb_build_object('checked', false, 'reason', 'off');
  end if;

  v_year  := extract(year  from d.doc_date)::smallint;
  v_month := extract(month from d.doc_date)::smallint;

  -- รวมยอดตามบัญชีและแผนกก่อน แล้วเทียบทีละช่อง
  for r in
    select coalesce(dl.account_id,
                    (select p.expense_account_id from public.products p where p.id = dl.product_id)) as account_id,
           coalesce(dl.dimension_id, d.dimension_id) as dimension_id,
           sum(dl.line_amount) as amount
    from public.document_lines dl
    where dl.document_id = d.id
    group by 1, 2
  loop
    if r.account_id is null then continue; end if;

    st := app.budget_status(d.company_id, r.account_id, r.dimension_id, v_year, v_month);
    if not (st->>'has_budget')::boolean then continue; end if;

    -- ภาระผูกพันของใบนี้ยังไม่ถูกนับ (ใบยังไม่อนุมัติ) จึงบวกเพิ่มเองตอนเทียบ
    if (st->>'remaining')::numeric - r.amount < -0.005 then
      v_findings := v_findings || jsonb_build_array(jsonb_build_object(
        'account_id', r.account_id,
        'code', (select a.code from public.accounts a where a.id = r.account_id),
        'name', (select a.name_th from public.accounts a where a.id = r.account_id),
        'dimension_id', r.dimension_id,
        'budget', (st->>'budget')::numeric,
        'used', (st->>'used')::numeric,
        'remaining', (st->>'remaining')::numeric,
        'requested', round(r.amount, 2),
        'over', round(r.amount - (st->>'remaining')::numeric, 2)));
      v_errors := v_errors + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'checked', true,
    'enforce', co.budget_enforce,
    'year', v_year, 'month', v_month,
    'errors', v_errors,
    'findings', v_findings);
end $fn$;

comment on function app.budget_check is
  'เทียบยอดในใบขอซื้อ/ใบสั่งซื้อกับงบคงเหลือรายบัญชี-แผนก ช่องที่ไม่ได้ตั้งงบไว้จะข้าม';

-- ------------------------------------------------------------------------
-- 6) บังคับใช้ตอนอนุมัติ
-- ------------------------------------------------------------------------
create or replace function app.assert_budget(p_document uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, app
as $fn$
declare v jsonb; v_code text;
begin
  v := app.budget_check(p_document);
  if not coalesce((v->>'checked')::boolean, false) then return; end if;
  if v->>'enforce' <> 'block' then return; end if;
  if coalesce((v->>'errors')::int, 0) = 0 then return; end if;

  select f->>'code' into v_code from jsonb_array_elements(v->'findings') f limit 1;
  raise exception 'BUDGET_EXCEEDED: % (%)', v_code, v->>'errors'
    using hint = 'ยอดในใบนี้เกินงบคงเหลือของบัญชีที่ตั้งไว้ ตรวจที่แผงงบประมาณบนหน้าเอกสาร';
end $fn$;

-- ------------------------------------------------------------------------
-- 7) เรียกดูผลจากหน้าจอ
-- ------------------------------------------------------------------------
create or replace function public.rpt_budget_check(p_document uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, app
as $rp$
declare v_ok boolean;
begin
  select true into v_ok from public.documents where id = p_document;
  if not found then return jsonb_build_object('checked', false, 'reason', 'not_found'); end if;
  return app.budget_check(p_document);
end $rp$;

grant execute on function public.rpt_budget_check(uuid) to authenticated;

-- ------------------------------------------------------------------------
-- 8) รายงานงบเทียบใช้จริงทั้งบริษัท
-- ------------------------------------------------------------------------
create or replace function public.rpt_budget_vs_actual(
  p_company uuid, p_year int, p_month int default null
)
returns json
language sql
stable
security invoker
set search_path = public, app
as $bv$
  select coalesce(jsonb_agg(x order by x->>'code', x->>'dimension_code'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'account_id', b.account_id,
      'code', a.code,
      'name_th', a.name_th, 'name_en', a.name_en, 'name_zh', a.name_zh,
      'dimension_id', b.dimension_id,
      'dimension_code', dm.code,
      'dimension_name', dm.name,
      'budget', round(sum(b.amount), 2),
      'actual', round(coalesce((st->>'actual')::numeric, 0), 2),
      'commitment', round(coalesce((st->>'commitment')::numeric, 0), 2),
      'used', round(coalesce((st->>'used')::numeric, 0), 2),
      'remaining', round(coalesce((st->>'remaining')::numeric, 0), 2),
      'used_ratio', case when sum(b.amount) > 0
                         then round(coalesce((st->>'used')::numeric, 0) / sum(b.amount), 4) end
    ) as x
    from public.budgets b
    join public.accounts a on a.id = b.account_id
    left join public.dimensions dm on dm.id = b.dimension_id
    cross join lateral app.budget_status(
      p_company, b.account_id, b.dimension_id, p_year::smallint, p_month::smallint
    ) as st
    where b.company_id = p_company
      and b.fiscal_year = p_year
      and (p_month is null or b.month is null or b.month = p_month)
    group by b.account_id, a.code, a.name_th, a.name_en, a.name_zh,
             b.dimension_id, dm.code, dm.name, st
  ) t;
$bv$;

grant execute on function public.rpt_budget_vs_actual(uuid, int, int) to authenticated;

comment on function public.rpt_budget_vs_actual is
  'งบเทียบใช้จริงรายบัญชี-แผนก รวมภาระผูกพันจากใบขอซื้อและใบสั่งซื้อที่ยังไม่เดินต่อ';

-- ------------------------------------------------------------------------
-- 9) เอนจินลงบัญชี — เรียกตัวเช็กงบ
--
--  วางไว้ต่อจากการจับคู่สามทาง ก่อนทุกอย่างที่เหลือ
--  ใบขอซื้อและใบสั่งซื้อไม่ลงบัญชีอยู่แล้ว แต่ยังต้องผ่านด่านนี้ก่อนได้สถานะอนุมัติ
--
--  คัดนิยามจริงหลัง 0061 มาแก้จุดเดียว ไม่ได้พิมพ์ใหม่
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
