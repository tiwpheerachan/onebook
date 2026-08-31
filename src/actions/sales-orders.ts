'use server';
import { revalidatePath } from 'next/cache';
import { getSessionContext, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';

export interface Shortage { sku: string; name: string; wanted: number; available: number }
export interface ReserveResult {
  ok: boolean;
  reserved?: number;
  shortages?: Shortage[];
  error?: string;
}

/** จองสินค้าตามใบสั่งขายทั้งใบ — จองเท่าที่มี แล้วรายงานบรรทัดที่ของไม่พอ */
export async function reserveSalesOrder(documentId: string): Promise<ReserveResult> {
  const ctx = await getSessionContext();
  const L = t().ui.salesOrder;
  if (!ctx || !can(ctx, 'products.inventory', 'edit')) return { ok: false, error: L.noPermission };

  const supabase = createClient();
  const { data, error } = await supabase.rpc('reserve_sales_order', { p_document: documentId });
  if (error) return { ok: false, error: error.message };

  const res = (data || {}) as any;
  revalidatePath('/sales/sales-orders');
  revalidatePath('/inventory/reservations');
  return {
    ok: true,
    reserved: Number(res.reserved || 0),
    shortages: (res.shortages || []) as Shortage[],
  };
}
