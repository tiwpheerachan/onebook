'use server';
import { revalidatePath } from 'next/cache';
import { getSessionContext, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';

type Res = { ok: boolean; error?: string };

function translate(msg: string): string {
  const L = t().ui.lot;
  if (msg.includes('LOT_NO_REQUIRED')) return L.lotRequired;
  if (msg.includes('NOT_TRACKED')) return L.notTracked;
  if (msg.includes('SERIAL_QTY')) return L.serialQty;
  if (msg.includes('SERIAL_EXISTS')) return L.serialExists;
  if (msg.includes('LOT_NOT_ENOUGH')) return L.notEnough;
  if (msg.includes('LOT_NOT_FOUND')) return L.lotNotFound;
  if (msg.includes('FORBIDDEN')) return L.noPermission;
  return msg;
}

export async function receiveLot(form: {
  product_id: string;
  warehouse_id: string;
  lot_no: string;
  qty: number;
  expiry_date?: string | null;
  mfg_date?: string | null;
  document_id?: string | null;
  note?: string | null;
}): Promise<Res> {
  const ctx = await getSessionContext();
  if (!ctx || !can(ctx, 'products.inventory', 'edit')) return { ok: false, error: t().ui.lot.noPermission };

  const supabase = createClient();
  const { error } = await supabase.rpc('lot_receive', {
    p_company: ctx.company.id,
    p_product: form.product_id,
    p_warehouse: form.warehouse_id,
    p_lot_no: form.lot_no,
    p_qty: Number(form.qty) || 0,
    p_expiry: form.expiry_date || null,
    p_document: form.document_id || null,
    p_mfg: form.mfg_date || null,
    p_note: form.note || null,
  });
  if (error) return { ok: false, error: translate(error.message) };

  revalidatePath('/inventory/lots');
  return { ok: true };
}

export async function issueLot(form: {
  product_id: string;
  lot_no: string;
  qty: number;
  document_id?: string | null;
  note?: string | null;
}): Promise<Res> {
  const ctx = await getSessionContext();
  if (!ctx || !can(ctx, 'products.inventory', 'edit')) return { ok: false, error: t().ui.lot.noPermission };

  const supabase = createClient();
  const { error } = await supabase.rpc('lot_issue', {
    p_company: ctx.company.id,
    p_product: form.product_id,
    p_lot_no: form.lot_no,
    p_qty: Number(form.qty) || 0,
    p_document: form.document_id || null,
    p_note: form.note || null,
  });
  if (error) return { ok: false, error: translate(error.message) };

  revalidatePath('/inventory/lots');
  return { ok: true };
}
