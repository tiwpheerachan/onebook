import { NextResponse } from 'next/server';
import { getSessionContext, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

/**
 * เอกสารที่ยังค้างชำระของคู่ค้ารายหนึ่ง — ให้ฟอร์มรับ-จ่ายชำระเรียกตอนเลือกคู่ค้า
 * ตรวจสิทธิ์ซ้ำที่นี่ด้วย ไม่เชื่อค่าที่ส่งมาจากเบราว์เซอร์
 */
export async function GET(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx || !can(ctx, 'finance.payments', 'view')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const contact = url.searchParams.get('contact');
  const side = url.searchParams.get('side') === 'pay' ? 'pay' : 'receive';
  if (!contact || !/^[0-9a-f-]{36}$/i.test(contact)) {
    return NextResponse.json({ rows: [] });
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc('rpt_open_documents', {
    p_company: ctx.company.id, p_contact: contact, p_side: side,
  });
  if (error) return NextResponse.json({ rows: [], error: error.message }, { status: 500 });

  return NextResponse.json({ rows: data || [] });
}
