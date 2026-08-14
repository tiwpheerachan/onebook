-- =====================================================================
-- 0030 : คลังเอกสาร — หน้ารวมไฟล์แนบทั้งหมดของบริษัท
--
--  เดิมไฟล์แนบเปิดดูได้จากในเอกสารทีละใบเท่านั้น พอจะหา "สัญญาที่เซ็นเมื่อปีที่แล้ว"
--  ต้องเดาก่อนว่าแนบไว้กับเอกสารใบไหน ซึ่งคนมักจำไม่ได้
--
--  เขียนเป็น security INVOKER เหมือน rpt_global_search ให้ RLS ของ attachments
--  กรองสิทธิ์เอง จะได้ไม่ต้องเขียนเงื่อนไขสิทธิ์ซ้ำแล้วเสี่ยงพลาด
-- =====================================================================

create index if not exists attachments_company_idx
  on public.attachments (company_id, created_at desc);

create or replace function public.rpt_document_library(
  p_company  uuid,
  p_q        text default null,
  p_kind     text default null,      -- doc_kind หรือ 'unlinked' = ไฟล์ที่ไม่ได้ผูกกับเอกสาร
  p_from     date default null,
  p_to       date default null,
  p_limit    int  default 60,
  p_offset   int  default 0
)
returns json
language sql
stable
set search_path = public, app
as $$
with args as (
  select
    '%' || replace(replace(btrim(coalesce(p_q,'')), '%','\%'), '_','\_') || '%' as pat,
    nullif(btrim(coalesce(p_q,'')), '') as raw,
    least(greatest(coalesce(p_limit,60),1),200) as lim,
    greatest(coalesce(p_offset,0),0) as off
),
base as (
  select
    a.id, a.file_name, a.mime_type, a.size_bytes, a.storage_path, a.created_at,
    a.document_id,
    d.kind::text  as doc_kind,
    d.doc_number,
    d.doc_date,
    d.status::text as doc_status,
    coalesce(c.name, d.contact_snapshot->>'name') as contact,
    p.full_name as uploaded_by
  from public.attachments a
  left join public.documents d on d.id = a.document_id
  left join public.contacts  c on c.id = d.contact_id
  left join public.profiles  p on p.id = a.uploaded_by
  cross join args
  where a.company_id = p_company
    and (args.raw is null
         or a.file_name ilike args.pat
         or d.doc_number ilike args.pat
         or d.reference  ilike args.pat
         or c.name       ilike args.pat)
    and (p_kind is null
         or (p_kind = 'unlinked' and a.document_id is null)
         or d.kind::text = p_kind)
    and (p_from is null or a.created_at >= p_from::timestamptz)
    and (p_to   is null or a.created_at <  (p_to + 1)::timestamptz)
)
select json_build_object(
  'files', coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc)
    from (select * from base order by created_at desc
          limit (select lim from args) offset (select off from args)) x
  ), '[]'::jsonb),
  'total',      (select count(*)                    from base),
  'total_size', (select coalesce(sum(size_bytes),0) from base),
  -- จำนวนไฟล์แยกตามประเภทเอกสาร ไว้ทำตัวกรองด้านข้าง
  'by_kind', coalesce((
    select jsonb_agg(jsonb_build_object('kind', k, 'count', n) order by n desc)
    from (
      select coalesce(doc_kind, 'unlinked') as k, count(*) as n
      from base group by 1
    ) g
  ), '[]'::jsonb)
);
$$;

grant execute on function public.rpt_document_library(uuid, text, text, date, date, int, int) to authenticated;

comment on function public.rpt_document_library is
  'คลังเอกสาร — รวมไฟล์แนบทั้งบริษัท security invoker เพื่อให้ RLS กรองสิทธิ์ให้เอง';
