-- ============================================================================
-- ONEBOOK 0008 : ผังบัญชีมาตรฐานไทย + ฟังก์ชันเปิดบริษัทใหม่ + บทบาทมาตรฐาน
-- อ้างอิงโครงผังบัญชีตามแบบกรมพัฒนาธุรกิจการค้า (DBD) สำหรับธุรกิจทั่วไป
-- ============================================================================

create or replace function app.seed_chart_of_accounts(p_company uuid)
returns void language plpgsql security definer set search_path = public, app as $$
begin
  insert into public.accounts (company_id, code, name_th, name_en, name_zh, type, parent_code, is_header, is_system, system_key, normal_side)
  values
  -- ================= 1 สินทรัพย์ =================
  (p_company,'1000','สินทรัพย์','Assets','资产','asset',null,true,true,null,'D'),
  (p_company,'1100','สินทรัพย์หมุนเวียน','Current assets','流动资产','asset','1000',true,true,null,'D'),
  (p_company,'1110','เงินสด','Cash on hand','库存现金','asset','1100',false,true,'cash','D'),
  (p_company,'1120','เงินฝากธนาคาร','Bank deposits','银行存款','asset','1100',false,true,'bank','D'),
  (p_company,'1130','ลูกหนี้การค้า','Trade receivables','应收账款','asset','1100',false,true,'ar','D'),
  (p_company,'1131','ค่าเผื่อหนี้สงสัยจะสูญ','Allowance for doubtful accounts','坏账准备','asset','1100',false,true,null,'C'),
  (p_company,'1140','ลูกหนี้อื่น','Other receivables','其他应收款','asset','1100',false,false,null,'D'),
  (p_company,'1150','สินค้าคงเหลือ','Inventory','存货','asset','1100',false,true,'inventory','D'),
  (p_company,'1160','ภาษีซื้อ','Input VAT','进项税','asset','1100',false,true,'vat_input','D'),
  (p_company,'1161','ภาษีซื้อยังไม่ถึงกำหนด','Deferred input VAT','待抵扣进项税','asset','1100',false,true,'vat_input_deferred','D'),
  (p_company,'1170','ภาษีถูกหัก ณ ที่จ่าย','Withholding tax receivable','预缴所得税','asset','1100',false,true,'wht_receivable','D'),
  (p_company,'1180','ค่าใช้จ่ายจ่ายล่วงหน้า','Prepaid expenses','预付费用','asset','1100',false,false,null,'D'),
  (p_company,'1190','เงินมัดจำจ่าย','Deposits paid','预付定金','asset','1100',false,true,'deposit_paid','D'),
  (p_company,'1200','สินทรัพย์ไม่หมุนเวียน','Non-current assets','非流动资产','asset','1000',true,true,null,'D'),
  (p_company,'1210','ที่ดิน','Land','土地','asset','1200',false,false,null,'D'),
  (p_company,'1220','อาคารและสิ่งปลูกสร้าง','Buildings','房屋建筑物','asset','1200',false,false,null,'D'),
  (p_company,'1221','ค่าเสื่อมราคาสะสม - อาคาร','Acc. depreciation - buildings','累计折旧-房屋','asset','1200',false,false,null,'C'),
  (p_company,'1230','เครื่องจักรและอุปกรณ์','Machinery and equipment','机器设备','asset','1200',false,false,null,'D'),
  (p_company,'1231','ค่าเสื่อมราคาสะสม - เครื่องจักร','Acc. depreciation - machinery','累计折旧-机器','asset','1200',false,false,null,'C'),
  (p_company,'1240','เครื่องใช้สำนักงาน','Office equipment','办公设备','asset','1200',false,false,null,'D'),
  (p_company,'1241','ค่าเสื่อมราคาสะสม - เครื่องใช้สำนักงาน','Acc. depreciation - office equip.','累计折旧-办公设备','asset','1200',false,false,null,'C'),
  (p_company,'1250','ยานพาหนะ','Vehicles','运输设备','asset','1200',false,false,null,'D'),
  (p_company,'1251','ค่าเสื่อมราคาสะสม - ยานพาหนะ','Acc. depreciation - vehicles','累计折旧-运输设备','asset','1200',false,false,null,'C'),
  (p_company,'1260','สินทรัพย์ไม่มีตัวตน','Intangible assets','无形资产','asset','1200',false,false,null,'D'),
  (p_company,'1270','สินทรัพย์ภาษีเงินได้รอตัดบัญชี','Deferred tax assets','递延所得税资产','asset','1200',false,false,null,'D'),

  -- ================= 2 หนี้สิน =================
  (p_company,'2000','หนี้สิน','Liabilities','负债','liability',null,true,true,null,'C'),
  (p_company,'2100','หนี้สินหมุนเวียน','Current liabilities','流动负债','liability','2000',true,true,null,'C'),
  (p_company,'2110','เจ้าหนี้การค้า','Trade payables','应付账款','liability','2100',false,true,'ap','C'),
  (p_company,'2120','เจ้าหนี้อื่น','Other payables','其他应付款','liability','2100',false,false,null,'C'),
  (p_company,'2130','ค่าใช้จ่ายค้างจ่าย','Accrued expenses','预提费用','liability','2100',false,false,null,'C'),
  (p_company,'2140','ภาษีขาย','Output VAT','销项税','liability','2100',false,true,'vat_output','C'),
  (p_company,'2141','ภาษีขายยังไม่ถึงกำหนด','Deferred output VAT','待转销项税','liability','2100',false,true,'vat_output_deferred','C'),
  (p_company,'2150','ภาษีหัก ณ ที่จ่ายค้างจ่าย','Withholding tax payable','应付代扣税款','liability','2100',false,true,'wht_payable','C'),
  (p_company,'2160','ภาษีมูลค่าเพิ่มค้างจ่าย','VAT payable','应交增值税','liability','2100',false,true,'vat_payable','C'),
  (p_company,'2170','เงินมัดจำรับ','Deposits received','预收定金','liability','2100',false,true,'deposit_received','C'),
  (p_company,'2180','เงินเดือนค้างจ่าย','Accrued salaries','应付职工薪酬','liability','2100',false,false,null,'C'),
  (p_company,'2190','ประกันสังคมค้างจ่าย','Social security payable','应付社保','liability','2100',false,false,null,'C'),
  (p_company,'2195','ภาษีเงินได้นิติบุคคลค้างจ่าย','Corporate income tax payable','应交企业所得税','liability','2100',false,false,null,'C'),
  (p_company,'2200','หนี้สินไม่หมุนเวียน','Non-current liabilities','非流动负债','liability','2000',true,true,null,'C'),
  (p_company,'2210','เงินกู้ยืมระยะยาว','Long-term loans','长期借款','liability','2200',false,false,null,'C'),
  (p_company,'2220','หนี้สินตามสัญญาเช่า','Lease liabilities','租赁负债','liability','2200',false,false,null,'C'),

  -- ================= 3 ส่วนของผู้ถือหุ้น =================
  (p_company,'3000','ส่วนของผู้ถือหุ้น','Shareholders equity','所有者权益','equity',null,true,true,null,'C'),
  (p_company,'3110','ทุนจดทะเบียน','Authorised share capital','注册资本','equity','3000',false,true,null,'C'),
  (p_company,'3120','ทุนที่ออกและชำระแล้ว','Issued and paid-up capital','实收资本','equity','3000',false,true,null,'C'),
  (p_company,'3130','ส่วนเกินมูลค่าหุ้น','Share premium','资本公积','equity','3000',false,false,null,'C'),
  (p_company,'3210','สำรองตามกฎหมาย','Legal reserve','法定盈余公积','equity','3000',false,false,null,'C'),
  (p_company,'3220','กำไร(ขาดทุน)สะสม','Retained earnings','未分配利润','equity','3000',false,true,'retained_earnings','C'),
  (p_company,'3230','กำไร(ขาดทุน)สุทธิประจำงวด','Net profit for the period','本期损益','equity','3000',false,true,'current_earnings','C'),

  -- ================= 4 รายได้ =================
  (p_company,'4000','รายได้','Revenue','收入','revenue',null,true,true,null,'C'),
  (p_company,'4110','รายได้จากการขายสินค้า','Sales revenue','商品销售收入','revenue','4000',false,true,'sales_revenue','C'),
  (p_company,'4120','รายได้จากการให้บริการ','Service revenue','服务收入','revenue','4000',false,true,'service_revenue','C'),
  (p_company,'4130','รับคืนสินค้าและส่วนลดจ่าย','Sales returns and discounts','销售退回及折让','revenue','4000',false,true,'sales_return','D'),
  (p_company,'4210','รายได้อื่น','Other income','其他收入','other_income','4000',false,false,null,'C'),
  (p_company,'4220','ดอกเบี้ยรับ','Interest income','利息收入','other_income','4000',false,false,null,'C'),
  (p_company,'4230','กำไรจากอัตราแลกเปลี่ยน','FX gain','汇兑收益','other_income','4000',false,false,null,'C'),

  -- ================= 5 ต้นทุนขาย =================
  (p_company,'5000','ต้นทุนขายและบริการ','Cost of sales','营业成本','cost_of_sales',null,true,true,null,'D'),
  (p_company,'5110','ต้นทุนขายสินค้า','Cost of goods sold','商品销售成本','cost_of_sales','5000',false,true,'cogs','D'),
  (p_company,'5120','ต้นทุนการให้บริการ','Cost of services','服务成本','cost_of_sales','5000',false,true,'service_cost','D'),
  (p_company,'5130','ซื้อสินค้า','Purchases','购货','cost_of_sales','5000',false,true,'purchases','D'),
  (p_company,'5140','ส่งคืนสินค้าและส่วนลดรับ','Purchase returns and discounts','购货退回及折让','cost_of_sales','5000',false,true,'purchase_return','C'),
  (p_company,'5150','ค่าขนส่งเข้า','Freight-in','采购运费','cost_of_sales','5000',false,false,null,'D'),

  -- ================= 6 ค่าใช้จ่าย =================
  (p_company,'6000','ค่าใช้จ่ายในการขายและบริหาร','Selling and administrative expenses','销售及管理费用','expense',null,true,true,null,'D'),
  (p_company,'6110','เงินเดือนและค่าแรง','Salaries and wages','工资薪金','expense','6000',false,true,'salary_expense','D'),
  (p_company,'6111','ค่าล่วงเวลา','Overtime','加班费','expense','6000',false,false,null,'D'),
  (p_company,'6112','โบนัสและสวัสดิการ','Bonus and welfare','奖金及福利','expense','6000',false,false,null,'D'),
  (p_company,'6113','เงินสมทบประกันสังคม - นายจ้าง','Social security - employer','社保-企业部分','expense','6000',false,false,null,'D'),
  (p_company,'6120','ค่าเช่า','Rent expense','租金','expense','6000',false,false,null,'D'),
  (p_company,'6121','ค่าสาธารณูปโภค','Utilities','水电费','expense','6000',false,false,null,'D'),
  (p_company,'6122','ค่าโทรศัพท์และอินเทอร์เน็ต','Telephone and internet','通讯网络费','expense','6000',false,false,null,'D'),
  (p_company,'6130','ค่าน้ำมันเชื้อเพลิง','Fuel','燃油费','expense','6000',false,false,null,'D'),
  (p_company,'6131','ค่าเดินทางและที่พัก','Travelling expenses','差旅费','expense','6000',false,false,null,'D'),
  (p_company,'6132','ค่ารับรอง','Entertainment','业务招待费','expense','6000',false,false,null,'D'),
  (p_company,'6140','ค่าโฆษณาและส่งเสริมการขาย','Advertising and promotion','广告promotion费','expense','6000',false,false,null,'D'),
  (p_company,'6141','ค่าขนส่งออก','Freight-out','销售运费','expense','6000',false,false,null,'D'),
  (p_company,'6150','ค่าธรรมเนียมวิชาชีพ','Professional fees','专业服务费','expense','6000',false,false,null,'D'),
  (p_company,'6151','ค่าธรรมเนียมธนาคาร','Bank charges','银行手续费','expense','6000',false,true,'bank_fee','D'),
  (p_company,'6160','ค่าซ่อมแซมและบำรุงรักษา','Repairs and maintenance','修理维护费','expense','6000',false,false,null,'D'),
  (p_company,'6161','วัสดุสิ้นเปลืองสำนักงาน','Office supplies','办公用品','expense','6000',false,true,'default_expense','D'),
  (p_company,'6170','ค่าเสื่อมราคาและค่าตัดจำหน่าย','Depreciation and amortisation','折旧与摊销','expense','6000',false,true,'depreciation','D'),
  (p_company,'6180','หนี้สงสัยจะสูญ','Doubtful accounts','坏账损失','expense','6000',false,false,null,'D'),
  (p_company,'6190','ค่าใช้จ่ายเบ็ดเตล็ด','Miscellaneous expenses','杂项支出','expense','6000',false,false,null,'D'),
  (p_company,'6210','ขาดทุนจากอัตราแลกเปลี่ยน','FX loss','汇兑损失','other_expense','6000',false,false,null,'D'),
  (p_company,'7110','ต้นทุนทางการเงิน (ดอกเบี้ยจ่าย)','Finance cost','财务费用','other_expense',null,false,false,null,'D'),
  (p_company,'8110','ภาษีเงินได้นิติบุคคล','Corporate income tax','企业所得税','tax',null,false,true,'income_tax','D')
  on conflict (company_id, code) do nothing;
