-- =====================================================================
-- 0035 : ข้อมูลจำลองสำหรับดูหน้าตาการทำงาน พร้อมลบออกได้สะอาด
--
--  โจทย์คือ "ลบได้หมดจดตอนเริ่มใช้จริง"
--
--  วิธีที่ไม่เลือก : ทำเครื่องหมายด้วยคำนำหน้าชื่อ เช่น [ตัวอย่าง] แล้วลบตามคำนั้น
--  เพราะวันหนึ่งจะมีลูกค้าจริงชื่อขึ้นต้นแบบนั้น หรือมีคนพิมพ์คำนั้นในเอกสารจริง
--  แล้วคำสั่งลบจะกวาดข้อมูลจริงไปด้วย ซึ่งกู้คืนไม่ได้
--
--  วิธีที่เลือก : จดทะเบียนทุกแถวที่สร้างไว้ในตาราง demo_seed_rows
--  ตอนลบก็ลบเฉพาะ id ที่จดไว้เท่านั้น ไม่แตะอะไรที่ไม่ได้สร้างเอง
--  ต่อให้ข้อมูลจริงหน้าตาเหมือนกันเป๊ะก็ไม่โดนลบ
-- =====================================================================

create table if not exists public.demo_seed_rows (
  id         bigserial primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  table_name text not null,
  record_id  uuid not null,
  created_at timestamptz not null default now(),
  unique (table_name, record_id)
);

alter table public.demo_seed_rows enable row level security;
alter table public.demo_seed_rows force  row level security;

drop policy if exists "demo_seed_sel" on public.demo_seed_rows;
create policy "demo_seed_sel" on public.demo_seed_rows for select
  using (app.has_perm(company_id, 'documents', 'view'));

comment on table public.demo_seed_rows is
  'ทะเบียนแถวที่ข้อมูลจำลองสร้างไว้ — ใช้ลบคืนให้ตรงเป๊ะโดยไม่แตะข้อมูลจริง';

-- ------------------------------------------------------------------------
-- สร้างข้อมูลจำลอง
--
-- ครอบคลุมของที่เพิ่งทำ เพื่อให้เห็นหน้าตาการทำงานจริง
--   · ลูกค้าที่มีรอบการซื้อ ทั้งที่ยังอยู่ในรอบ ใกล้ถึงรอบ และเลยรอบ
--   · สายเอกสาร ใบเสนอราคา → ใบแจ้งหนี้ → ใบเสร็จ + ใบลดหนี้ (ดูแผนภาพที่มา)
--   · บิลซื้อที่มีภาษีซื้อรอใช้สิทธิ์ ทั้งพักไว้และเกิน 6 เดือน
-- ------------------------------------------------------------------------
create or replace function public.seed_demo_data(p_company uuid)
returns json
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_n      int := 0;
  v_cust   uuid[];
  v_vend   uuid;
  v_id     uuid;
  v_q      uuid;
  v_inv    uuid;
  i        int;
  j        int;
  v_names  text[] := array[
    'บจก. สยามฟู้ดส์ ซัพพลาย', 'บจก. เชียงใหม่ ออร์แกนิค', 'หจก. บูรพา เอ็นจิเนียริ่ง',
    'บจก. อันดามัน รีสอร์ท กรุ๊ป', 'บจก. อีสาน โลจิสติกส์'];
  -- ลูกค้าซื้อทุกกี่วัน และเว้นว่างมากี่วันแล้ว (ใช้สร้างสถานะรอบให้ครบทุกแบบ)
  v_cycle  int[] := array[30, 30, 7, 60, 14];
  v_gap    int[] := array[45,  8, 2, 70, 20];
