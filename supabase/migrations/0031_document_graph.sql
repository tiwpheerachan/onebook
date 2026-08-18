-- =====================================================================
-- 0031 : แผนภาพที่มาของตัวเลข (Document Graph)
--
--  ต่อยอดจาก rpt_document_trace (0022) ที่คืนข้อมูลเป็น "รายการ"
--  อันนี้คืนเป็น "กราฟ" คือ nodes + edges เพื่อวาดเป็นแผนภาพได้ตรง ๆ
--
--  ทำไมต้องแยกฟังก์ชัน
--    trace ตอบคำถาม "ใบนี้มีอะไรบ้าง" — ลงลึกทีละใบ เหมาะกับการอ่าน
--    graph ตอบคำถาม "ใบนี้อยู่ตรงไหนของสายธาร" — เห็นภาพรวมทั้งสาย
--    ข้อมูลคนละรูป ถ้ายัดรวมกันจะได้ payload อ้วนโดยที่แต่ละหน้าใช้ครึ่งเดียว
--
--  จุดสำคัญ : downstream ใน 0022 ไม่ได้คืน ref_document_id มาด้วย
--  จึงรู้แค่ "ลึกกี่ชั้น" แต่ลากเส้นไม่ได้ว่าใบไหนต่อจากใบไหน
--  ในนี้คืนมาด้วย เส้นเชื่อมจึงเป็นของจริง ไม่ใช่เดาจากชั้น
-- =====================================================================

create or replace function public.rpt_document_graph(
  p_document uuid,
  p_max_nodes int default 80
)
returns json
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_doc     public.documents%rowtype;
  v_company uuid;
  v_cap     int := least(greatest(coalesce(p_max_nodes, 80), 10), 200);