end $$;

-- ------------------------------------------- บทบาทมาตรฐาน + สิทธิ์ต่อบริษัท
create or replace function app.seed_default_roles(p_company uuid)
returns void language plpgsql security definer set search_path = public, app as $$
declare r uuid;
begin
  -- 1) เจ้าของกิจการ / ผู้ดูแลบริษัท
  insert into public.roles(company_id, code, name_th, name_en, name_zh, description, is_system)
  values (p_company,'owner','เจ้าของกิจการ','Owner','企业主','สิทธิ์เต็มทุกเมนูภายในบริษัทนี้',true)
  on conflict (company_id, code) do nothing returning id into r;
  if r is not null then
    insert into public.role_permissions(role_id, resource, actions) values
      (r,'*', array['view','create','edit','delete','approve','post','void','export','unlock','override']);
  end if;

  -- 2) สมุห์บัญชี
  r := null;
  insert into public.roles(company_id, code, name_th, name_en, name_zh, description, is_system)
  values (p_company,'accounting_manager','สมุห์บัญชี','Accounting manager','会计主管','ปิดงบ ปิดงวด อนุมัติรายการบัญชี',true)
  on conflict (company_id, code) do nothing returning id into r;
  if r is not null then
    insert into public.role_permissions(role_id, resource, actions) values
      (r,'documents', array['view','create','edit','delete','approve','export']),
      (r,'journal',   array['view','create','edit','delete','post','void','export']),
      (r,'accounting',array['view','create','edit','delete','export']),
      (r,'finance',   array['view','create','edit','delete','export']),
      (r,'contacts',  array['view','create','edit','delete','export']),
      (r,'products',  array['view','create','edit','delete','export']),
      (r,'tax',       array['view','create','edit','delete','export']),
      (r,'report',    array['view','export']),
      (r,'period',    array['view','create','edit','unlock']),
      (r,'settings.audit', array['view','export']),
      (r,'settings.numbering', array['view','edit']);
  end if;

  -- 3) พนักงานบัญชี
  r := null;
  insert into public.roles(company_id, code, name_th, name_en, name_zh, description, is_system)
  values (p_company,'accountant','พนักงานบัญชี','Accountant','会计','บันทึกรายการ แต่ไม่มีสิทธิ์ปิดงวดหรือลบเอกสารที่อนุมัติแล้ว',true)
  on conflict (company_id, code) do nothing returning id into r;
  if r is not null then
    insert into public.role_permissions(role_id, resource, actions) values
      (r,'documents', array['view','create','edit','export']),
      (r,'journal',   array['view','create','edit','export']),
      (r,'accounting',array['view','export']),
      (r,'finance',   array['view','create','edit','export']),
      (r,'contacts',  array['view','create','edit']),
      (r,'products',  array['view','create','edit']),
      (r,'tax',       array['view','create','edit','export']),
      (r,'report',    array['view','export']);
  end if;

  -- 4) ฝ่ายขาย : เห็นเฉพาะงานขาย ไม่เห็นต้นทุนและงบการเงิน
  r := null;
  insert into public.roles(company_id, code, name_th, name_en, name_zh, description, is_system)
  values (p_company,'sales','ฝ่ายขาย','Sales','销售','ออกเอกสารขาย ดูลูกค้า ไม่เห็นต้นทุน/งบการเงิน',true)
  on conflict (company_id, code) do nothing returning id into r;
  if r is not null then
    insert into public.role_permissions(role_id, resource, actions, field_mask) values
      (r,'documents', array['view','create','edit'], array['internal_note']),
      (r,'contacts',  array['view','create','edit'], '{}'),
      (r,'products',  array['view'], array['purchase_price','cogs_account_id']),
      (r,'report.sales', array['view','export'], '{}');
  end if;

  -- 5) ฝ่ายจัดซื้อ
  r := null;
  insert into public.roles(company_id, code, name_th, name_en, name_zh, description, is_system)
  values (p_company,'purchasing','ฝ่ายจัดซื้อ','Purchasing','采购','ออกใบขอซื้อ/ใบสั่งซื้อ ดูผู้ขาย',true)
  on conflict (company_id, code) do nothing returning id into r;
  if r is not null then
    insert into public.role_permissions(role_id, resource, actions) values
      (r,'documents', array['view','create','edit']),
      (r,'contacts',  array['view','create','edit']),
      (r,'products',  array['view']),
      (r,'report.purchase', array['view','export']);
  end if;

  -- 6) ผู้บริหาร (อ่านอย่างเดียว เห็นทุกอย่าง)
  r := null;
  insert into public.roles(company_id, code, name_th, name_en, name_zh, description, is_system)
  values (p_company,'executive','ผู้บริหาร','Executive','管理层','อ่านอย่างเดียวทุกเมนู รวมงบการเงิน',true)
  on conflict (company_id, code) do nothing returning id into r;
  if r is not null then
    insert into public.role_permissions(role_id, resource, actions) values
      (r,'*', array['view','export']);
  end if;

  -- 7) ผู้ตรวจสอบบัญชี (อ่านอย่างเดียว + ดู audit log)
  r := null;
  insert into public.roles(company_id, code, name_th, name_en, name_zh, description, is_system)
  values (p_company,'auditor','ผู้ตรวจสอบ','Auditor','审计','อ่านอย่างเดียว พร้อมสิทธิ์ดูประวัติการแก้ไข',true)
  on conflict (company_id, code) do nothing returning id into r;
  if r is not null then
    insert into public.role_permissions(role_id, resource, actions) values
      (r,'*', array['view']),
      (r,'settings.audit', array['view','export']);
  end if;
