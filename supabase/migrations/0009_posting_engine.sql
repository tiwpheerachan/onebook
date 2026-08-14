-- ============================================================================
-- ONEBOOK 0009 : เอนจินลงบัญชีอัตโนมัติ (เอกสาร -> สมุดรายวัน)
-- ============================================================================

create or replace function app.acc(p_company uuid, p_key text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.accounts where company_id = p_company and system_key = p_key limit 1;
$$;

create or replace function app.next_entry_number(p_company uuid, p_book text, p_date date)
returns text language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) + 1 into n from public.journal_entries
  where company_id = p_company and book = p_book
    and date_trunc('month', entry_date) = date_trunc('month', p_date);
  return p_book || '-' || to_char(p_date,'YYMM') || '-' || lpad(n::text, 4, '0');
end $$;

-- ลงบัญชีเอกสาร: เรียกเมื่อกด "อนุมัติ"
create or replace function public.post_document(p_document uuid)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare
  d record; l record;
  v_entry uuid; v_book text; v_line int := 0;
  v_ar uuid; v_ap uuid; v_vat_out uuid; v_vat_in uuid; v_wht_recv uuid; v_wht_pay uuid;
  v_is_purchase boolean;
begin
  select * into d from public.documents where id = p_document;
  if not found then raise exception 'DOC_NOT_FOUND'; end if;
  if not app.has_perm(d.company_id, 'documents', 'approve') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์อนุมัติ/ลงบัญชีเอกสาร';
  end if;
  perform app.assert_period_open(d.company_id, d.doc_date, 'all');
  if d.journal_entry_id is not null then return d.journal_entry_id; end if;

  v_is_purchase := d.kind::text in ('bill','expense','purchase_credit_note','purchase_debit_note','deposit_payment','goods_receipt');
  if d.kind::text in ('quotation','purchase_request','purchase_order','billing_note') then
    -- เอกสารที่ยังไม่กระทบบัญชี
    update public.documents set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_document;
    return null;
  end if;

  v_book    := case when v_is_purchase then 'PURCHASE' else 'SALE' end;
  v_ar      := app.acc(d.company_id,'ar');
  v_ap      := app.acc(d.company_id,'ap');
  v_vat_out := app.acc(d.company_id,'vat_output');
  v_vat_in  := app.acc(d.company_id,'vat_input');
  v_wht_recv:= app.acc(d.company_id,'wht_receivable');
  v_wht_pay := app.acc(d.company_id,'wht_payable');

  insert into public.journal_entries(company_id, entry_number, entry_date, book, description,
    source_type, source_id, status, is_auto, created_by, posted_by, posted_at)
  values (d.company_id, app.next_entry_number(d.company_id, v_book, d.doc_date), d.doc_date, v_book,
    d.kind::text || ' ' || d.doc_number, 'document', d.id, 'posted', true, auth.uid(), auth.uid(), now())
  returning id into v_entry;

  if not v_is_purchase then
    -- ========== ฝั่งขาย ==========
    v_line := v_line + 1;
    insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
    values (v_entry, d.company_id, v_line, v_ar, 'ลูกหนี้การค้า - ' || d.doc_number, d.grand_total, 0, d.contact_id);

    for l in select dl.*, coalesce(dl.account_id, p.income_account_id, app.acc(d.company_id,'sales_revenue')) as post_acc
             from public.document_lines dl
             left join public.products p on p.id = dl.product_id
             where dl.document_id = d.id order by dl.line_no loop
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, dimension_id)
      values (v_entry, d.company_id, v_line, l.post_acc, l.description, 0, l.line_amount, l.dimension_id);
    end loop;

    if d.vat_amount <> 0 then
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
      values (v_entry, d.company_id, v_line, v_vat_out, 'ภาษีขาย 7%', 0, d.vat_amount);
    end if;
    if d.wht_amount <> 0 then
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
      values (v_entry, d.company_id, v_line, v_wht_recv, 'ภาษีถูกหัก ณ ที่จ่าย', d.wht_amount, 0, d.contact_id);
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
      values (v_entry, d.company_id, v_line, v_ar, 'ลดลูกหนี้จากภาษีถูกหัก ณ ที่จ่าย', 0, d.wht_amount, d.contact_id);
    end if;
  else
    -- ========== ฝั่งซื้อ ==========
    for l in select dl.*, coalesce(dl.account_id, p.expense_account_id,
                    case when p.track_inventory then app.acc(d.company_id,'inventory') else null end,
                    app.acc(d.company_id,'default_expense')) as post_acc
             from public.document_lines dl
             left join public.products p on p.id = dl.product_id
             where dl.document_id = d.id order by dl.line_no loop
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, dimension_id)
      values (v_entry, d.company_id, v_line, l.post_acc, l.description, l.line_amount, 0, l.dimension_id);
    end loop;

    if d.vat_amount <> 0 then
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit)
      values (v_entry, d.company_id, v_line, v_vat_in, 'ภาษีซื้อ 7%', d.vat_amount, 0);
    end if;

    v_line := v_line + 1;
    insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
    values (v_entry, d.company_id, v_line, v_ap, 'เจ้าหนี้การค้า - ' || d.doc_number, 0, d.grand_total, d.contact_id);

    if d.wht_amount <> 0 then
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
      values (v_entry, d.company_id, v_line, v_ap, 'ลดเจ้าหนี้จากภาษีหัก ณ ที่จ่าย', d.wht_amount, 0, d.contact_id);
      v_line := v_line + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id)
      values (v_entry, d.company_id, v_line, v_wht_pay, 'ภาษีหัก ณ ที่จ่ายค้างจ่าย', 0, d.wht_amount, d.contact_id);
    end if;
  end if;

  update public.documents
     set journal_entry_id = v_entry, status = 'approved', approved_by = auth.uid(), approved_at = now()
   where id = p_document;

  return v_entry;