begin
  select * into v_doc from public.documents where id = p_document;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  v_company := v_doc.company_id;

  if not app.has_perm(v_company, 'documents', 'view') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์ดูเอกสาร';
  end if;

  return (
  with recursive
  -- ไล่ขึ้นไปหาต้นทาง ชั้นลบคือย้อนอดีต
  up as (
    select d.id, d.ref_document_id, -1 as depth
    from public.documents d
    where d.id = v_doc.ref_document_id
    union all
    select d.id, d.ref_document_id, up.depth - 1
    from public.documents d
    join up on d.id = up.ref_document_id
    where up.depth > -10
  ),
  -- ไล่ลงไปหาปลายทาง ชั้นบวกคือเอกสารที่ออกต่อจากใบนี้
  down as (
    select d.id, d.ref_document_id, 1 as depth
    from public.documents d
    where d.ref_document_id = p_document
    union all
    select d.id, d.ref_document_id, down.depth + 1
    from public.documents d
    join down on d.ref_document_id = down.id
    where down.depth < 10
  ),
  ids as (
    select p_document as id, v_doc.ref_document_id as ref_document_id, 0 as depth
    union select id, ref_document_id, depth from up
    union select id, ref_document_id, depth from down
  ),
  -- ตัดจำนวนโหนดกันกราฟระเบิดเมื่อสายเอกสารยาวผิดปกติ
  capped as (
    select * from ids order by abs(depth), depth limit v_cap
  ),
  docs as (
    select c.depth, d.*, coalesce(ct.name, d.contact_snapshot->>'name') as contact_name
    from capped c
    join public.documents d on d.id = c.id
    left join public.contacts ct on ct.id = d.contact_id
  ),

  /* ─────────── โหนด ─────────── */
  n_doc as (
    select jsonb_build_object(
      'id', 'doc:' || d.id, 'ref', d.id, 'type', 'document',
      'kind', d.kind::text, 'label', d.doc_number,
      'sublabel', d.contact_name, 'date', d.doc_date,
      'amount', d.grand_total, 'currency', d.currency,
      'status', d.status::text, 'depth', d.depth,
      'current', (d.id = p_document)
    ) as n, d.depth
    from docs d
  ),
  n_journal as (
    select jsonb_build_object(
      'id', 'je:' || je.id, 'ref', je.id, 'type', 'journal',
      'label', je.entry_number, 'sublabel', je.book,
      'date', je.entry_date, 'amount', je.total_debit,
      'status', je.status::text, 'depth', d.depth, 'current', false
    ) as n, d.depth
    from docs d
    join public.journal_entries je
      on je.company_id = v_company
     and ((je.source_type = 'document' and je.source_id = d.id) or je.id = d.journal_entry_id)
  ),
  n_payment as (
    select distinct jsonb_build_object(
      'id', 'pay:' || pm.id, 'ref', pm.id, 'type', 'payment',
      'label', pm.doc_number, 'sublabel', fc.name,
      'date', pm.doc_date, 'amount', pa.amount,
      'status', pm.status::text, 'direction', pm.direction::text,
      'depth', d.depth, 'current', false
    ) as n, d.depth
    from docs d
    join public.payment_allocations pa on pa.document_id = d.id
    join public.payments pm on pm.id = pa.payment_id
    left join public.financial_channels fc on fc.id = pm.channel_id
  ),
  -- สต๊อกรวมเป็นก้อนเดียวต่อเอกสาร ไม่งั้นเอกสาร 20 บรรทัดจะได้ 20 โหนด
  n_stock as (
    select jsonb_build_object(
      'id', 'stk:' || d.id, 'ref', d.id, 'type', 'stock',
      'label', count(*)::text, 'sublabel', null,
      'date', min(m.move_date),
      'amount', coalesce(sum(m.value_out), 0) + coalesce(sum(m.value_in), 0),
      'depth', d.depth, 'current', false
    ) as n, d.depth
    from docs d
    join public.inventory_moves m on m.document_id = d.id
    group by d.id, d.depth
  ),
  n_tax as (
    select jsonb_build_object(
      'id', t.nid, 'ref', t.rid, 'type', 'tax',
      'label', t.label, 'sublabel', t.sub,
      'date', t.created_at::date, 'status', t.status,
      'depth', t.depth, 'current', false
    ) as n, t.depth
    from (
      select 'etax:' || e.id as nid, e.id as rid, coalesce(e.provider_ref, 'e-Tax') as label,
             'e-Tax' as sub, e.status::text as status, e.created_at, d.depth
      from docs d join public.etax_documents e on e.document_id = d.id
      union all
      select 'wht:' || w.id, w.id, coalesce(w.cert_number, '50 ทวิ'),
             '50 ทวิ', w.status::text, w.created_at, d.depth
      from docs d join public.wht_certificates w on w.document_id = d.id
    ) t
  ),
  n_contact as (
    select distinct jsonb_build_object(
      'id', 'con:' || ct.id, 'ref', ct.id, 'type', 'contact',
      'label', ct.name, 'sublabel', ct.code,
      'depth', 0, 'current', false
    ) as n, 0 as depth
    from docs d join public.contacts ct on ct.id = d.contact_id
  ),

  /* ─────────── เส้นเชื่อม ─────────── */
  e_derive as (
    select jsonb_build_object(
      'from', 'doc:' || d.ref_document_id, 'to', 'doc:' || d.id, 'kind', 'derives'
    ) as e
    from docs d
    where d.ref_document_id is not null
      and exists (select 1 from docs x where x.id = d.ref_document_id)
  ),
  e_journal as (
    select jsonb_build_object('from', 'doc:' || d.id, 'to', 'je:' || je.id, 'kind', 'posts') as e
    from docs d
    join public.journal_entries je
      on je.company_id = v_company
     and ((je.source_type = 'document' and je.source_id = d.id) or je.id = d.journal_entry_id)
  ),
  e_payment as (
    select distinct jsonb_build_object('from', 'doc:' || d.id, 'to', 'pay:' || pm.id, 'kind', 'settles') as e
    from docs d
    join public.payment_allocations pa on pa.document_id = d.id
    join public.payments pm on pm.id = pa.payment_id
  ),
  e_stock as (
    select distinct jsonb_build_object('from', 'doc:' || d.id, 'to', 'stk:' || d.id, 'kind', 'moves') as e
    from docs d join public.inventory_moves m on m.document_id = d.id
  ),
  e_tax as (
    select jsonb_build_object('from', 'doc:' || t.did, 'to', t.nid, 'kind', 'issues') as e
    from (
      select d.id as did, 'etax:' || e.id as nid from docs d join public.etax_documents e on e.document_id = d.id
      union all
      select d.id, 'wht:' || w.id from docs d join public.wht_certificates w on w.document_id = d.id
    ) t
  ),
  e_contact as (
    select distinct jsonb_build_object('from', 'con:' || d.contact_id, 'to', 'doc:' || d.id, 'kind', 'party') as e
    from docs d where d.contact_id is not null
  ),

  all_nodes as (
    select n from n_doc union all select n from n_journal union all select n from n_payment
    union all select n from n_stock union all select n from n_tax union all select n from n_contact
  ),
  all_edges as (
    select e from e_derive union all select e from e_journal union all select e from e_payment
    union all select e from e_stock union all select e from e_tax union all select e from e_contact
  )

  select json_build_object(
    'root',  p_document,
    'nodes', coalesce((select jsonb_agg(n) from all_nodes), '[]'::jsonb),
    'edges', coalesce((select jsonb_agg(distinct e) from all_edges), '[]'::jsonb),
    'truncated', (select count(*) from ids) > v_cap
  ));
end $$;

grant execute on function public.rpt_document_graph(uuid, int) to authenticated;

comment on function public.rpt_document_graph is
  'แผนภาพที่มาของตัวเลข — คืน nodes/edges ของสายธารเอกสารพร้อมสมุดรายวัน เงิน สต๊อก และเอกสารภาษี';
