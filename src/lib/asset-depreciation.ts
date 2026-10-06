// คำนวณตารางค่าเสื่อม (เส้นตรง) สำหรับ "แสดงผล" บนหน้ารายละเอียดทรัพย์สิน
// งวดที่ลงบัญชีจริงอ่านจาก asset_depreciations (authoritative) ส่วนงวดอนาคตเป็นการพยากรณ์
// ตรรกะตรงกับ app.asset_monthly_depreciation (0015) ฝั่งเส้นตรง

const r2 = (n: number) => Math.round(n * 100) / 100;

export function addMonths(period: string, n: number): string {
  const [y, m] = period.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

export interface PostedDep { period_end: string; amount: number; accum_after: number; book_value: number }
export interface SchedRow { period: string; depreciation: number; accumulated: number; bookValue: number; posted: boolean }

export interface AssetLike {
  cost: number;
  salvage_value: number;
  useful_life_months: number;
  method: string;
  in_service_date?: string | null;
  acquired_date: string;
  opening_accum_dep?: number;
}

export function buildSchedule(a: AssetLike, posted: PostedDep[]): SchedRow[] {
  const rows: SchedRow[] = (posted || [])
    .slice()
    .sort((x, y) => x.period_end.localeCompare(y.period_end))
    .map((p) => ({
      period: p.period_end.slice(0, 7),
      depreciation: Number(p.amount),
      accumulated: Number(p.accum_after),
      bookValue: Number(p.book_value),
      posted: true,
    }));

  const cost = Number(a.cost || 0);
  const salvage = Number(a.salvage_value || 0);
  const life = Number(a.useful_life_months || 0);
  const base = r2(cost - salvage);
  if (a.method === 'none' || life <= 0 || base <= 0) return rows;

  // พยากรณ์งวดอนาคตแบบเส้นตรงต่อจากงวดล่าสุดที่ลงบัญชีแล้ว (หรือตั้งแต่เริ่มใช้งานถ้ายังไม่เคยลง)
  let accum = rows.length ? rows[rows.length - 1].accumulated : Number(a.opening_accum_dep || 0);
  let period = rows.length
    ? addMonths(rows[rows.length - 1].period, 1)
    : (a.in_service_date || a.acquired_date || '').slice(0, 7);
  if (!period) return rows;

  const monthly = r2(base / life);
  let guard = 0;
  while (accum < base - 0.005 && guard < life + 2) {
    let dep = monthly;
    if (accum + dep > base) dep = r2(base - accum);
    accum = r2(accum + dep);
    rows.push({ period, depreciation: dep, accumulated: accum, bookValue: r2(cost - accum), posted: false });
    period = addMonths(period, 1);
    guard++;
  }
  return rows;
}
