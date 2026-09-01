-- =====================================================================
-- 0070 : ความเคลื่อนไหวของค่าเงิน
--
--  0069 ทำให้คีย์เอกสารเป็นเงินตราต่างประเทศได้ แต่เก็บอัตราไว้เป็นจุด ๆ
--  เฉพาะวันที่มีคนกดดึง จึงยังตอบไม่ได้ว่า "หยวนแพงขึ้นหรือถูกลง"
--
--  ซึ่งเป็นคำถามที่คนซื้อของต่างประเทศถามก่อนตัดสินใจสั่งของ
--  ถ้าหยวนกำลังขึ้น การเลื่อนสั่งออกไปอีกเดือนแปลว่าจ่ายแพงขึ้นจริง ๆ
--
-- ---------------------------------------------------------------------
--  สองอย่างที่เพิ่ม
--
--  1) ชุดข้อมูลรายวันพร้อมส่วนต่างจากวันก่อนหน้า
--     คำนวณที่ฐานข้อมูลด้วย window function ไม่ส่งข้อมูลดิบไปให้หน้าจอคิดเอง
--     เพราะช่วงวันที่ไม่มีอัตรา (วันหยุด) ต้องเทียบกับวันทำการก่อนหน้า
--     ไม่ใช่วันปฏิทินก่อนหน้า ซึ่ง lag() จัดการให้ถูกอยู่แล้ว
--
--  2) สรุปช่วง : ต่ำสุด สูงสุด เฉลี่ย และเปลี่ยนแปลงกี่เปอร์เซ็นต์
--     ใช้กับหัวการ์ดและป้ายบนแถบด้านบน
--
--  ใช้อัตราขายเป็นหลักเหมือน 0069 เพราะเป็นตัวที่กระทบต้นทุนซื้อจริง
-- =====================================================================

-- ------------------------------------------------------------------------
-- 1) ชุดข้อมูลรายวันพร้อมการเปลี่ยนแปลง
-- ------------------------------------------------------------------------
create or replace function public.rpt_fx_trend(
  p_currency text, p_from date, p_to date
)
returns json
language sql
stable
security invoker
set search_path = public, app
as $ft$
  with series as (
    select r.rate_date, r.rate_sell, r.rate_buy, r.source,
           -- เทียบกับ "วันทำการก่อนหน้า" ไม่ใช่วันปฏิทินก่อนหน้า
           lag(r.rate_sell) over (order by r.rate_date) as prev_sell
    from public.exchange_rates r
    where r.currency = upper(p_currency)
      and r.rate_date between p_from and p_to
      and r.rate_sell is not null
  ),
  calc as (
    select *,
           rate_sell - prev_sell as diff,
           case when prev_sell > 0
                then round((rate_sell - prev_sell) / prev_sell * 100, 4) end as pct
    from series
  ),
  agg as (
    select min(rate_sell) as lo, max(rate_sell) as hi,
           round(avg(rate_sell), 6) as avg_sell, count(*) as n,
           (array_agg(rate_sell order by rate_date))[1] as first_sell,
           (array_agg(rate_sell order by rate_date desc))[1] as last_sell
    from calc
  )
  select json_build_object(
    'currency', upper(p_currency),
    'from', p_from, 'to', p_to,
    'count', (select n from agg),
    'low', (select lo from agg),
    'high', (select hi from agg),
    'average', (select avg_sell from agg),
    'first', (select first_sell from agg),
    'last', (select last_sell from agg),
    -- เปลี่ยนแปลงตลอดช่วง เทียบวันแรกกับวันสุดท้ายที่มีข้อมูล
    'change', case when (select first_sell from agg) > 0
                   then round(((select last_sell from agg) - (select first_sell from agg))
                              / (select first_sell from agg) * 100, 2) end,
    'points', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', rate_date, 'sell', rate_sell, 'buy', rate_buy,
        'diff', diff, 'pct', pct, 'source', source
      ) order by rate_date)
      from calc), '[]'::jsonb)
  );
$ft$;

grant execute on function public.rpt_fx_trend(text, date, date) to authenticated;

