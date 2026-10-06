-- ============================================================================
-- ONEBOOK 0073 : ข้อมูลทรัพย์สินสำหรับหน้าสแกน QR สาธารณะ
--
--   rpt_asset_public()  คืนเฉพาะข้อมูล "ระบุตัวทรัพย์สิน" (ไม่มีราคาทุน/ค่าเสื่อม/มูลค่า)
--                       ใช้บนหน้า /scan/{id} ที่เปิดดูได้โดยไม่ต้องล็อกอิน
--                       security definer + คืนเฉพาะคอลัมน์ปลอดภัย จึงปล่อยให้ anon เรียกได้
-- ============================================================================

create or replace function public.rpt_asset_public(p_id uuid)
returns table (
  code text, name text, name_en text, category text,
  serial_no text, location text, status text,
  acquired_date date, in_service_date date,
  company_name text, supplier_name text
) language sql stable security definer set search_path = public, app as $$
  select fa.code, fa.name, fa.name_en, fa.category,
         fa.serial_no, fa.location, fa.status::text,
         fa.acquired_date, fa.in_service_date,
         co.name_th, ct.name
  from public.fixed_assets fa
  join public.companies co on co.id = fa.company_id
  left join public.contacts ct on ct.id = fa.supplier_id
  where fa.id = p_id;
$$;

grant execute on function public.rpt_asset_public(uuid) to anon, authenticated;
