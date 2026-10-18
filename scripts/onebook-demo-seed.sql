do $$
declare
  v_co uuid := 'c440378b-f9b7-4a51-b01b-8a75ec32bd1d';   -- SHD
  v_admin uuid := 'eb06c88c-796f-4994-9418-74b65a5860ad';
  v_entries uuid[];
  r record; cid uuid; did uuid; v_acct uuid;
  v_line numeric; v_vat numeric; v_grand numeric; v_sales boolean;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);

  -- ===== ล้าง demo เดิม (idempotent) =====
  select array_agg(journal_entry_id) into v_entries
    from public.documents where company_id=v_co and notes='DEMO-SEED' and journal_entry_id is not null;
  if v_entries is not null then
    delete from public.journal_lines where entry_id = any(v_entries);
    update public.documents set journal_entry_id=null where company_id=v_co and notes='DEMO-SEED';
    delete from public.journal_entries where id = any(v_entries);
  end if;
  delete from public.document_lines where document_id in
    (select id from public.documents where company_id=v_co and notes='DEMO-SEED');
  delete from public.documents where company_id=v_co and notes='DEMO-SEED';
  delete from public.contacts where company_id=v_co and code like 'DEMO-%';

  -- ===== สร้างเอกสาร + post =====
  for r in
    select * from (values
      -- ซื้อทรัพย์สิน (เข้าบัญชี 12xx → เป็น asset candidate) ให้ตรงกับสาย OA/Asset
      ('bill','DEMO-BILL-0001','2026-04-07','2026-05-07','DEMO-V001','Advice IT Infinite PCL (DEMO)','vendor','โน้ตบุ๊ก Dell Latitude 3550 (ขึ้นทะเบียนทรัพย์สิน 5 เครื่อง)',5,25700::numeric,'1240'),
      ('bill','DEMO-BILL-0002','2025-07-07','2025-08-06','DEMO-V002','Big Camera (DEMO)','vendor','กล้อง Sony A7 IV + เลนส์ (สตูดิโอไลฟ์ 2 ชุด)',2,98000::numeric,'1240'),
      ('bill','DEMO-BILL-0003','2023-08-20','2023-09-19','DEMO-V003','ตรีเพชรอีซูซุเซลส์ (DEMO)','vendor','รถกระบะ Isuzu D-Max (ทรัพย์สินถาวร)',1,785000::numeric,'1250'),
      ('expense','DEMO-EXP-0001','2024-06-11','2024-07-11','DEMO-V004','นิพนธ์ เน็ตเวิร์ค (DEMO)','vendor','Core Switch + Router (อุปกรณ์เครือข่าย 2 ชุด)',2,45000::numeric,'1240'),
      ('bill','DEMO-BILL-0004','2025-01-15','2025-02-14','DEMO-V005','คอมเซเว่น (DEMO)','vendor','License Adobe CC + Microsoft 365 (สินทรัพย์ไม่มีตัวตน)',1,120000::numeric,'1260'),
      -- ค่าใช้จ่ายดำเนินงาน (เข้าค่าใช้จ่ายทั่วไป)
      ('expense','DEMO-EXP-0002','2026-09-01','2026-09-30','DEMO-V006','บจก. ให้เช่าอาคารพหลโยธิน (DEMO)','vendor','ค่าเช่าสำนักงานใหญ่ เดือน ก.ย. 2569',1,45000::numeric,null),
      ('expense','DEMO-EXP-0003','2026-09-05','2026-09-20','DEMO-V007','การไฟฟ้า/สาธารณูปโภค (DEMO)','vendor','ค่าไฟฟ้า-น้ำประปา เดือน ส.ค. 2569',1,18500::numeric,null),
      ('expense','DEMO-EXP-0004','2026-08-20','2026-09-19','DEMO-V007','การไฟฟ้า/สาธารณูปโภค (DEMO)','vendor','ค่าโฆษณาออนไลน์ (Meta/Google Ads)',1,60000::numeric,null),
      ('expense','DEMO-EXP-0005','2026-10-02','2026-11-01','DEMO-V007','การไฟฟ้า/สาธารณูปโภค (DEMO)','vendor','ค่าอินเทอร์เน็ต + ค่าบริการคลาวด์',1,12000::numeric,null),
      ('expense','DEMO-EXP-0006','2026-07-03','2026-08-02','DEMO-V007','การไฟฟ้า/สาธารณูปโภค (DEMO)','vendor','ค่าขนส่งและโลจิสติกส์',1,22000::numeric,null),
      -- ขาย (รายได้ + ลูกหนี้ + ภาษีขาย) กระจายเดือนให้กราฟ/อายุลูกหนี้มีข้อมูล
      ('tax_invoice','DEMO-INV-0001','2026-08-05','2026-08-20','DEMO-C001','บมจ. สยามพาณิชย์ รีเทล (DEMO)','customer','ขายอุปกรณ์ไอทีพร้อมติดตั้ง',1,214000::numeric,null),
      ('tax_invoice','DEMO-INV-0002','2026-09-10','2026-09-25','DEMO-C002','ร้านค้าปลีก ดีมาร์ท (DEMO)','customer','ค่าบริการดูแลระบบรายเดือน',1,85600::numeric,null),
      ('invoice','DEMO-INV-0003','2026-07-12','2026-07-27','DEMO-C001','บมจ. สยามพาณิชย์ รีเทล (DEMO)','customer','โครงการวางระบบเครือข่ายสาขา',1,320000::numeric,null),
      ('tax_invoice','DEMO-INV-0004','2026-10-08','2026-10-23','DEMO-C003','บจก. เอเชีย เทรดดิ้ง (DEMO)','customer','ขายชุดกล้องวงจรปิดพร้อมติดตั้ง',1,128000::numeric,null),
      ('tax_invoice','DEMO-INV-0005','2026-06-15','2026-06-30','DEMO-C002','ร้านค้าปลีก ดีมาร์ท (DEMO)','customer','ค่าที่ปรึกษาและอบรมการใช้งาน',1,46000::numeric,null),
      ('tax_invoice','DEMO-INV-0006','2026-09-28','2026-10-13','DEMO-C003','บจก. เอเชีย เทรดดิ้ง (DEMO)','customer','ขายอุปกรณ์สตูดิโอไลฟ์',1,175000::numeric,null)
    ) as t(kind, docno, ddate, due, ccode, cname, ckind, descr, qty, price, acct)
  loop
    -- contact (สร้างครั้งเดียวต่อ code)
    select id into cid from public.contacts where company_id=v_co and code=r.ccode;
    if cid is null then
      insert into public.contacts (company_id, code, kind, name, credit_days)
        values (v_co, r.ccode, r.ckind::contact_kind, r.cname, 30) returning id into cid;
    end if;

    v_sales := r.kind in ('invoice','tax_invoice','debit_note');
    v_acct := null;
    if r.acct is not null then
      select id into v_acct from public.accounts where company_id=v_co and code=r.acct;
    end if;

    v_line := round(r.qty * r.price, 2);
    v_vat := round(v_line * 0.07, 2);
    v_grand := v_line + v_vat;

    insert into public.documents (company_id, kind, doc_number, doc_date, due_date, contact_id,
        subtotal, vat_base, vat_amount, wht_amount, grand_total, net_payable,
        status, notes, created_by, currency, exchange_rate)
      values (v_co, r.kind::doc_kind, r.docno, r.ddate::date, r.due::date, cid,
        v_line, v_line, v_vat, 0, v_grand, v_grand,
        'draft','DEMO-SEED', v_admin, 'THB', 1)
      returning id into did;

    insert into public.document_lines (document_id, company_id, line_no, description, quantity, unit, unit_price,
        vat_treatment, vat_rate, line_amount, vat_amount, wht_amount, account_id)
      values (did, v_co, 1, r.descr, r.qty, 'หน่วย', r.price,
        'exclusive', 7, v_line, v_vat, 0, v_acct);

    perform public.post_document(did);
  end loop;
end $$;
