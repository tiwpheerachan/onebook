-- ============================================================================
-- ONEBOOK 0077 : รับค่าเสื่อมราคาจากระบบทรัพย์สิน (Asset) มาลงสมุดรายวัน GL
--
--   post_external_depreciation()  ลง 1 ชุดต่องวด: เดบิตค่าเสื่อมราคา(6170) / เครดิตค่าเสื่อมสะสม(12x1)
--                                 รับ lines[{amount, asset_account_code, description}]
--                                 derive บัญชีค่าเสื่อมสะสม = รหัสบัญชีสินทรัพย์ + 1 (1230→1231)
--                                 กันลงซ้ำงวดเดิม (source_type='asset_depreciation' + entry_date งวด)
--   ใช้ที่ endpoint POST /api/integrations/depreciation-journal (token auth)
-- ============================================================================

create or replace function public.post_external_depreciation(
  p_company uuid, p_period_end date, p_lines jsonb
) returns json language plpgsql security definer set search_path = public, app as $$
declare
  v_period date := (date_trunc('month', p_period_end) + interval '1 month - 1 day')::date;
  v_entry  uuid;
  v_line   int := 0;
  v_total  numeric(18,2) := 0;
  v_count  int := 0;
  v_exp    uuid;
  rec      jsonb;
  v_amt    numeric(18,2);
  v_asset_code text;
  v_accum_code text;
  v_accum  uuid;
  v_desc   text;
begin
  -- กันลงซ้ำงวดเดิม — ถ้าเคยลงค่าเสื่อมจากระบบทรัพย์สินงวดนี้แล้ว คืนเล่มเดิม ไม่ลงซ้ำ
  select id into v_entry from public.journal_entries
   where company_id = p_company and book = 'ADJ'
     and source_type = 'asset_depreciation' and entry_date = v_period
   limit 1;
  if v_entry is not null then
    return json_build_object('entry_id', v_entry, 'reused', true, 'count', 0, 'total', 0);
  end if;

  perform app.assert_period_open(p_company, v_period, 'all');
  v_exp := app.acc(p_company, 'depreciation');

  insert into public.journal_entries(company_id, entry_number, entry_date, book, description, source_type, status, is_auto, posted_at)
  values (p_company, app.next_entry_number(p_company,'ADJ',v_period), v_period, 'ADJ',
          'ค่าเสื่อมราคาประจำงวด (ระบบทรัพย์สิน) ' || to_char(v_period,'MM/YYYY'),
          'asset_depreciation', 'posted', true, now())
  returning id into v_entry;

  for rec in select * from jsonb_array_elements(p_lines) loop
    v_amt := round(coalesce((rec->>'amount')::numeric, 0), 2);
    continue when v_amt <= 0;
    v_asset_code := rec->>'asset_account_code';
    v_desc := coalesce(nullif(rec->>'description',''), 'ค่าเสื่อมราคา');
    -- บัญชีค่าเสื่อมสะสม = รหัสบัญชีสินทรัพย์ + 1 (1220→1221, 1230→1231, ...)
    begin
      v_accum_code := ((v_asset_code)::int + 1)::text;
    exception when others then
      raise exception 'BAD_ASSET_ACCOUNT_CODE: %', v_asset_code;
    end;
    select id into v_accum from public.accounts
      where company_id = p_company and code = v_accum_code and not is_header limit 1;
    if v_accum is null then
      raise exception 'ACCUM_ACCOUNT_NOT_FOUND: ไม่พบบัญชีค่าเสื่อมสะสม % (จากบัญชีสินทรัพย์ %)', v_accum_code, v_asset_code;
    end if;

    v_line := v_line + 1;
    insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
    values (v_entry, p_company, v_line, v_exp, v_desc, v_amt, 0);
    v_line := v_line + 1;
    insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
    values (v_entry, p_company, v_line, v_accum, v_desc, 0, v_amt);

    v_total := v_total + v_amt;
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    delete from public.journal_entries where id = v_entry;
    return json_build_object('entry_id', null, 'reused', false, 'count', 0, 'total', 0);
  end if;

  return json_build_object('entry_id', v_entry, 'reused', false, 'count', v_count, 'total', v_total);
end $$;

grant execute on function public.post_external_depreciation(uuid, date, jsonb) to authenticated, service_role;
