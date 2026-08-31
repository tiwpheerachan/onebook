-- =====================================================================
-- 0046 : เปิดใช้ "แผนก" ที่มีโครงอยู่แล้วแต่ไม่เคยถูกใช้
--
--  สิ่งที่พบตอนเทียบกับคู่มือ Express : ของเรามีครบเกือบหมดแล้ว
--    - ตาราง dimensions มีตั้งแต่ 0003
--    - documents.dimension_id, document_lines.dimension_id,
--      journal_lines.dimension_id มีครบ
--    - เครื่องลงบัญชีใน 0009 ส่ง dimension_id จากบรรทัดเอกสารไปลงบรรทัดสมุดรายวัน
--      ให้เรียบร้อยอยู่แล้ว
--    - RLS ของ dimensions ผูกกับสิทธิ์ settings.dimensions
--
--  แต่ไม่มีอะไรทำให้มันทำงานเลย
--    - ไม่มีบทบาทไหนได้สิทธิ์ settings.dimensions จึงอ่านตารางไม่ได้สักคน
--    - ไม่มีหน้าจอให้สร้างแผนก
--    - ตัวแก้ไขเอกสารไม่มีช่องให้เลือก จึงไม่มีเอกสารใบไหนมีแผนก
--    - ไม่มีรายงานที่แยกตามแผนก ต่อให้กรอกไปก็ไม่มีที่ใช้
--
--  ของ Express มีช่อง "แผนก" อยู่มุมขวาบนของทุกหน้าบันทึก เป็นระดับเอกสาร
--  ไม่ใช่รายบรรทัด เราจึงทำตามนั้น แต่ยังเปิดให้ระบุรายบรรทัดทับได้
--  เพราะโครงสร้างเดิมรองรับอยู่แล้วและบางกิจการต้องแยกบรรทัดจริง
-- =====================================================================

-- ------------------------------------------------------------------------
-- 1) ให้สิทธิ์กับบทบาทที่มีอยู่แล้ว
--
-- ถ้าไม่ทำข้อนี้ ต่อให้มีหน้าจอก็เปิดไม่ได้ เพราะ RLS ปฏิเสธทุกคน
-- เจ้าของกิจการมี '*' อยู่แล้วจึงไม่ต้องเพิ่ม
-- ------------------------------------------------------------------------
insert into public.role_permissions (role_id, resource, actions)
select r.id, 'settings.dimensions', array['view','create','edit','delete']
from public.roles r
where r.code in ('accounting_manager','accountant')
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id = r.id and rp.resource = 'settings.dimensions'
  );

-- บทบาทที่แค่ดูรายงาน ให้เห็นชื่อแผนกได้ ไม่งั้นรายงานแยกแผนกจะโชว์เป็นรหัสเปล่า
insert into public.role_permissions (role_id, resource, actions)
select r.id, 'settings.dimensions', array['view']
from public.roles r
where r.code in ('executive','sales','purchasing')
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id = r.id and rp.resource = 'settings.dimensions'
  );

-- ------------------------------------------------------------------------
-- 2) บริษัทที่เปิดใหม่ต้องได้สิทธิ์นี้ด้วย
--
-- ต่อท้ายในฟังก์ชันสร้างบทบาทตั้งต้น ไม่แตะบรรทัดอื่นของ 0008
-- ------------------------------------------------------------------------
create or replace function app.seed_dimension_perms(p_company uuid)
returns void
language sql
security definer
set search_path = public, app
as $$
  insert into public.role_permissions (role_id, resource, actions)
  select r.id,
         'settings.dimensions',
         case when r.code in ('accounting_manager','accountant')
              then array['view','create','edit','delete']
              else array['view'] end
  from public.roles r
  where r.company_id = p_company
    and r.code in ('accounting_manager','accountant','executive','sales','purchasing')
    and not exists (
      select 1 from public.role_permissions rp
      where rp.role_id = r.id and rp.resource = 'settings.dimensions'
    );
$$;

grant execute on function app.seed_dimension_perms(uuid) to authenticated;

-- ------------------------------------------------------------------------
-- 3) แผนกระดับเอกสารไหลลงบรรทัดให้เอง
--
-- เลือกทำด้วยทริกเกอร์แทนการแก้เครื่องลงบัญชี เพราะเครื่องลงบัญชีเป็นฟังก์ชันยาว
-- ที่ทำงานถูกต้องอยู่แล้ว การประกาศทับทั้งก้อนเพื่อแก้คำเดียวเสี่ยงกว่ามาก
-- ทริกเกอร์เติมเฉพาะบรรทัดที่ยังว่าง ค่าที่ระบุรายบรรทัดจึงมีผลเหนือกว่าเสมอ
-- ------------------------------------------------------------------------
create or replace function app.line_fill_dimension()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare v_dim uuid;
begin
  if new.dimension_id is not null then return new; end if;
  select dimension_id into v_dim from public.documents where id = new.document_id;
  new.dimension_id := v_dim;
  return new;
end $$;

drop trigger if exists trg_line_dimension on public.document_lines;
create trigger trg_line_dimension
  before insert or update of dimension_id, document_id on public.document_lines
  for each row execute function app.line_fill_dimension();

