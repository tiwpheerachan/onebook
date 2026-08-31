-- =====================================================================
-- 0047 : บังคับใช้วงเงินเครดิตลูกค้าที่กรอกได้มาตลอดแต่ไม่เคยมีผล
--
--  contacts.credit_limit มีมาตั้งแต่ 0003 หน้าผู้ติดต่อกรอกได้ เก็บลงฐานข้อมูลจริง
--  แต่ไม่มีโค้ดที่ไหนอ่านไปใช้เลย ผู้ดูแลตั้งวงเงินแล้วเข้าใจว่าระบบคุมให้
--  ทั้งที่ขายเกินวงเงินไปเท่าไรก็ได้ — อันตรายกว่าการไม่มีช่องนี้ตั้งแต่แรก
--
--  ข้อตัดสินใจที่สำคัญสามข้อ
--
--  1) credit_limit = 0 แปลว่า "ไม่จำกัด" ไม่ใช่ "ห้ามขายเชื่อ"
--     ค่าเริ่มต้นของทุกแถวคือ 0 และลูกค้าเดิมทั้งหมดเป็น 0 อยู่แล้ว
--     ถ้าตีความว่าเป็นศูนย์จริง การเปิดใช้ครั้งนี้จะบล็อกการขายทั้งบริษัททันที
--     ใครต้องการห้ามขายเชื่อจริง ๆ ให้ปิดใช้งานลูกค้ารายนั้นแทน
--
--  2) ตรวจตอนอนุมัติ ไม่ใช่ตอนบันทึกร่าง
--     ใบร่างยังไม่ผูกพัน การบล็อกตั้งแต่บันทึกจะทำให้ร่างใบเสนอราคาไว้ก่อนไม่ได้
--
--  3) เกินวงเงินแล้วยังผ่านได้ ถ้ามีสิทธิ์ documents.override
--     วงเงินเครดิตเป็นนโยบายของกิจการ ไม่ใช่ข้อกฎหมายแบบกรอบหกเดือนของภาษีซื้อ
--     ของจริงมีเคสที่ผู้บริหารอนุมัติให้เกินได้ ใช้สิทธิ์ override ที่มีอยู่แล้วใน 0005
--     เพื่อไม่ให้เกิดทางลัดใหม่ที่ไม่มีใครตรวจ
-- =====================================================================

comment on column public.contacts.credit_limit is
  'วงเงินเครดิต — 0 = ไม่จำกัด ตรวจตอนอนุมัติเอกสารขาย ผู้มีสิทธิ์ documents.override ผ่านได้';

-- ------------------------------------------------------------------------
-- ยอดหนี้คงค้างของลูกค้ารายหนึ่ง
--
-- ใช้นิยามเดียวกับรายงานอายุลูกหนี้ทุกประการ (0010 rpt_aging ฝั่ง ar)
-- ถ้านิยามสองที่นี้ไม่ตรงกัน ผู้ใช้จะเห็นยอดในรายงานอย่างหนึ่ง
-- แล้วโดนบล็อกด้วยอีกตัวเลขหนึ่ง โดยไม่มีทางรู้ว่าทำไม
--
-- p_exclude ไว้กันนับเอกสารใบที่กำลังจะอนุมัติซ้ำ ตอนอนุมัติซ้ำหรือแก้แล้วอนุมัติใหม่
-- ------------------------------------------------------------------------
create or replace function app.contact_outstanding(
  p_company uuid,
  p_contact uuid,
  p_exclude uuid default null
)
returns numeric
language sql
stable
security definer
set search_path = public, app
as $$
  select coalesce(sum(d.net_payable - d.paid_amount), 0)
  from public.documents d
  where d.company_id = p_company
    and d.contact_id = p_contact
    and d.status in ('approved','partial','overdue')
    and (d.net_payable - d.paid_amount) > 0.005
    and d.kind::text in ('invoice','tax_invoice','debit_note')
    and (p_exclude is null or d.id <> p_exclude);
$$;

grant execute on function app.contact_outstanding(uuid, uuid, uuid) to authenticated;

-- ------------------------------------------------------------------------
-- ตรวจวงเงินตอนเอกสารขายเปลี่ยนสถานะเป็นอนุมัติ
--
-- ทำเป็นทริกเกอร์เพื่อให้ครอบทุกทางเข้า ไม่ใช่แค่ปุ่มบนหน้าจอ
-- เครื่องลงบัญชีเป็นฟังก์ชันยาวที่ทำงานถูกอยู่แล้ว ไม่ควรประกาศทับเพื่อแทรกเงื่อนไข
-- ------------------------------------------------------------------------
create or replace function app.enforce_credit_limit()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_limit numeric;
  v_used  numeric;
  v_new   numeric;
  v_name  text;
