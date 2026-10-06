import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

// ช่องให้ "ระบบทรัพย์สิน" ดึงบิลที่ลงบัญชีแล้วและเข้าบัญชีสินทรัพย์ (ต้นทุนจริง)
// ยืนยันตัวด้วย header X-Asset-Key = env ASSET_SYNC_KEY (คนละชั้นกับ session ของผู้ใช้)
// เส้นทาง /api/integrations อยู่ใน PUBLIC_PATHS ของ middleware — ความปลอดภัยอยู่ที่ token นี้
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const key = process.env.ASSET_SYNC_KEY;
  if (!key) return NextResponse.json({ error: 'ASSET_SYNC_KEY not configured' }, { status: 503 });

  const sent = request.headers.get('x-asset-key');
  if (sent !== key) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const company = new URL(request.url).searchParams.get('company');
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('rpt_asset_candidates', { p_company: company || null });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ count: (data || []).length, data: data || [] }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
