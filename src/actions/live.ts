'use server';
import { getSessionContext, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { firstDayOfMonth, lastDayOfMonth } from '@/lib/format';

export interface LiveStats {
  ok: boolean;
  cash?: number;
  arOverdue?: number;
  awaitingApproval?: number;
  unread?: number;
  /** เวลาที่ดึงข้อมูล ใช้บอกผู้ใช้ว่าตัวเลขสดแค่ไหน */
  asOf?: string;
}

/**
 * ตัวเลขสั้น ๆ สำหรับแถบด้านบน
 *
 * ใช้ฟังก์ชันเดิมที่ตรวจสิทธิ์อยู่แล้วทั้งคู่ ไม่เขียนคิวรีใหม่
 * คนที่ไม่มีสิทธิ์ดูรายงานจะได้ค่าศูนย์จาก RLS เอง ไม่ต้องกรองซ้ำที่นี่
 */
export async function getLiveStats(): Promise<LiveStats> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false };

  const supabase = createClient();
  const [dash, unread] = await Promise.all([
    can(ctx, 'report', 'view')
      ? supabase.rpc('rpt_dashboard', {
          p_company: ctx.company.id,
          p_from: firstDayOfMonth(),
          p_to: lastDayOfMonth(),
        })
      : Promise.resolve({ data: null }),
    supabase.rpc('rpt_unread_count', { p_company: ctx.company.id }),
  ]);

  const s = (dash.data || {}) as any;
  return {
    ok: true,
    cash: Number(s.cash_balance || 0),
    arOverdue: Number(s.doc_overdue || 0),
    awaitingApproval: Number(s.awaiting_approval || 0),
    unread: Number(unread.data || 0),
    asOf: new Date().toISOString(),
  };
}