-- แก้แผนกบนหัวเอกสารแล้วให้บรรทัดที่ยังไม่ได้ระบุเองตามไปด้วย
--
-- ทำเฉพาะตอนเอกสารยังไม่ลงบัญชี ถ้าลงบัญชีไปแล้วต้องกลับรายการก่อน
-- ไม่งั้นสมุดรายวันกับเอกสารจะเล่าคนละเรื่องโดยไม่มีร่องรอย
create or replace function app.doc_cascade_dimension()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
begin
  if new.dimension_id is distinct from old.dimension_id
     and new.journal_entry_id is null then
    update public.document_lines
       set dimension_id = new.dimension_id
     where document_id = new.id
       and (dimension_id is null or dimension_id = old.dimension_id);
  end if;
  return new;
end $$;

drop trigger if exists trg_doc_dimension on public.documents;
create trigger trg_doc_dimension
  after update of dimension_id on public.documents
  for each row execute function app.doc_cascade_dimension();

-- ------------------------------------------------------------------------
-- 4) รายการแผนกสำหรับช่องเลือกและหน้าจัดการ
--
-- security invoker เพื่อให้ RLS ของ dimensions กรองสิทธิ์เอง
-- ------------------------------------------------------------------------
create or replace function public.rpt_dimensions(p_company uuid)
returns json
language sql
stable
set search_path = public, app
as $$
  select coalesce(jsonb_agg(x order by x->>'group_name', x->>'code'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', dm.id, 'group_name', dm.group_name, 'code', dm.code,
      'name', dm.name, 'is_active', dm.is_active,
      -- ใช้กับกี่เอกสารแล้ว ใช้ตัดสินว่าลบได้ไหม
      'doc_count', (select count(*) from public.documents d where d.dimension_id = dm.id)
    ) as x
    from public.dimensions dm
    where dm.company_id = p_company
  ) t;
$$;

grant execute on function public.rpt_dimensions(uuid) to authenticated;

-- ------------------------------------------------------------------------
-- 5) กำไรขาดทุนแยกตามแผนก — เหตุผลทั้งหมดที่ต้องมีช่องนี้
--
-- ไม่มีรายงานนี้ การกรอกแผนกก็ไม่มีประโยชน์อะไรเลย
-- อิงบรรทัดสมุดรายวันที่ผ่านรายการแล้ว ตัวเลขจึงตรงกับงบกำไรขาดทุนรวมเสมอ
-- บรรทัดที่ไม่ได้ระบุแผนกรวมไว้กลุ่ม "ไม่ระบุแผนก" ไม่ทิ้งหาย
-- ไม่งั้นผลรวมของรายงานนี้จะไม่เท่ากับงบรวมและไม่มีใครรู้ว่าหายไปไหน
-- ------------------------------------------------------------------------
create or replace function public.rpt_pl_by_dimension(
  p_company uuid,
  p_from    date,
  p_to      date
)
returns json
language sql
stable
security definer
set search_path = public, app
as $$
  with lines as (
    select
      jl.dimension_id,
      a.type::text as acc_type,
      case when a.type in ('revenue','other_income')
           then jl.credit - jl.debit else jl.debit - jl.credit end as amt
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.entry_id and je.status = 'posted'
    join public.accounts a on a.id = jl.account_id
    where jl.company_id = p_company
      and je.entry_date between p_from and p_to
      and a.type in ('revenue','other_income','cost_of_sales','expense','other_expense','tax')
      and (app.has_perm(p_company,'report.pl','view') or app.has_perm(p_company,'report','view'))
  ),
  grouped as (
    select
      l.dimension_id,
      sum(case when l.acc_type in ('revenue','other_income') then l.amt else 0 end) as revenue,
      sum(case when l.acc_type = 'cost_of_sales' then l.amt else 0 end)             as cost_of_sales,
      sum(case when l.acc_type in ('expense','other_expense','tax') then l.amt else 0 end) as expense
    from lines l
    group by l.dimension_id
  )
  select coalesce(jsonb_agg(x order by (x->>'revenue')::numeric desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'dimension_id', g.dimension_id,
      'code', dm.code,
      'name', coalesce(dm.name, ''),
      'group_name', dm.group_name,
      'revenue',       round(g.revenue, 2),
      'cost_of_sales', round(g.cost_of_sales, 2),
      'gross_profit',  round(g.revenue - g.cost_of_sales, 2),
      'expense',       round(g.expense, 2),
      'net_profit',    round(g.revenue - g.cost_of_sales - g.expense, 2)
    ) as x
    from grouped g
    left join public.dimensions dm on dm.id = g.dimension_id
  ) t;
$$;

grant execute on function public.rpt_pl_by_dimension(uuid, date, date) to authenticated;

comment on function public.rpt_pl_by_dimension is
  'กำไรขาดทุนแยกตามแผนก — บรรทัดที่ไม่ระบุแผนกอยู่ในกลุ่มที่ dimension_id เป็น null ผลรวมจึงเท่ากับงบรวมเสมอ';

-- ประวัติการแก้ไขของตารางแผนก ยังไม่เคยมี
drop trigger if exists trg_audit_dimensions on public.dimensions;
create trigger trg_audit_dimensions after insert or update or delete on public.dimensions
  for each row execute function app.audit_trigger();

comment on table public.dimensions is
  'แผนก/มิติสำหรับแยกกำไรขาดทุน — ระบุที่หัวเอกสาร แล้วไหลลงบรรทัดและสมุดรายวันเอง';
