-- =====================================================================
-- 0021 : ผู้ช่วยตรวจก่อนปิดงบประจำงวด
--
--  รวมสิ่งที่นักบัญชีต้องไล่ตรวจเองทุกเดือนมาไว้ในที่เดียว
--  ทุกข้อคำนวณจากข้อมูลจริง ไม่มีการเดา และบอกได้ว่าเอกสารใบไหนมีปัญหา
-- =====================================================================

create or replace function public.rpt_close_check(
  p_company uuid,
  p_from    date,
  p_to      date
)
returns json
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_out    jsonb := '[]'::jsonb;
  v_vat    numeric(5,2);

begin
  if not app.has_perm(p_company, 'report', 'view') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์ดูรายงาน';
  end if;

  select coalesce(vat_rate, 7) into v_vat from public.companies where id = p_company;

  ---------------------------------------------------------------- 1) เอกสารร่าง
  v_out := v_out || (
    select case when count(*) = 0 then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
      'key', 'draft_docs', 'severity', 'error', 'category', 'เอกสาร',
      'title', 'มีเอกสารค้างสถานะร่าง ' || count(*) || ' ใบ',
      'detail', 'เอกสารร่างยังไม่ถูกลงบัญชี ถ้าปิดงบตอนนี้ตัวเลขจะขาดไป ต้องอนุมัติหรือยกเลิกให้เรียบร้อยก่อน',
      'count', count(*), 'amount', coalesce(sum(grand_total), 0),
      'samples', (select jsonb_agg(jsonb_build_object('id', x.id, 'label', x.doc_number, 'kind', x.kind))
                  from (select id, doc_number, kind from public.documents
                        where company_id = p_company and doc_date between p_from and p_to
                          and status = 'draft' order by doc_date limit 8) x)
    )) end
    from public.documents
    where company_id = p_company and doc_date between p_from and p_to and status = 'draft'
  );

  ------------------------------------------------------------- 2) รออนุมัติ
  v_out := v_out || (
    select case when count(*) = 0 then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
      'key', 'awaiting_docs', 'severity', 'warning', 'category', 'เอกสาร',
      'title', 'มีเอกสารรออนุมัติ ' || count(*) || ' ใบ',
      'detail', 'ยังไม่ถูกลงบัญชีจนกว่าจะอนุมัติ',
      'count', count(*), 'amount', coalesce(sum(grand_total), 0),
      'samples', (select jsonb_agg(jsonb_build_object('id', x.id, 'label', x.doc_number, 'kind', x.kind))
                  from (select id, doc_number, kind from public.documents
                        where company_id = p_company and doc_date between p_from and p_to
                          and status = 'awaiting_approval' order by doc_date limit 8) x)
    )) end
    from public.documents
    where company_id = p_company and doc_date between p_from and p_to and status = 'awaiting_approval'
  );

  ------------------------------------------- 3) เลขที่ใบกำกับภาษีขาดช่วง
  -- สรรพากรกำหนดให้ใบกำกับภาษีเรียงต่อเนื่อง เลขที่หายไปต้องอธิบายได้
  v_out := v_out || (
    with nums as (
      select doc_number,
             -- ดึงเฉพาะตัวเลขท้ายสุดของเลขที่เอกสารมาเทียบลำดับ
             nullif(regexp_replace(doc_number, '^.*?(\d+)$', '\1'), '')::bigint as seq
      from public.documents
      where company_id = p_company and kind = 'tax_invoice'
        and doc_date between p_from and p_to and status <> 'void'
        and doc_number ~ '\d+$'
    ),
    ordered as (
      select seq, lag(seq) over (order by seq) as prev from nums
    ),
    gaps as (
      select prev + 1 as from_no, seq - 1 as to_no
      from ordered where seq - prev > 1
    )
    select case when count(*) = 0 then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
      'key', 'tax_invoice_gap', 'severity', 'warning', 'category', 'ภาษี',
      'title', 'เลขที่ใบกำกับภาษีขาดช่วง ' || count(*) || ' ช่วง',
      'detail', 'เลขที่ที่หายไป : ' || string_agg(
                  case when from_no = to_no then from_no::text else from_no || '–' || to_no end, ', ')
                || ' — สรรพากรกำหนดให้เรียงต่อเนื่อง ถ้ายกเลิกใบไหนต้องเก็บต้นฉบับไว้อธิบาย',
      'count', count(*), 'amount', 0, 'samples', '[]'::jsonb
    )) end
    from gaps
  );

  ------------------------------------ 4) ยอดหัวเอกสารไม่ตรงผลรวมรายการย่อย
  v_out := v_out || (
    with sums as (
      select d.id, d.doc_number, d.kind, d.vat_base, d.vat_amount,
             count(l.id)                     as line_count,
             coalesce(sum(l.line_amount), 0) as line_base,
             coalesce(sum(l.vat_amount), 0)  as line_vat
      from public.documents d
      left join public.document_lines l on l.document_id = d.id
      where d.company_id = p_company and d.doc_date between p_from and p_to and d.status <> 'void'
      group by d.id, d.doc_number, d.kind, d.vat_base, d.vat_amount
    ),
    bad as (
      -- เอกสารที่ไม่มีรายการเลยแยกไปอีกข้อ ตรงนี้ดูเฉพาะที่มีรายการแต่ยอดไม่ตรง
      select * from sums
      where line_count > 0
        and (abs(vat_base - line_base) > 0.05 or abs(vat_amount - line_vat) > 0.05)
    )
    select case when count(*) = 0 then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
      'key', 'doc_total_mismatch', 'severity', 'error', 'category', 'เอกสาร',
      'title', 'ยอดรวมหัวเอกสารไม่ตรงกับรายการย่อย ' || count(*) || ' ใบ',
      'detail', 'อาจเกิดจากแก้ไขรายการแล้วยอดไม่ถูกคำนวณใหม่ ต้องเปิดเอกสารแล้วบันทึกซ้ำ',
      'count', count(*), 'amount', 0,
      'samples', (select jsonb_agg(jsonb_build_object('id', b.id, 'label', b.doc_number, 'kind', b.kind))
                  from (select * from bad limit 8) b)
    )) end
    from bad
  );

  ------------------------------------------ 4ข) เอกสารที่ไม่มีรายการเลย
  v_out := v_out || (
    with bad as (
      select d.id, d.doc_number, d.kind
      from public.documents d
      where d.company_id = p_company and d.doc_date between p_from and p_to
        and d.status <> 'void' and d.grand_total <> 0
        and not exists (select 1 from public.document_lines l where l.document_id = d.id)
    )
    select case when count(*) = 0 then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
      'key', 'doc_no_lines', 'severity', 'error', 'category', 'เอกสาร',
      'title', 'เอกสารที่มียอดเงินแต่ไม่มีรายการ ' || count(*) || ' ใบ',
      'detail', 'เอกสารที่ไม่มีบรรทัดรายการจะลงบัญชีไม่ได้และตรวจสอบย้อนหลังไม่ได้ว่าเป็นค่าอะไร',
      'count', count(*), 'amount', 0,
      'samples', (select jsonb_agg(jsonb_build_object('id', b.id, 'label', b.doc_number, 'kind', b.kind))
                  from (select * from bad limit 8) b)
    )) end
    from bad
  );

  ------------------------------------------- 5) ภาษีมูลค่าเพิ่มคำนวณไม่ตรง
  v_out := v_out || (
    with bad as (
      select d.id, d.doc_number, d.kind, d.vat_base, d.vat_amount
      from public.documents d
      where d.company_id = p_company and d.doc_date between p_from and p_to
        and d.status <> 'void' and d.vat_amount <> 0
        and abs(d.vat_amount - round(d.vat_base * v_vat / 100, 2)) > 1.00
    )
    select case when count(*) = 0 then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
      'key', 'vat_mismatch', 'severity', 'error', 'category', 'ภาษี',
      'title', 'ภาษีมูลค่าเพิ่มไม่ตรงอัตรา ' || v_vat || '% จำนวน ' || count(*) || ' ใบ',
      'detail', 'ผลต่างเกิน 1 บาท ควรตรวจว่าเป็นรายการยกเว้น/อัตรา 0% หรือคำนวณผิดจริง',
      'count', count(*), 'amount', 0,
      'samples', (select jsonb_agg(jsonb_build_object('id', b.id, 'label', b.doc_number, 'kind', b.kind))
                  from (select * from bad limit 8) b)
    )) end
    from bad
  );

  ------------------------- 6) ใบกำกับภาษีที่ผู้ซื้อไม่มีเลขประจำตัวผู้เสียภาษี
  v_out := v_out || (
    with bad as (
      select d.id, d.doc_number, d.kind
      from public.documents d
      left join public.contacts c on c.id = d.contact_id
      where d.company_id = p_company and d.kind in ('tax_invoice','receipt','credit_note','debit_note')
        and d.doc_date between p_from and p_to and d.status <> 'void'
        and coalesce(nullif(c.tax_id, ''), nullif(d.contact_snapshot->>'tax_id', '')) is null
    )
    select case when count(*) = 0 then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
      'key', 'missing_buyer_taxid', 'severity', 'warning', 'category', 'ภาษี',
      'title', 'เอกสารภาษีที่ไม่มีเลขผู้เสียภาษีของคู่ค้า ' || count(*) || ' ใบ',
      'detail', 'ใบกำกับภาษีเต็มรูปต้องระบุเลขประจำตัวผู้เสียภาษีของผู้ซื้อ มิฉะนั้นผู้ซื้อขอคืนภาษีไม่ได้',
      'count', count(*), 'amount', 0,
      'samples', (select jsonb_agg(jsonb_build_object('id', b.id, 'label', b.doc_number, 'kind', b.kind))
                  from (select * from bad limit 8) b)
    )) end
    from bad
  );

  ----------------------------------------- 7) สมุดรายวันที่เดบิตไม่เท่าเครดิต
  v_out := v_out || (
    with bad as (
      select je.id, je.entry_number
      from public.journal_entries je
      where je.company_id = p_company and je.entry_date between p_from and p_to
        and je.status = 'posted'
        and abs(je.total_debit - je.total_credit) > 0.005
    )
    select case when count(*) = 0 then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
      'key', 'unbalanced_entry', 'severity', 'error', 'category', 'บัญชี',
      'title', 'สมุดรายวันไม่ดุล ' || count(*) || ' ใบ',
      'detail', 'เดบิตไม่เท่าเครดิต งบทดลองจะไม่ลงตัว ต้องแก้ก่อนปิดงบ',
      'count', count(*), 'amount', 0,
      'samples', (select jsonb_agg(jsonb_build_object('id', b.id, 'label', b.entry_number, 'kind', 'journal'))
                  from (select * from bad limit 8) b)
    )) end
    from bad
  );

  ------------------------------------------- 8) บัญชีเงินสด/ธนาคารติดลบ
  v_out := v_out || (
    with bal as (
      select a.id, a.code, a.name_th, sum(jl.debit - jl.credit) as amt
      from public.journal_lines jl
      join public.journal_entries je on je.id = jl.entry_id and je.status = 'posted'
      join public.accounts a on a.id = jl.account_id
      where jl.company_id = p_company and je.entry_date <= p_to
        and a.type = 'asset' and (a.code like '11%' or a.system_key in ('cash','bank'))
      group by a.id, a.code, a.name_th
      having sum(jl.debit - jl.credit) < -0.005
    )
    select case when count(*) = 0 then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
      'key', 'negative_cash', 'severity', 'error', 'category', 'บัญชี',
      'title', 'บัญชีเงินสด/ธนาคารติดลบ ' || count(*) || ' บัญชี',
      'detail', 'ยอด : ' || string_agg(code || ' ' || name_th || ' = ' || to_char(amt, 'FM999,999,999.00'), ' · ')
                || ' — เงินสดติดลบเป็นไปไม่ได้จริง มักเกิดจากลงจ่ายก่อนรับ',
      'count', count(*), 'amount', 0, 'samples', '[]'::jsonb
    )) end
    from bal
  );

  -------------------------------------------------- 9) สินค้าคงเหลือติดลบ
  v_out := v_out || (
    with neg as (
      select p.id, p.sku, p.name, sum(m.qty_in - m.qty_out) as qty
      from public.inventory_moves m
      join public.products p on p.id = m.product_id
      where m.company_id = p_company and m.move_date <= p_to
      group by p.id, p.sku, p.name
      having sum(m.qty_in - m.qty_out) < -0.0001
    )
    select case when count(*) = 0 then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
      'key', 'negative_stock', 'severity', 'warning', 'category', 'สินค้า',
      'title', 'สินค้าคงเหลือติดลบ ' || count(*) || ' รายการ',
      'detail', 'มักเกิดจากขายก่อนบันทึกรับเข้า ทำให้ต้นทุนขายเพี้ยน ควรบันทึกใบรับสินค้าย้อนหลังให้ครบ',
      'count', count(*), 'amount', 0,
      'samples', (select jsonb_agg(jsonb_build_object('id', n.id, 'label', n.sku || ' ' || n.name, 'kind', 'product'))
                  from (select * from neg limit 8) n)
    )) end
    from neg
  );

  ------------------------------------ 10) สินทรัพย์ที่ยังไม่คิดค่าเสื่อมในงวด
  v_out := v_out || (
    with pending as (
      select fa.id, fa.code, fa.name
      from public.fixed_assets fa
      where fa.company_id = p_company and fa.status = 'active'
        and fa.method <> 'none' and fa.in_service_date <= p_to
        and not exists (
          select 1 from public.asset_depreciations ad
          where ad.asset_id = fa.id and ad.period_end between p_from and p_to
        )
    )
    select case when count(*) = 0 then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
      'key', 'depreciation_pending', 'severity', 'error', 'category', 'สินทรัพย์',
      'title', 'ยังไม่คิดค่าเสื่อมราคางวดนี้ ' || count(*) || ' รายการ',
      'detail', 'ค่าใช้จ่ายจะต่ำกว่าความเป็นจริงและกำไรจะสูงเกินไป — สั่งคิดค่าเสื่อมได้ที่เมนูสินทรัพย์ถาวร',
      'count', count(*), 'amount', 0,
      'samples', (select jsonb_agg(jsonb_build_object('id', x.id, 'label', x.code || ' ' || x.name, 'kind', 'asset'))
                  from (select * from pending limit 8) x)
    )) end
    from pending
  );

  ---------------------------------------- 11) ธนาคารที่ยังไม่กระทบยอดในงวด
  v_out := v_out || (
    with ch as (
      select fc.id, fc.name
      from public.financial_channels fc
      where fc.company_id = p_company and fc.is_active
        and fc.kind = 'bank'
        and not exists (
          select 1 from public.bank_reconciliations br
          where br.channel_id = fc.id and br.as_of between p_from and p_to
        )
    )
    select case when count(*) = 0 then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
      'key', 'no_reconciliation', 'severity', 'warning', 'category', 'การเงิน',
      'title', 'บัญชีธนาคารที่ยังไม่กระทบยอดงวดนี้ ' || count(*) || ' บัญชี',
      'detail', 'การกระทบยอดเป็นด่านสุดท้ายที่จับรายการตกหล่นหรือซ้ำได้',
      'count', count(*), 'amount', 0,
      'samples', (select jsonb_agg(jsonb_build_object('id', c.id, 'label', c.name, 'kind', 'channel'))
                  from (select * from ch limit 8) c)
    )) end
    from ch
  );

  -------------------------------------- 12) ลูกหนี้ค้างเกิน 90 วัน
  v_out := v_out || (
    with od as (
      select d.id, d.doc_number, d.kind,
             coalesce(d.net_payable, d.grand_total) - coalesce(d.paid_amount, 0) as owed
      from public.documents d
      where d.company_id = p_company
        and d.kind in ('invoice','tax_invoice','billing_note','debit_note')
        and d.status in ('approved','partial','overdue')
        and d.due_date < p_to - 90
        and coalesce(d.net_payable, d.grand_total) - coalesce(d.paid_amount, 0) > 0.005
    )
    select case when count(*) = 0 then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
      'key', 'ar_over_90', 'severity', 'warning', 'category', 'ลูกหนี้',
      'title', 'ลูกหนี้ค้างเกิน 90 วัน ' || count(*) || ' ใบ',
      'detail', 'รวม ' || to_char(sum(owed), 'FM999,999,999.00') || ' บาท — พิจารณาตั้งค่าเผื่อหนี้สงสัยจะสูญหรือเร่งติดตาม',
      'count', count(*), 'amount', sum(owed),
      'samples', (select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.doc_number, 'kind', o.kind))
                  from (select * from od order by owed desc limit 8) o)
    )) end
    from od
  );

  ---------------------------- 13) ค่าใช้จ่ายก้อนใหญ่ที่ไม่มีเอกสารแนบ
  v_out := v_out || (
    with bad as (
      select d.id, d.doc_number, d.kind, d.grand_total
      from public.documents d
      where d.company_id = p_company and d.kind in ('bill','expense')
        and d.doc_date between p_from and p_to and d.status <> 'void'
        and d.grand_total >= 5000
        and not exists (select 1 from public.attachments a where a.document_id = d.id)
    )
    select case when count(*) = 0 then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
      'key', 'missing_attachment', 'severity', 'info', 'category', 'เอกสาร',
      'title', 'ค่าใช้จ่ายตั้งแต่ 5,000 บาทที่ไม่มีไฟล์แนบ ' || count(*) || ' ใบ',
      'detail', 'แนบใบเสร็จ/ใบกำกับภาษีตัวจริงไว้จะทำให้ตรวจสอบย้อนหลังและรับมือการตรวจสอบภาษีได้ง่ายขึ้น',
      'count', count(*), 'amount', coalesce(sum(grand_total), 0),
      'samples', (select jsonb_agg(jsonb_build_object('id', b.id, 'label', b.doc_number, 'kind', b.kind))
                  from (select * from bad order by grand_total desc limit 8) b)
    )) end
    from bad
  );

  ------------------------------------- 14) คู่ค้าที่เลขผู้เสียภาษีซ้ำกัน
  v_out := v_out || (
    with dup as (
      select tax_id, count(*) as n, string_agg(name, ' / ') as names
      from public.contacts
      where company_id = p_company and tax_id is not null and tax_id <> '' and is_active
      group by tax_id having count(*) > 1
    )
    select case when count(*) = 0 then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
      'key', 'duplicate_taxid', 'severity', 'info', 'category', 'ข้อมูลหลัก',
      'title', 'คู่ค้าที่เลขผู้เสียภาษีซ้ำกัน ' || count(*) || ' เลข',
      'detail', string_agg(tax_id || ' → ' || names, ' · ') || ' — อาจเป็นรายเดียวกันที่ถูกสร้างซ้ำ ทำให้ยอดลูกหนี้/เจ้าหนี้กระจาย',
      'count', count(*), 'amount', 0, 'samples', '[]'::jsonb
    )) end
    from dup
  );

  return json_build_object(
    'generated_at', now(),
    'period', json_build_object('from', p_from, 'to', p_to),
    'findings', v_out,
    'errors',   (select count(*) from jsonb_array_elements(v_out) e where e->>'severity' = 'error'),
    'warnings', (select count(*) from jsonb_array_elements(v_out) e where e->>'severity' = 'warning'),
    'infos',    (select count(*) from jsonb_array_elements(v_out) e where e->>'severity' = 'info')
  );
end $$;

grant execute on function public.rpt_close_check(uuid, date, date) to authenticated;
