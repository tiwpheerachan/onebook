-- =====================================================================
-- 0026 : เพิ่มบริษัทจริงในเครือเป็นค่าเริ่มต้น
--
--  แต่ละบริษัทได้ผังบัญชีมาตรฐานไทย บทบาท 7 บทบาท รูปแบบเลขที่เอกสาร
--  และช่องทางเงินสดเริ่มต้น เหมือนกับการกดเปิดบริษัทใหม่ผ่านหน้าจอ
--  ผู้ดูแลระดับกลุ่มได้สิทธิ์เจ้าของกิจการทุกบริษัทโดยอัตโนมัติ
--
--  รันซ้ำได้ ไม่สร้างซ้ำ (ยึดจากรหัสบริษัท)
-- =====================================================================

do $$
declare
  v_admin uuid;
  v_id    uuid;
  v_role  uuid;
  c       record;
begin
  select id into v_admin from public.profiles where is_group_admin and is_active order by created_at limit 1;
  if v_admin is null then
    raise exception 'ยังไม่มีผู้ดูแลระดับกลุ่ม กรุณารัน 0011_bootstrap_admin.sql ก่อน';
  end if;

  for c in
    select * from (values
      ('TOPONE',
       'บริษัท ท็อป วัน ดิสทริบิวชั่น จำกัด',
       'TOP ONE DISTRIBUTION CO., LTD.',
       '0105565027615',
       '41 ซอยเอกชัย 108 แขวงบางบอนเหนือ เขตบางบอน กรุงเทพมหานคร 10150',
       'นายวินัย หนูรูปงาม'),

      ('RABBIT',
       'บริษัท แรบบิท (ประเทศไทย) จำกัด',
       'RABBIT (THAILAND) CO., LTD.',
       '0105561071873',
       '88/131 ถนนกัลปพฤกษ์ แขวงบางแค เขตบางแค กรุงเทพมหานคร 10160',
       'นายวินัย หนูรูปงาม'),

      ('SHD',
       'บริษัท เอสเอชดี เทคโนโลยี จำกัด',
       'SHD TECHNOLOGY CO., LTD.',
       '0105563022918',
       '168 อาคารไอซีเอส ชั้นที่ 7 ห้อง 703-704 ถนนเจริญนคร แขวงคลองต้นไทร เขตคลองสาน กรุงเทพมหานคร 10600',
       'นายประดิษฐ์ แสนแก้ว'),

      ('PTC',
       'บริษัท พี ที ซี ดิสทริบิวชั่น จำกัด',
       'PCT DISTRIBUTION CO., LTD.',
       '0105568104092',
       '199/9 ถนนรัชดาภิเษก (ท่าพระ-ตากสิน) แขวงบุคคโล เขตธนบุรี กรุงเทพมหานคร 10600',
       'นายพิพัชร์ ธรรมการฐิติคุณ'),

      ('HASHTAG',
       'บริษัท แฮชแท็ก ซีเล็คชั่น จำกัด',
       'HASHTAG SELECTION CO., LTD.',
       '0105568015456',
       '168 อาคารไอซีเอส ทาวเวอร์ ชั้นที่ 7 ห้อง 701 ถนนเจริญนคร แขวงคลองต้นไทร เขตคลองสาน กรุงเทพมหานคร 10600',
       'MR. CHEN JINZHI และ MR. CHEN JINBIAO'),

      -- เทราโนวา เทคโนโลยี : เลขผู้เสียภาษีที่ได้รับมามี 12 หลัก ไม่ครบ 13 หลัก
      -- จึงยังไม่ใส่เลขไว้ กันไม่ให้พิมพ์เลขผิดลงบนใบกำกับภาษี
      ('TERRA',
       'บริษัท เทราโนวา เทคโนโลยี จำกัด',
       'TERRANOVA TECHNOLOGY CO., LTD.',
       null,
       '168 อาคารไอซีเอส ชั้นที่ 7 ห้อง 702 ถนนเจริญนคร แขวงคลองต้นไทร เขตคลองสาน กรุงเทพมหานคร 10600',
       'MR. CHEN JINZHI')
    ) as x(code, name_th, name_en, tax_id, address_th, signer)
  loop
    select id into v_id from public.companies where code = c.code;

    if v_id is null then
      -- สร้างบริษัทพร้อมผังบัญชี บทบาท และเลขที่เอกสาร
      insert into public.companies (code, name_th, name_en, tax_id, address_th,
                                    authorized_signer, legal_form, branch_code, branch_name)
      values (c.code, c.name_th, c.name_en, c.tax_id, c.address_th,
              c.signer, 'บริษัทจำกัด', '00000', 'สำนักงานใหญ่')
      returning id into v_id;

      perform app.seed_chart_of_accounts(v_id);
      perform app.seed_default_roles(v_id);
      perform app.seed_doc_sequences(v_id);

      insert into public.financial_channels (company_id, code, name, kind, account_id)
      select v_id, 'CASH', 'เงินสด', 'cash', a.id
      from public.accounts a where a.company_id = v_id and a.code = '1110';

      raise notice 'สร้างบริษัท % (%)', c.name_th, c.code;
    else
      -- มีอยู่แล้ว : อัปเดตเฉพาะข้อมูลที่ใช้พิมพ์บนเอกสาร
      update public.companies set
        name_th = c.name_th, name_en = c.name_en, tax_id = c.tax_id,
        address_th = c.address_th, authorized_signer = c.signer
      where id = v_id;
      raise notice 'อัปเดตข้อมูลบริษัท % (%)', c.name_th, c.code;
    end if;

    -- ให้ผู้ดูแลระดับกลุ่มเข้าถึงได้ในฐานะเจ้าของกิจการ
    select id into v_role from public.roles where company_id = v_id and code = 'owner';
    insert into public.user_companies (user_id, company_id, role_id, can_view_subsidiaries, is_active)
    values (v_admin, v_id, v_role, true, true)
    on conflict (user_id, company_id) do update
      set role_id = excluded.role_id, is_active = true;
  end loop;
end $$;