end $$;

-- ------------------------------------------------- เลขที่เอกสารเริ่มต้น
create or replace function app.seed_doc_sequences(p_company uuid)
returns void language plpgsql security definer set search_path = public, app as $$
begin
  insert into public.doc_sequences(company_id, doc_kind, prefix) values
    (p_company,'quotation','QU'),          (p_company,'billing_note','BN'),
    (p_company,'invoice','IV'),            (p_company,'tax_invoice','TX'),
    (p_company,'receipt','RE'),            (p_company,'credit_note','CN'),
    (p_company,'debit_note','DN'),         (p_company,'deposit_receipt','DR'),
    (p_company,'purchase_request','PR'),   (p_company,'purchase_order','PO'),
    (p_company,'goods_receipt','GR'),      (p_company,'bill','BL'),
    (p_company,'expense','EX'),            (p_company,'purchase_credit_note','PC'),
    (p_company,'purchase_debit_note','PD'),(p_company,'deposit_payment','DP')
  on conflict (company_id, doc_kind) do nothing;
end $$;

-- ------------------------------------------------------- เปิดบริษัทใหม่ (RPC)
create or replace function public.provision_company(
  p_code text, p_name_th text, p_name_en text default null, p_name_zh text default null,
  p_tax_id text default null, p_parent_code text default null
) returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_id uuid; v_parent uuid;
begin
  if not app.is_group_admin() then
    raise exception 'FORBIDDEN: เฉพาะผู้ดูแลระดับกลุ่มบริษัทเท่านั้นที่เปิดบริษัทใหม่ได้';
  end if;
  if p_parent_code is not null then
    select id into v_parent from public.companies where code = p_parent_code;
  end if;
  insert into public.companies(code, parent_id, name_th, name_en, name_zh, tax_id)
  values (p_code, v_parent, p_name_th, p_name_en, p_name_zh, p_tax_id)
  returning id into v_id;

  perform app.seed_chart_of_accounts(v_id);
  perform app.seed_default_roles(v_id);
  perform app.seed_doc_sequences(v_id);

  -- ช่องทางการเงินเริ่มต้น
  insert into public.financial_channels(company_id, code, name, kind, account_id)
  select v_id, 'CASH', 'เงินสด', 'cash', a.id from public.accounts a
  where a.company_id = v_id and a.code = '1110';

  return v_id;