begin
  -- สนใจเฉพาะจังหวะที่เพิ่งกลายเป็นอนุมัติ และเฉพาะเอกสารที่ก่อหนี้ลูกค้า
  if new.status::text <> 'approved' then return new; end if;
  if tg_op = 'UPDATE' and old.status::text = 'approved' then return new; end if;
  if new.kind::text not in ('invoice','tax_invoice','debit_note') then return new; end if;
  if new.contact_id is null then return new; end if;

  select c.credit_limit, c.name into v_limit, v_name
  from public.contacts c where c.id = new.contact_id;

  -- ไม่ได้ตั้งวงเงิน = ไม่จำกัด พฤติกรรมเดิมของทุกบริษัทจึงไม่เปลี่ยน
  if coalesce(v_limit, 0) <= 0 then return new; end if;

  -- ผู้มีสิทธิ์ยกเว้นข้อจำกัดอนุมัติได้ แต่ยังถูกบันทึกไว้ในประวัติการแก้ไขตามปกติ
  if app.has_perm(new.company_id, 'documents', 'override') then return new; end if;

  v_used := app.contact_outstanding(new.company_id, new.contact_id, new.id);
  v_new  := coalesce(new.net_payable, 0) - coalesce(new.paid_amount, 0);

  if v_used + v_new > v_limit then
    raise exception
      'CREDIT_LIMIT_EXCEEDED: % มียอดค้าง % บวกใบนี้อีก % รวม % เกินวงเงิน %',
      coalesce(v_name, '-'),
      round(v_used, 2), round(v_new, 2), round(v_used + v_new, 2), round(v_limit, 2);
  end if;

  return new;
end $$;

drop trigger if exists trg_credit_limit on public.documents;
create trigger trg_credit_limit
  before insert or update of status, net_payable, paid_amount, contact_id on public.documents
  for each row execute function app.enforce_credit_limit();

comment on function app.enforce_credit_limit is
  'บล็อกการอนุมัติเอกสารขายที่ทำให้ยอดค้างเกินวงเงินเครดิต — 0 = ไม่จำกัด, override ผ่านได้';

-- ------------------------------------------------------------------------
-- สถานะวงเงินของลูกค้า สำหรับแสดงบนหน้าจอก่อนกดอนุมัติ
--
-- บอกล่วงหน้าดีกว่าปล่อยให้กดแล้วเจอข้อความปฏิเสธ
-- security invoker ให้ RLS ของ contacts กับ documents กรองสิทธิ์เอง
-- ------------------------------------------------------------------------
create or replace function public.rpt_credit_status(p_company uuid, p_contact uuid)
returns json
language sql
stable
set search_path = public, app
as $$
  select json_build_object(
    'contact_id',  c.id,
    'name',        c.name,
    'credit_days', c.credit_days,
    'credit_limit', c.credit_limit,
    'unlimited',   (coalesce(c.credit_limit, 0) <= 0),
    'outstanding', app.contact_outstanding(p_company, c.id, null),
    'available',   case when coalesce(c.credit_limit, 0) <= 0 then null
                        else c.credit_limit - app.contact_outstanding(p_company, c.id, null) end
  )
  from public.contacts c
  where c.id = p_contact and c.company_id = p_company;
$$;

grant execute on function public.rpt_credit_status(uuid, uuid) to authenticated;

-- ------------------------------------------------------------------------
-- ลูกค้าที่ใกล้เต็มวงเงินหรือเกินแล้ว สำหรับหน้าติดตาม
-- ------------------------------------------------------------------------
create or replace function public.rpt_credit_watch(p_company uuid, p_threshold numeric default 0.8)
returns json
language sql
stable
set search_path = public, app
as $$
  select coalesce(jsonb_agg(x order by (x->>'used_ratio')::numeric desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'contact_id', c.id, 'code', c.code, 'name', c.name,
      'credit_limit', c.credit_limit,
      'outstanding', o.amt,
      'available', c.credit_limit - o.amt,
      'used_ratio', round(o.amt / nullif(c.credit_limit, 0), 4),
      'over', (o.amt > c.credit_limit)
    ) as x
    from public.contacts c
    cross join lateral (select app.contact_outstanding(p_company, c.id, null) as amt) o
    where c.company_id = p_company
      and c.is_active
      and c.credit_limit > 0
      and o.amt >= c.credit_limit * p_threshold
  ) t;
$$;

grant execute on function public.rpt_credit_watch(uuid, numeric) to authenticated;
