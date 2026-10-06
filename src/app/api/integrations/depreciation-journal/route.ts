import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

// รับค่าเสื่อมราคาจากระบบทรัพย์สิน มาลงสมุดรายวัน GL (เดบิต 6170 / เครดิต 12x1)
// ยืนยันด้วย X-Asset-Key = env ASSET_SYNC_KEY · กันลงซ้ำงวดเดิมในฟังก์ชัน SQL
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const key = process.env.ASSET_SYNC_KEY;
  if (!key) return NextResponse.json({ error: 'ASSET_SYNC_KEY not configured' }, { status: 503 });
  if (request.headers.get('x-asset-key') !== key) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const { company_id, period_end, lines } = body || {};
  if (!company_id || !period_end || !Array.isArray(lines)) {
    return NextResponse.json({ error: 'ต้องส่ง company_id, period_end, lines' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('post_external_depreciation', {
    p_company: company_id,
    p_period_end: period_end,
    p_lines: lines,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? {}, { headers: { 'Cache-Control': 'no-store' } });
}