end $$;

grant execute on function public.provision_company(text,text,text,text,text,text) to authenticated;

-- ------------------------------------------------------- เลขที่เอกสารถัดไป
create or replace function public.next_doc_number(p_company uuid, p_kind doc_kind)
returns text language plpgsql security definer set search_path = public, app as $$
declare s record; v_period text; v_seq int; v_num text;
begin
  if not app.has_perm(p_company, 'documents', 'create') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์สร้างเอกสาร';
  end if;
  select * into s from public.doc_sequences where company_id = p_company and doc_kind = p_kind for update;
  if not found then
    insert into public.doc_sequences(company_id, doc_kind, prefix)
    values (p_company, p_kind, upper(left(p_kind::text,2))) returning * into s;
  end if;
  v_period := case s.reset_cycle
    when 'monthly' then to_char(current_date,'YYYYMM')
    when 'yearly'  then to_char(current_date,'YYYY')
    else 'ALL' end;
  if s.last_period is distinct from v_period then
    v_seq := 1;
  else
    v_seq := s.next_number;
  end if;
  update public.doc_sequences set next_number = v_seq + 1, last_period = v_period where id = s.id;
  v_num := replace(s.pattern, '{PREFIX}', s.prefix);
  v_num := replace(v_num, '{YYYY}', to_char(current_date,'YYYY'));
  v_num := replace(v_num, '{YY}', to_char(current_date,'YY'));
  v_num := replace(v_num, '{MM}', to_char(current_date,'MM'));
  v_num := replace(v_num, '{SEQ:4}', lpad(v_seq::text, 4, '0'));
  v_num := replace(v_num, '{SEQ:5}', lpad(v_seq::text, 5, '0'));
  return v_num;
end $$;

grant execute on function public.next_doc_number(uuid, doc_kind) to authenticated;
