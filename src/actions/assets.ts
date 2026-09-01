'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext, can } from '@/lib/session';
import { t } from '@/i18n/server';

export interface Res {
  ok: boolean;
  error?: string;
  id?: string;
  result?: any;
}

const num = (v: any, def = 0) => (v === '' || v == null || Number.isNaN(Number(v)) ? def : Number(v));

/** เพิ่ม / แก้ไขสินทรัพย์ถาวร */
export async function saveAsset(form: any): Promise<Res> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: t().ui.act.noSession };
  const action = form.id ? 'edit' : 'create';
  if (!can(ctx, 'accounting.assets', action)) return { ok: false, error: t().ui.act.noPermission };

  if (!form.code || !form.name) return { ok: false, error: t().ui.act.assetCodeNameRequired };
  if (!form.acquired_date) return { ok: false, error: t().ui.act.assetAcquireDateRequired };
  if (num(form.cost) <= 0) return { ok: false, error: t().ui.act.assetCostPositive };
  if (num(form.salvage_value) > num(form.cost)) return { ok: false, error: t().ui.act.assetSalvageTooHigh };
  if (form.method !== 'none' && num(form.useful_life_months) <= 0) {
    return { ok: false, error: t().ui.act.assetLifePositive };
  }
  if (!form.asset_account_id || !form.accum_dep_account_id) {
    return { ok: false, error: t().ui.act.assetAccountsRequired };
  }

  const supabase = createClient();
  const row = {
    company_id: ctx.company.id,
    code: String(form.code).trim(),
    name: String(form.name).trim(),
    name_en: form.name_en || null,
    category: form.category || null,
    serial_no: form.serial_no || null,
    location: form.location || null,
    acquired_date: form.acquired_date,
    in_service_date: form.in_service_date || form.acquired_date,
    cost: num(form.cost),
    salvage_value: num(form.salvage_value),
    useful_life_months: Math.round(num(form.useful_life_months, 60)),
    method: form.method || 'straight_line',
    declining_rate: num(form.declining_rate),
    opening_accum_dep: num(form.opening_accum_dep),
    asset_account_id: form.asset_account_id,
    accum_dep_account_id: form.accum_dep_account_id,
    expense_account_id: form.expense_account_id || null,
    note: form.note || null,
  };

  const q = form.id
    ? supabase.from('fixed_assets').update(row).eq('id', form.id).select('id').maybeSingle()
    : supabase.from('fixed_assets').insert(row).select('id').maybeSingle();

  const { data, error } = await q;
  if (error) {
    if (error.code === '23505') return { ok: false, error: t().ui.act.assetCodeUsed };
    return { ok: false, error: error.message };
  }

  revalidatePath('/accounting/assets');
  return { ok: true, id: data?.id };
}

/**
 * คิดค่าเสื่อมราคาประจำงวด
 * dryRun = true จะคำนวณให้ดูอย่างเดียว ยังไม่ลงบัญชี
 */
export async function runDepreciation(periodEnd: string, dryRun = false): Promise<Res> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: t().ui.act.noSession };
  if (!can(ctx, 'accounting.assets', 'post')) return { ok: false, error: t().ui.act.assetNoDepreciate };
  if (!periodEnd) return { ok: false, error: t().ui.act.assetPeriodRequired };
  if (!dryRun && ctx.lockedThrough && periodEnd <= ctx.lockedThrough) {
    return { ok: false, error: t().ui.misc.periodFrozen.replace('{date}', String(ctx.lockedThrough)) };
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc('run_depreciation', {
    p_company: ctx.company.id,
    p_period_end: periodEnd,
    p_dry_run: dryRun,
  });
  if (error) return { ok: false, error: error.message };

  if (!dryRun) revalidatePath('/accounting/assets');
  return { ok: true, result: data };
}

/** ตัดจำหน่าย / ขายสินทรัพย์ */
export async function disposeAsset(form: {
  asset_id: string;
  disposed_date: string;
  proceeds: number;
  note?: string | null;
}): Promise<Res> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: t().ui.act.noSession };
  if (!can(ctx, 'accounting.assets', 'post')) return { ok: false, error: t().ui.act.assetNoDispose };
  if (!form.disposed_date) return { ok: false, error: t().ui.act.assetDisposeDateRequired };
  if (ctx.lockedThrough && form.disposed_date <= ctx.lockedThrough) {
    return { ok: false, error: t().ui.misc.periodFrozen.replace('{date}', String(ctx.lockedThrough)) };
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc('dispose_asset', {
    p_asset: form.asset_id,
    p_date: form.disposed_date,
    p_proceeds: num(form.proceeds),
    p_note: form.note || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/accounting/assets');
  return { ok: true, id: data as string };
}