begin
  if not app.has_perm(p_company, 'documents', 'create') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์สร้างเอกสาร';
  end if;

  if exists (select 1 from public.demo_seed_rows where company_id = p_company) then
    raise exception 'ALREADY_SEEDED: บริษัทนี้มีข้อมูลจำลองอยู่แล้ว ลบก่อนจึงจะสร้างใหม่ได้';
  end if;

  -- ---------------- ผู้ติดต่อ ----------------
  for i in 1..array_length(v_names, 1) loop
    insert into public.contacts (company_id, code, kind, name, tax_id, phone, credit_days)
    values (p_company, 'DEMO-C' || i, 'customer', v_names[i],
            lpad((1050000000000 + i)::text, 13, '0'), '02-555-00' || i, 30)
    returning id into v_id;
    insert into public.demo_seed_rows (company_id, table_name, record_id)
    values (p_company, 'contacts', v_id);
    v_cust := array_append(v_cust, v_id);
    v_n := v_n + 1;
  end loop;

  insert into public.contacts (company_id, code, kind, name, tax_id, phone, credit_days)
  values (p_company, 'DEMO-V1', 'vendor', 'บจก. ไทยพาณิชย์ ซัพพลายเออร์',
          '0105560000019', '02-555-100', 30)
  returning id into v_vend;
  insert into public.demo_seed_rows (company_id, table_name, record_id)
  values (p_company, 'contacts', v_vend);
  v_n := v_n + 1;

  -- ---------------- ประวัติการซื้อ ทำให้เกิดรอบการขาย ----------------
  for i in 1..array_length(v_cust, 1) loop
    -- ซื้อย้อนหลัง 5 ครั้งตามรอบของลูกค้ารายนั้น ครั้งล่าสุดห่างมาแล้ว v_gap วัน
    for j in 0..4 loop
      insert into public.documents
        (company_id, kind, doc_number, doc_date, contact_id,
         vat_base, vat_amount, subtotal, grand_total, net_payable, paid_amount, status)
      values (p_company, 'invoice',
              'DEMO-INV-' || i || '-' || j,
              current_date - v_gap[i] - (j * v_cycle[i]),
              v_cust[i],
              10000 * i, 700 * i, 10000 * i, 10700 * i, 10700 * i, 10700 * i, 'paid')
      returning id into v_id;
      insert into public.demo_seed_rows (company_id, table_name, record_id)
      values (p_company, 'documents', v_id);
      v_n := v_n + 1;
    end loop;
  end loop;

  -- ---------------- สายเอกสารสำหรับดูแผนภาพที่มาของตัวเลข ----------------
  insert into public.documents
    (company_id, kind, doc_number, doc_date, contact_id,
     vat_base, vat_amount, subtotal, grand_total, net_payable, status)
  values (p_company, 'quotation', 'DEMO-QT-001', current_date - 40, v_cust[1],
          50000, 3500, 50000, 53500, 53500, 'approved')
  returning id into v_q;
  insert into public.demo_seed_rows values (default, p_company, 'documents', v_q, now());
  v_n := v_n + 1;

  insert into public.documents
    (company_id, kind, doc_number, doc_date, contact_id, ref_document_id,
     vat_base, vat_amount, subtotal, grand_total, net_payable, paid_amount, status)
  values (p_company, 'tax_invoice', 'DEMO-TX-001', current_date - 32, v_cust[1], v_q,
          50000, 3500, 50000, 53500, 53500, 53500, 'paid')
  returning id into v_inv;
  insert into public.demo_seed_rows values (default, p_company, 'documents', v_inv, now());
  v_n := v_n + 1;

  insert into public.documents
    (company_id, kind, doc_number, doc_date, contact_id, ref_document_id,
     vat_base, vat_amount, subtotal, grand_total, net_payable, status)
  values (p_company, 'receipt', 'DEMO-RC-001', current_date - 25, v_cust[1], v_inv,
          50000, 3500, 50000, 53500, 53500, 'paid')
  returning id into v_id;
  insert into public.demo_seed_rows values (default, p_company, 'documents', v_id, now());
  v_n := v_n + 1;

  insert into public.documents
    (company_id, kind, doc_number, doc_date, contact_id, ref_document_id,
     vat_base, vat_amount, subtotal, grand_total, net_payable, status, notes)
  values (p_company, 'credit_note', 'DEMO-CN-001', current_date - 20, v_cust[1], v_inv,
          -5000, -350, -5000, -5350, -5350, 'approved', 'สินค้าชำรุด 1 รายการ')
  returning id into v_id;
  insert into public.demo_seed_rows values (default, p_company, 'documents', v_id, now());
  v_n := v_n + 1;

  -- ---------------- ภาษีซื้อรอใช้สิทธิ์ ----------------
  -- ใบที่พักไว้เพราะใบกำกับยังมาไม่ถึง
  insert into public.documents
    (company_id, kind, doc_number, doc_date, contact_id,
     vat_base, vat_amount, subtotal, grand_total, net_payable, status,
     vat_deferred, vat_note)
  values (p_company, 'bill', 'DEMO-BL-001', current_date - 20, v_vend,
          80000, 5600, 80000, 85600, 85600, 'approved',
          true, 'ใบกำกับตัวจริงยังไม่ได้รับจากผู้ขาย')
  returning id into v_id;
  insert into public.demo_seed_rows values (default, p_company, 'documents', v_id, now());
  v_n := v_n + 1;

  -- ใบที่เก่ากว่า 6 เดือน ควรขึ้นเตือน
  insert into public.documents
    (company_id, kind, doc_number, doc_date, contact_id,
     vat_base, vat_amount, subtotal, grand_total, net_payable, status,
     vat_deferred, vat_note)
  values (p_company, 'bill', 'DEMO-BL-002', current_date - 230, v_vend,
          120000, 8400, 120000, 128400, 128400, 'approved',
          true, 'ค้างนาน ต้องตรวจสิทธิ์ก่อนใช้')
  returning id into v_id;
  insert into public.demo_seed_rows values (default, p_company, 'documents', v_id, now());
  v_n := v_n + 1;

  -- ใบที่ยกไปใช้สิทธิ์เดือนหน้าแล้ว
  insert into public.documents
    (company_id, kind, doc_number, doc_date, contact_id,
     vat_base, vat_amount, subtotal, grand_total, net_payable, status, vat_tax_month)
  values (p_company, 'bill', 'DEMO-BL-003', current_date - 10, v_vend,
          60000, 4200, 60000, 64200, 64200, 'approved',
          (date_trunc('month', current_date) + interval '1 month')::date)
  returning id into v_id;
  insert into public.demo_seed_rows values (default, p_company, 'documents', v_id, now());
  v_n := v_n + 1;

  return json_build_object('ok', true, 'rows', v_n);
