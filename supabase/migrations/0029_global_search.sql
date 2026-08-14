-- =====================================================================
-- 0029 : ค้นหาทุกอย่างจากช่องเดียว
--
--  ตั้งใจให้เป็น security INVOKER (ไม่ใส่ security definer)
--  เพราะอยากให้ RLS ของแต่ละตารางกรองให้เอง — ผู้ใช้จะเห็นเฉพาะสิ่งที่
--  ตัวเองมีสิทธิ์ดูอยู่แล้ว ไม่ต้องเขียนเงื่อนไขสิทธิ์ซ้ำในนี้ให้พลาด
--
--  ถ้าเขียนเป็น security definer แล้วลืมเช็ค app.has_perm สักจุด
--  ช่องค้นหาจะกลายเป็นช่องโหว่ที่ดูดข้อมูลทั้งบริษัทออกมาได้ทันที
-- =====================================================================

create or replace function public.rpt_global_search(
  p_company uuid,
  p_q       text,
  p_limit   int default 8
)
returns json
language sql
stable
set search_path = public, app
as $$
with q as (
  select
    nullif(btrim(p_q), '')                       as raw,
    '%' || replace(replace(btrim(coalesce(p_q,'')), '%', '\%'), '_', '\_') || '%' as pat,
    -- ถ้าพิมพ์เป็นตัวเลขล้วน ให้ค้นยอดเงินด้วย
    case when btrim(coalesce(p_q,'')) ~ '^[0-9][0-9,\.]*$'
         then replace(btrim(p_q), ',', '')::numeric end as num,
    least(greatest(coalesce(p_limit, 8), 1), 25) as lim
)
select case when (select raw from q) is null then
  json_build_object('documents','[]'::json,'contacts','[]'::json,
                    'products','[]'::json,'tasks','[]'::json)
else json_build_object(

  'documents', coalesce((
    select jsonb_agg(x order by x->>'doc_date' desc)
    from (
      select jsonb_build_object(
        'id', d.id, 'kind', d.kind, 'doc_number', d.doc_number,
        'doc_date', d.doc_date, 'status', d.status,
        'grand_total', d.grand_total, 'currency', d.currency,
        'contact', coalesce(c.name, d.contact_snapshot->>'name')
      ) as x
      from public.documents d
      left join public.contacts c on c.id = d.contact_id
      cross join q
      where d.company_id = p_company
        and (
          d.doc_number ilike q.pat
          or d.reference ilike q.pat
          or d.notes     ilike q.pat
          or c.name      ilike q.pat
          or (d.contact_snapshot->>'name') ilike q.pat
          or (q.num is not null and d.grand_total = q.num)
        )
      order by d.doc_date desc, d.created_at desc
      limit (select lim from q)
    ) s
  ), '[]'::jsonb),

  'contacts', coalesce((
    select jsonb_agg(x)
    from (
      select jsonb_build_object(
        'id', c.id, 'code', c.code, 'name', c.name, 'kind', c.kind,
        'tax_id', c.tax_id, 'phone', c.phone, 'email', c.email
      ) as x
      from public.contacts c
      cross join q
      where c.company_id = p_company
        and (c.name ilike q.pat or c.name_en ilike q.pat or c.legal_name ilike q.pat
             or c.code ilike q.pat or c.tax_id ilike q.pat
             or c.phone ilike q.pat or c.email ilike q.pat
             or c.contact_person ilike q.pat)
      order by c.name
      limit (select lim from q)
    ) s
  ), '[]'::jsonb),

  'products', coalesce((
    select jsonb_agg(x)
    from (
      select jsonb_build_object(
        'id', p.id, 'sku', p.sku, 'name', p.name, 'unit', p.unit,
        'sale_price', p.sale_price, 'is_active', p.is_active
      ) as x
      from public.products p
      cross join q
      where p.company_id = p_company
        and (p.name ilike q.pat or p.name_en ilike q.pat or p.sku ilike q.pat
             or p.barcode ilike q.pat or p.category ilike q.pat)
      order by p.is_active desc, p.name
      limit (select lim from q)
    ) s
  ), '[]'::jsonb),

  'tasks', coalesce((
    select jsonb_agg(x)
    from (
      select jsonb_build_object(
        'id', t.id, 'title', t.title, 'status', t.status,
        'priority', t.priority, 'due_at', t.due_at
      ) as x
      from public.tasks t
      cross join q
      where t.company_id = p_company
        and (t.title ilike q.pat or t.description ilike q.pat or t.code ilike q.pat)
      order by (t.status = 'done'), t.due_at nulls last
      limit (select lim from q)
    ) s
  ), '[]'::jsonb)
) end;
$$;

grant execute on function public.rpt_global_search(uuid, text, int) to authenticated;

comment on function public.rpt_global_search is
  'ค้นหาข้ามเอกสาร/ผู้ติดต่อ/สินค้า/งาน — security invoker เพื่อให้ RLS กรองสิทธิ์ให้เอง';

-- ดัชนีช่วยให้ค้นด้วย ilike '%…%' เร็วขึ้น (ดัชนี btree ปกติใช้กับ %นำหน้า% ไม่ได้)
create extension if not exists "pg_trgm";

create index if not exists documents_docnum_trgm_idx on public.documents using gin (doc_number gin_trgm_ops);
create index if not exists contacts_name_trgm_idx    on public.contacts  using gin (name gin_trgm_ops);
create index if not exists products_name_trgm_idx    on public.products  using gin (name gin_trgm_ops);
create index if not exists tasks_title_trgm_idx      on public.tasks     using gin (title gin_trgm_ops);
