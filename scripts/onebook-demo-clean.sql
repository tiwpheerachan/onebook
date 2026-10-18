-- ลบข้อมูลตัวอย่าง (DEMO) ของ ONEBOOK ออกทั้งหมด — เฉพาะที่ทำเครื่องหมาย notes='DEMO-SEED' / code เริ่ม 'DEMO-'
-- ไม่กระทบข้อมูลจริง · รันผ่าน scripts/onebook-demo.mjs clean
do $$
declare
  v_co uuid := 'c440378b-f9b7-4a51-b01b-8a75ec32bd1d';   -- SHD
  v_admin uuid := 'eb06c88c-796f-4994-9418-74b65a5860ad';
  v_entries uuid[];
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);

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
end $$;