end $$;

grant execute on function public.post_document(uuid) to authenticated;

-- ยกเลิกเอกสาร -> กลับรายการ (ไม่ลบ เพื่อรักษาเส้นทางตรวจสอบ)
create or replace function public.void_document(p_document uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, app as $$
declare d record; v_rev uuid; l record; i int := 0;
begin
  select * into d from public.documents where id = p_document;
  if not app.has_perm(d.company_id,'documents','void') and not app.has_perm(d.company_id,'documents','delete') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์ยกเลิกเอกสาร';
  end if;
  perform app.assert_period_open(d.company_id, d.doc_date, 'all');

  if d.journal_entry_id is not null then
    insert into public.journal_entries(company_id, entry_number, entry_date, book, description,
      source_type, source_id, status, is_auto, created_by, posted_by, posted_at)
    values (d.company_id, app.next_entry_number(d.company_id,'ADJ',current_date), current_date, 'ADJ',
      'กลับรายการเอกสาร ' || d.doc_number || ' : ' || coalesce(p_reason,''), 'void', d.id, 'posted', true,
      auth.uid(), auth.uid(), now())
    returning id into v_rev;

    for l in select * from public.journal_lines where entry_id = d.journal_entry_id order by line_no loop
      i := i + 1;
      insert into public.journal_lines(entry_id, company_id, line_no, account_id, description, debit, credit, contact_id, dimension_id)
      values (v_rev, d.company_id, i, l.account_id, 'กลับรายการ: ' || coalesce(l.description,''), l.credit, l.debit, l.contact_id, l.dimension_id);
    end loop;

    update public.journal_entries set status = 'reversed', reversed_by = v_rev where id = d.journal_entry_id;
  end if;

  update public.documents
     set status = 'void', voided_by = auth.uid(), voided_at = now(), void_reason = p_reason
   where id = p_document;
end $$;

grant execute on function public.void_document(uuid, text) to authenticated;
