-- =====================================================================
-- 0019 : ไฟล์แนบเอกสาร + ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)
--
--  ตาราง wht_certificates / wht_certificate_lines / wht_types มีอยู่แล้วตั้งแต่ 0003
--  ไฟล์นี้เพิ่มเฉพาะส่วนที่ยังขาด : ที่เก็บไฟล์แนบ และฟังก์ชันออกหนังสือรับรอง
-- =====================================================================

-- แปลงข้อความเป็น uuid โดยไม่โยน error ใช้ตรวจสิทธิ์จาก path ของไฟล์ใน storage
create or replace function app.safe_uuid(p text)
returns uuid language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

-- --------------------------------------------------------------- ไฟล์แนบ
-- ตั้ง path เป็น {company_id}/{document_id}/{uuid}-{ชื่อไฟล์}
-- สิทธิ์จึงตรวจได้จากส่วนแรกของ path โดยตรง
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 26214400)   -- จำกัด 25 MB ต่อไฟล์
on conflict (id) do update set public = false, file_size_limit = 26214400;

drop policy if exists "attachments_read" on storage.objects;
create policy "attachments_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'attachments'
    and app.has_perm(app.safe_uuid(split_part(name, '/', 1)), 'documents', 'view')
  );

drop policy if exists "attachments_write" on storage.objects;
create policy "attachments_write" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and app.has_perm(app.safe_uuid(split_part(name, '/', 1)), 'documents', 'edit')
  );

drop policy if exists "attachments_remove" on storage.objects;
create policy "attachments_remove" on storage.objects for delete to authenticated
  using (
    bucket_id = 'attachments'
    and app.has_perm(app.safe_uuid(split_part(name, '/', 1)), 'documents', 'delete')
  );

create index if not exists attachments_doc_idx on public.attachments (document_id, created_at desc);

-- ------------------------------------- หนังสือรับรองการหักภาษี ณ ที่จ่าย
-- เพิ่มการอ้างถึงเอกสารต้นทาง และสถานะยกเลิก (ของเดิมผูกกับใบจ่ายเงินเท่านั้น)
alter table public.wht_certificates
  add column if not exists document_id uuid references public.documents(id) on delete set null,
  add column if not exists status text not null default 'issued'
      check (status in ('issued','cancelled')),
  add column if not exists payee_snapshot jsonb;

create index if not exists wht_cert_doc_idx on public.wht_certificates (document_id);
create index if not exists wht_cert_period_idx on public.wht_certificates (company_id, cert_date desc);

-- กันออกซ้ำจากเอกสารเดียวกัน (นับเฉพาะฉบับที่ยังไม่ยกเลิก)
create unique index if not exists wht_cert_doc_unique
  on public.wht_certificates (document_id) where status = 'issued' and document_id is not null;

-- ------------------------------------------------------------------------
-- ออกหนังสือรับรองจากเอกสารฝั่งซื้อที่หักภาษีไว้
-- รวมรายการที่ประเภทเงินได้และอัตราเดียวกันเป็นบรรทัดเดียว ตามรูปแบบแบบ 50 ทวิ
-- ------------------------------------------------------------------------
create or replace function public.issue_wht_certificate(
  p_document  uuid,
  p_condition smallint default 1
)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_doc     public.documents%rowtype;
  v_contact public.contacts%rowtype;
  v_cert    uuid;
  v_number  text;
  v_seq     int;
  v_form    text;