end $$;

grant execute on function public.seed_demo_data(uuid) to authenticated;

-- ------------------------------------------------------------------------
-- ลบข้อมูลจำลองออกให้หมด
--
-- ลบเฉพาะ id ที่จดทะเบียนไว้เท่านั้น ข้อมูลจริงจึงปลอดภัย 100%
-- ลบเอกสารก่อนผู้ติดต่อ เพราะเอกสารอ้างถึงผู้ติดต่ออยู่
-- ------------------------------------------------------------------------
create or replace function public.purge_demo_data(p_company uuid)
returns json
language plpgsql
security definer
set search_path = public, app
as $$
declare v_docs int := 0; v_contacts int := 0;
begin
  if not app.has_perm(p_company, 'documents', 'delete') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์ลบเอกสาร';
  end if;

  delete from public.documents d
  using public.demo_seed_rows r
  where r.company_id = p_company and r.table_name = 'documents'
    and d.id = r.record_id and d.company_id = p_company;
  get diagnostics v_docs = row_count;

  delete from public.contacts c
  using public.demo_seed_rows r
  where r.company_id = p_company and r.table_name = 'contacts'
    and c.id = r.record_id and c.company_id = p_company;
  get diagnostics v_contacts = row_count;

  delete from public.demo_seed_rows where company_id = p_company;

  return json_build_object('ok', true, 'documents', v_docs, 'contacts', v_contacts);
end $$;

grant execute on function public.purge_demo_data(uuid) to authenticated;

-- จำนวนข้อมูลจำลองที่มีอยู่ ใช้ตัดสินว่าจะโชว์ปุ่มสร้างหรือปุ่มลบ
create or replace function public.rpt_demo_status(p_company uuid)
returns json
language sql
stable
set search_path = public, app
as $$
  select json_build_object(
    'contacts',  (select count(*) from public.demo_seed_rows
                  where company_id = p_company and table_name = 'contacts'),
    'documents', (select count(*) from public.demo_seed_rows
                  where company_id = p_company and table_name = 'documents'),
    'seeded_at', (select min(created_at) from public.demo_seed_rows where company_id = p_company)
  );
$$;

grant execute on function public.rpt_demo_status(uuid) to authenticated;
