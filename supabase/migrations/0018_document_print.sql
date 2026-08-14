-- =====================================================================
-- 0018 : ข้อมูลที่ต้องใช้ตอนพิมพ์เอกสารให้ลูกค้า
--   - ข้อมูลบริษัทที่ต้องปรากฏบนใบกำกับภาษีตามที่กรมสรรพากรกำหนด
--   - พร้อมเพย์ / บัญชีธนาคาร สำหรับพิมพ์ QR ให้ลูกค้าสแกนจ่าย
--   - บันทึกจำนวนครั้งที่พิมพ์ (ใบกำกับภาษีต้องระบุ "สำเนา" ตั้งแต่ใบที่ 2)
-- =====================================================================

alter table public.companies
  add column if not exists promptpay_id       text,
  add column if not exists promptpay_type     text check (promptpay_type in ('phone','natid','ewallet')),
  add column if not exists bank_name           text,
  add column if not exists bank_account_name   text,
  add column if not exists bank_account_no     text,
  add column if not exists doc_footer_note     text,
  add column if not exists authorized_signer   text;

comment on column public.companies.promptpay_id is
  'หมายเลขพร้อมเพย์ของบริษัท : เบอร์โทร 10 หลัก / เลขผู้เสียภาษี 13 หลัก / e-Wallet 15 หลัก';

-- --------------------------------------------------- บันทึกการพิมพ์เอกสาร
-- ใบกำกับภาษีที่พิมพ์ซ้ำต้องประทับว่าเป็น "สำเนา" ระบบจึงต้องรู้ว่าพิมพ์ไปกี่ครั้งแล้ว
create table if not exists public.document_prints (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  copy_no     int  not null,
  printed_by  uuid references public.profiles(id),
  printed_at  timestamptz not null default now()
);
create index if not exists document_prints_doc_idx on public.document_prints (document_id, printed_at desc);

alter table public.document_prints enable row level security;
alter table public.document_prints force row level security;

drop policy if exists "document_prints_sel" on public.document_prints;
create policy "document_prints_sel" on public.document_prints for select
  using (app.has_perm(company_id, 'documents', 'view'));

drop policy if exists "document_prints_ins" on public.document_prints;
create policy "document_prints_ins" on public.document_prints for insert
  with check (app.has_perm(company_id, 'documents', 'view'));

-- ------------------------------------------------------------------------
-- บันทึกว่ามีการพิมพ์ แล้วคืนเลขลำดับฉบับที่พิมพ์
-- ฉบับที่ 1 = ต้นฉบับ, ตั้งแต่ 2 ขึ้นไป = สำเนา
-- ------------------------------------------------------------------------
create or replace function public.record_document_print(p_document uuid)
returns int
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_company uuid;
  v_copy    int;
begin
  select company_id into v_company from public.documents where id = p_document;
  if v_company is null then
    raise exception 'DOCUMENT_NOT_FOUND';
  end if;
  if not app.has_perm(v_company, 'documents', 'view') then
    raise exception 'NO_PERMISSION';
  end if;

  select coalesce(max(copy_no), 0) + 1 into v_copy
  from public.document_prints where document_id = p_document;

  insert into public.document_prints (company_id, document_id, copy_no, printed_by)
  values (v_company, p_document, v_copy, auth.uid());

  return v_copy;
end;
$$;

grant execute on function public.record_document_print(uuid) to authenticated;
