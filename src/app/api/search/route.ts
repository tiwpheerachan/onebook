import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { EMPTY_RESULT } from '@/lib/search-meta';

export const dynamic = 'force-dynamic';

/**
 * ค้นหาทุกอย่างจากช่องเดียว
 *
 * ใช้ client ของผู้ใช้ (ไม่ใช่ service role) และฟังก์ชันในฐานข้อมูลเป็น security invoker
 * สิทธิ์จึงถูกกรองด้วย RLS เดิมทั้งหมด — ค้นเจอเฉพาะสิ่งที่ตัวเองเปิดดูได้อยู่แล้ว
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q')?.trim() || '';
  if (q.length < 2) return NextResponse.json(EMPTY_RESULT);

  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json(EMPTY_RESULT, { status: 401 });

  const supabase = createClient();
  const { data, error } = await supabase.rpc('rpt_global_search', {
    p_company: ctx.company.id,
    p_q: q,
    p_limit: 6,
  });

  if (error) return NextResponse.json({ ...EMPTY_RESULT, error: error.message }, { status: 500 });
  return NextResponse.json(data || EMPTY_RESULT);
}
