-- ============================================================================
-- ONEBOOK 0007 : ข้อมูลอ้างอิงจริง - ประเภทเงินได้หัก ณ ที่จ่าย (กรมสรรพากร)
-- ============================================================================
insert into public.wht_types (code, pnd_form, name_th, name_en, default_rate, applies_to, sort_order) values
  ('40(1)',    'ภ.ง.ด.1',  'เงินเดือน ค่าจ้าง',                                  'Salary / wages',                 0.00, 'personal', 10),
  ('40(2)P',   'ภ.ง.ด.3',  'ค่าธรรมเนียม ค่านายหน้า (บุคคลธรรมดา)',              'Commission / fee (individual)',  3.00, 'personal', 20),
  ('40(2)J',   'ภ.ง.ด.53', 'ค่าธรรมเนียม ค่านายหน้า (นิติบุคคล)',                'Commission / fee (juristic)',    3.00, 'juristic', 21),
  ('40(3)',    'ภ.ง.ด.53', 'ค่าแห่งลิขสิทธิ์ ค่า Goodwill',                       'Royalty / goodwill',             3.00, 'both',     30),
  ('40(4)A',   'ภ.ง.ด.2',  'ดอกเบี้ย (บุคคลธรรมดา)',                              'Interest (individual)',         15.00, 'personal', 40),
  ('40(4)AJ',  'ภ.ง.ด.53', 'ดอกเบี้ย (นิติบุคคล)',                                'Interest (juristic)',            1.00, 'juristic', 41),
  ('40(4)B',   'ภ.ง.ด.2',  'เงินปันผล / เงินส่วนแบ่งกำไร',                        'Dividend',                      10.00, 'both',     42),
  ('40(5)',    'ภ.ง.ด.53', 'ค่าเช่าทรัพย์สิน',                                     'Rent',                           5.00, 'both',     50),
  ('40(6)',    'ภ.ง.ด.53', 'ค่าวิชาชีพอิสระ (แพทย์ ทนาย วิศวกร บัญชี สถาปนิก)',   'Professional fee',               3.00, 'both',     60),
  ('40(7)',    'ภ.ง.ด.53', 'ค่ารับเหมาที่ผู้รับเหมาจัดหาสัมภาระ',                  'Construction contract',          3.00, 'both',     70),
  ('40(8)SVC', 'ภ.ง.ด.53', 'ค่าจ้างทำของ / ค่าบริการ',                             'Service fee',                    3.00, 'both',     80),
  ('40(8)ADV', 'ภ.ง.ด.53', 'ค่าโฆษณา',                                             'Advertising',                    2.00, 'both',     81),
  ('40(8)TRN', 'ภ.ง.ด.53', 'ค่าขนส่ง (ไม่รวมขนส่งสาธารณะ)',                        'Transportation',                 1.00, 'both',     82),
  ('40(8)INS', 'ภ.ง.ด.53', 'เบี้ยประกันวินาศภัย',                                   'Non-life insurance premium',     1.00, 'both',     83),
  ('40(8)PRZ', 'ภ.ง.ด.53', 'รางวัล ส่วนลด หรือประโยชน์จากการส่งเสริมการขาย',        'Prize / sales promotion',        3.00, 'both',     84),
  ('40(8)ACT', 'ภ.ง.ด.3',  'นักแสดงสาธารณะ',                                        'Public performer',               5.00, 'personal', 85),
  ('40(8)HTL', 'ภ.ง.ด.53', 'ค่าจ้างทำของประเภทโรงแรม ภัตตาคาร',                     'Hotel / restaurant service',     5.00, 'both',     86),
  ('NONE',     '-',        'ไม่หักภาษี ณ ที่จ่าย',                                  'No withholding',                 0.00, 'both',     99)
on conflict (code) do update set
  name_th = excluded.name_th, default_rate = excluded.default_rate, pnd_form = excluded.pnd_form;
