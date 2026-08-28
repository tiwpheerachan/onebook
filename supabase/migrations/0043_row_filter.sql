-- =====================================================================
-- 0043 : จำกัดสิทธิ์ระดับแถว (row filter)
--
--  ช่อง row_filter มีอยู่ในตาราง role_permissions ตั้งแต่ต้น แต่ไม่เคยมีตรรกะ
--  เป็นช่องว่างแบบเดียวกับ field_mask ที่เพิ่งแก้ไป คือตั้งค่าได้แต่ไม่มีผล
--
--  หลักที่ยึดในการออกแบบ
--
--  1) เป็นชุดตัวเลือกที่ปิดตาย ไม่ใช่เงื่อนไขอิสระ
--     ถ้าปล่อยให้เขียนเงื่อนไขเองแล้วเอาไปต่อเป็น SQL จะกลายเป็นช่องโหว่ทันที
--     รับเฉพาะรูปแบบที่กำหนดไว้ อย่างอื่นถือว่าไม่มีเงื่อนไข
--
--  2) ไม่ตั้งค่า = เห็นทุกแถวเหมือนเดิม
--     ของเดิมทั้งระบบต้องไม่เปลี่ยนพฤติกรรมแม้แต่นิดเดียว
--     การเผลอทำให้คนมองไม่เห็นข้อมูลของตัวเองเสียหายกว่าการเห็นมากไป
--
--  3) มีหลายเงื่อนไข ให้ผ่านข้อใดข้อหนึ่งก็พอ
--     เลือกทางที่ปลอดภัยกว่าเมื่อการตั้งค่าคลุมเครือ
--
--  รูปแบบที่รองรับ
--    {"mode":"own"}                          เห็นเฉพาะที่ตัวเองเป็นคนสร้าง
--    {"mode":"contact_group","ids":[uuid...]} เห็นเฉพาะคู่ค้าในกลุ่มที่รับผิดชอบ
-- =====================================================================

-- เงื่อนไขที่มีผลกับผู้ใช้ปัจจุบันสำหรับทรัพยากรหนึ่ง
create or replace function app.row_filters(p_company uuid, p_resource text)
returns jsonb
language sql
stable
security definer
set search_path = public, app
as $$
  select coalesce(jsonb_agg(rp.row_filter), '[]'::jsonb)
  from public.user_companies uc
  join public.role_permissions rp on rp.role_id = uc.role_id
  where uc.user_id = auth.uid() and uc.company_id = p_company and uc.is_active
    and rp.row_filter is not null
    and rp.row_filter <> '{}'::jsonb
    and rp.row_filter ? 'mode'
    and (rp.resource = '*' or rp.resource = p_resource or p_resource like rp.resource || '.%');
$$;

-- ------------------------------------------------------------------------
-- แถวนี้ผู้ใช้ปัจจุบันเห็นได้ไหม
--
-- ต้องเร็วมากเพราะถูกเรียกทุกแถวใน RLS
-- ทางลัดสองข้อแรกจึงตัดจบก่อนแตะตารางอื่น
-- ------------------------------------------------------------------------
create or replace function app.row_visible(
  p_company    uuid,
  p_resource   text,
  p_created_by uuid default null,
  p_contact    uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare v_filters jsonb; f jsonb;
begin
  -- ผู้ดูแลกลุ่มเห็นทุกอย่างเสมอ
  if app.is_group_admin() then return true; end if;

  v_filters := app.row_filters(p_company, p_resource);
  -- ไม่ตั้งเงื่อนไข = เห็นทุกแถวเหมือนเดิม
  if jsonb_array_length(v_filters) = 0 then return true; end if;

  for f in select * from jsonb_array_elements(v_filters) loop
    case f->>'mode'
      when 'own' then
        if p_created_by is not null and p_created_by = auth.uid() then return true; end if;

      when 'contact_group' then
        if p_contact is not null and exists (
          select 1 from public.contact_group_members m
          where m.contact_id = p_contact
            and m.group_id::text = any(
              select jsonb_array_elements_text(coalesce(f->'ids', '[]'::jsonb)))
        ) then return true; end if;

      else
        -- รูปแบบที่ไม่รู้จัก ถือว่าไม่ได้ตั้งเงื่อนไข ปลอดภัยกว่าปิดกั้นมั่ว
        return true;
    end case;
  end loop;

  return false;
end $$;

grant execute on function app.row_filters(uuid, text) to authenticated;
grant execute on function app.row_visible(uuid, text, uuid, uuid) to authenticated;

-- ------------------------------------------------------------------------
-- ผูกเข้ากับ RLS ของสองตารางที่ใช้จริง
--
-- แก้เฉพาะนโยบายอ่าน ไม่แตะการเขียน เพราะการเขียนคุมด้วยสิทธิ์ระดับเมนูอยู่แล้ว
-- และการทำให้บันทึกไม่ได้เพราะเงื่อนไขแถวจะงงกว่ามาก
-- ------------------------------------------------------------------------
drop policy if exists "documents_sel" on public.documents;
create policy "documents_sel" on public.documents for select to authenticated
  using (
    app.has_perm(company_id, 'documents', 'view')
    and app.row_visible(company_id, 'documents', created_by, contact_id)
  );

drop policy if exists "contacts_sel" on public.contacts;
create policy "contacts_sel" on public.contacts for select to authenticated
  using (
    app.has_perm(company_id, 'contacts', 'view')
    and app.row_visible(company_id, 'contacts', null, id)
  );

-- ------------------------------------------------------------------------
-- ตั้งเงื่อนไขให้บทบาท — ตรวจรูปแบบก่อนเก็บเสมอ
-- ------------------------------------------------------------------------
create or replace function public.set_row_filter(
  p_role     uuid,
  p_resource text,
  p_filter   jsonb default null
)
returns json
language plpgsql
security definer
set search_path = public, app
as $$
declare v_company uuid; v_mode text;
begin
  select company_id into v_company from public.roles where id = p_role;
  if v_company is null then raise exception 'ROLE_NOT_FOUND'; end if;

  if not app.has_perm(v_company, 'settings.roles', 'edit') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์แก้ไขบทบาท';
  end if;

  if p_filter is not null and p_filter <> '{}'::jsonb then
    v_mode := p_filter->>'mode';
    if v_mode not in ('own','contact_group') then
      raise exception 'BAD_MODE: รูปแบบเงื่อนไขไม่ถูกต้อง';
    end if;
    if v_mode = 'contact_group'
       and coalesce(jsonb_array_length(p_filter->'ids'), 0) = 0 then
      raise exception 'NEED_GROUPS: ต้องเลือกกลุ่มผู้ติดต่ออย่างน้อยหนึ่งกลุ่ม';
    end if;
  end if;

  update public.role_permissions
     set row_filter = coalesce(p_filter, '{}'::jsonb)
   where role_id = p_role and resource = p_resource;

  if not found then
    raise exception 'NO_PERMISSION_ROW: บทบาทนี้ยังไม่ได้กำหนดสิทธิ์สำหรับเมนูนี้';
  end if;

  return json_build_object('ok', true);
end $$;

grant execute on function public.set_row_filter(uuid, text, jsonb) to authenticated;

comment on function app.row_visible is
  'ตรวจว่าผู้ใช้ปัจจุบันเห็นแถวนี้ได้ไหม — ไม่ตั้งเงื่อนไข = เห็นทุกแถวเหมือนเดิม';