begin
  select * into v_doc from public.documents where id = p_document;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;

  if not app.has_perm(v_doc.company_id, 'tax', 'create') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์ออกหนังสือรับรองหัก ณ ที่จ่าย';
  end if;
  if v_doc.status = 'void' then
    raise exception 'DOC_VOID: เอกสารถูกยกเลิกแล้ว';
  end if;
  if coalesce(v_doc.wht_amount, 0) <= 0 then
    raise exception 'NO_WHT: เอกสารนี้ไม่มีการหักภาษี ณ ที่จ่าย';
  end if;
  if exists (select 1 from public.wht_certificates
             where document_id = p_document and status = 'issued') then
    raise exception 'ALREADY_ISSUED: เอกสารนี้ออกหนังสือรับรองไปแล้ว';
  end if;

  select * into v_contact from public.contacts where id = v_doc.contact_id;

  -- แบบที่ต้องยื่นดูจากประเภทเงินได้ที่ใช้จริงในเอกสาร ถ้าไม่ระบุจึงเดาจากสถานะผู้รับเงิน
  select wt.pnd_form into v_form
  from public.document_lines dl
  join public.wht_types wt on wt.code = dl.wht_code
  where dl.document_id = p_document and coalesce(dl.wht_amount, 0) > 0
  order by dl.line_no
  limit 1;

  v_form := coalesce(v_form,
    case when coalesce(v_contact.is_juristic, true) then 'ภ.ง.ด.53' else 'ภ.ง.ด.3' end);

  -- เลขที่หนังสือรับรองนับต่อเนื่องรายปีตามปีที่จ่ายเงิน
  select count(*) + 1 into v_seq
  from public.wht_certificates
  where company_id = v_doc.company_id
    and extract(year from cert_date) = extract(year from v_doc.doc_date);
  v_number := 'WHT' || to_char(v_doc.doc_date, 'YYYY') || '-' || lpad(v_seq::text, 4, '0');

  insert into public.wht_certificates (
    company_id, cert_number, cert_date, pnd_form, contact_id, document_id,
    tax_id, condition_code, payee_snapshot, base_total, wht_total, created_by
  ) values (
    v_doc.company_id, v_number, v_doc.doc_date, v_form, v_doc.contact_id, p_document,
    v_contact.tax_id, coalesce(p_condition, 1),
    coalesce(v_doc.contact_snapshot, to_jsonb(v_contact)), 0, 0, auth.uid()
  ) returning id into v_cert;

  insert into public.wht_certificate_lines (
    cert_id, company_id, wht_code, description, pay_date, base_amount, rate, wht_amount
  )
  select
    v_cert, v_doc.company_id, g.wht_code,
    coalesce(wt.name_th, 'ตามเอกสารเลขที่ ' || v_doc.doc_number),
    v_doc.doc_date, g.base, g.rate, g.wht
  from (
    select dl.wht_code,
           dl.wht_rate            as rate,
           sum(dl.line_amount)    as base,
           sum(dl.wht_amount)     as wht
    from public.document_lines dl
    where dl.document_id = p_document and coalesce(dl.wht_amount, 0) > 0
    group by dl.wht_code, dl.wht_rate
  ) g
  left join public.wht_types wt on wt.code = g.wht_code;

  update public.wht_certificates c
     set base_total = t.base, wht_total = t.wht
    from (select coalesce(sum(base_amount), 0) as base,
                 coalesce(sum(wht_amount), 0)  as wht
          from public.wht_certificate_lines where cert_id = v_cert) t
   where c.id = v_cert;

  return v_cert;
end $$;

grant execute on function public.issue_wht_certificate(uuid, smallint) to authenticated;

-- ------------------------------------------------------------------------
-- ยกเลิกหนังสือรับรอง (ออกผิด / เอกสารต้นทางถูกยกเลิก)
-- ------------------------------------------------------------------------
create or replace function public.cancel_wht_certificate(p_cert uuid)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare v_company uuid;
begin
  select company_id into v_company from public.wht_certificates where id = p_cert;
  if v_company is null then raise exception 'CERT_NOT_FOUND'; end if;
  if not app.has_perm(v_company, 'tax', 'edit') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์ยกเลิกหนังสือรับรอง';
  end if;
  update public.wht_certificates set status = 'cancelled' where id = p_cert;
end $$;

grant execute on function public.cancel_wht_certificate(uuid) to authenticated;
