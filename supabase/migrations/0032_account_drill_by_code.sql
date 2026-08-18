-- =====================================================================
-- 0032 : กดตัวเลขในงบแล้วเจาะลงไปดูรายการที่ประกอบกันขึ้นมา
--
--  rpt_account_drill (0022) มีอยู่แล้วและใช้งานได้ แต่รับ account_id
--  ส่วนรายงานงบต่าง ๆ (rpt_profit_loss / rpt_balance_sheet / rpt_trial_balance)
--  คืนมาแค่รหัสบัญชี ไม่ได้คืน id จึงลิงก์ต่อไม่ได้
--
--  ทางเลือกคือแก้ return type ของรายงานทั้งสามให้คืน id เพิ่ม
--  แต่นั่นต้อง drop แล้วสร้างใหม่ กระทบทุกที่ที่เรียกอยู่
--  เลือกทำตัวห่อที่รับ "รหัสบัญชี" แทน เพิ่มของใหม่อย่างเดียว ไม่แตะของเดิม
--
--  อีกเหตุผลที่ต้องเป็น security definer : ผู้ใช้ที่มีสิทธิ์ดูรายงาน
--  อาจไม่มีสิทธิ์ดูผังบัญชี ถ้าให้หน้าเว็บไปหา id เองจะโดน RLS ปฏิเสธ
--  ทั้งที่ควรกดดูรายละเอียดตัวเลขในงบที่ตัวเองเปิดดูอยู่ได้
-- =====================================================================

create or replace function public.rpt_account_drill_by_code(
  p_company uuid,
  p_code    text,
  p_from    date,
  p_to      date
)
returns json
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare v_account uuid;
begin
  if not app.has_perm(p_company, 'report', 'view') then
    raise exception 'FORBIDDEN: ไม่มีสิทธิ์ดูรายงาน';
  end if;

  select id into v_account
  from public.accounts
  where company_id = p_company and code = p_code
  limit 1;

  if v_account is null then raise exception 'ACCOUNT_NOT_FOUND'; end if;

  return public.rpt_account_drill(p_company, v_account, p_from, p_to);
end $$;

grant execute on function public.rpt_account_drill_by_code(uuid, text, date, date) to authenticated;

comment on function public.rpt_account_drill_by_code is
  'เจาะดูรายการของบัญชีจากรหัสบัญชี — ใช้ตอนกดตัวเลขในงบ ที่ไม่มี account_id ติดมาด้วย';