comment on function public.rpt_fx_trend is
  'ความเคลื่อนไหวของอัตราขายรายวัน พร้อมส่วนต่างจากวันทำการก่อนหน้าและสรุปช่วง';

-- ------------------------------------------------------------------------
-- 2) สรุปสั้นของหลายสกุลพร้อมกัน สำหรับแถบด้านบนและหน้าสรุป
--
--  คืนเฉพาะสกุลที่มีข้อมูลจริง สกุลที่ยังไม่เคยดึงมาจะไม่โผล่
--  ดีกว่าโชว์เป็นขีดว่างเต็มแถบ
-- ------------------------------------------------------------------------
create or replace function public.rpt_fx_latest(p_days int default 30)
returns json
language sql
stable
security invoker
set search_path = public, app
as $fl$
  with last_two as (
    select r.currency, r.rate_date, r.rate_sell,
           row_number() over (partition by r.currency order by r.rate_date desc) as rn
    from public.exchange_rates r
    where r.rate_sell is not null
      and r.rate_date >= current_date - greatest(1, least(p_days, 400))
  ),
  paired as (
    select a.currency, a.rate_date, a.rate_sell,
           b.rate_sell as prev_sell,
           case when b.rate_sell > 0
                then round((a.rate_sell - b.rate_sell) / b.rate_sell * 100, 2) end as pct
    from last_two a
    left join last_two b on b.currency = a.currency and b.rn = 2
    where a.rn = 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'currency', currency, 'rate_date', rate_date,
    'sell', rate_sell, 'prev', prev_sell, 'pct', pct
  ) order by currency), '[]'::jsonb)
  from paired;
$fl$;

grant execute on function public.rpt_fx_latest(int) to authenticated;

comment on function public.rpt_fx_latest is
  'อัตราล่าสุดของทุกสกุลที่มีข้อมูล พร้อมเปอร์เซ็นต์เปลี่ยนแปลงจากครั้งก่อนหน้า';

-- ------------------------------------------------------------------------
-- 3) บันทึกอัตราหลายวันพร้อมกัน
--
--  ธปท. รับช่วงวันที่ในคำขอเดียว ดึงย้อนหลังทีละสามเดือนจึงทำได้
--  ฟังก์ชันนี้รับทั้งก้อนมาเขียนรวดเดียว แทนที่จะยิงทีละวัน
--
--  ใช้ jsonb แทนการรับอาร์เรย์หลายตัว เพราะฝั่งแอปส่งผลจาก API มาตรง ๆ ได้เลย
-- ------------------------------------------------------------------------
create or replace function public.upsert_exchange_rates(p_rows jsonb)
returns json
language plpgsql
security invoker
set search_path = public, app
as $fn$
declare v_n int := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'ROWS_REQUIRED: ต้องส่งอัตรามาเป็นอาร์เรย์';
  end if;

  insert into public.exchange_rates (currency, rate_date, rate_buy, rate_sell, source, created_by)
  select upper(x->>'currency'), (x->>'rate_date')::date,
         nullif(x->>'rate_buy','')::numeric,
         nullif(x->>'rate_sell','')::numeric,
         coalesce(x->>'source','bot'), auth.uid()
  from jsonb_array_elements(p_rows) x
  where nullif(x->>'rate_sell','') is not null
     or nullif(x->>'rate_buy','') is not null
  on conflict (currency, rate_date) do update
    set rate_buy   = coalesce(excluded.rate_buy, public.exchange_rates.rate_buy),
        rate_sell  = coalesce(excluded.rate_sell, public.exchange_rates.rate_sell),
        source     = excluded.source,
        fetched_at = now();

  get diagnostics v_n = row_count;
  return json_build_object('saved', v_n);
end $fn$;

grant execute on function public.upsert_exchange_rates(jsonb) to authenticated;

comment on function public.upsert_exchange_rates is
  'บันทึกอัตราหลายวันในครั้งเดียว ใช้ตอนดึงย้อนหลังจาก ธปท. ซึ่งรับช่วงวันที่ในคำขอเดียว';
