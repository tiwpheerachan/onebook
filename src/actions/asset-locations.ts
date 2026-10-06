'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext, can } from '@/lib/session';
import { t } from '@/i18n/server';

export interface LocRes { ok: boolean; error?: string; id?: string }

export async function saveAssetLocation(form: any): Promise<LocRes> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: t().ui.act.noSession };
  const action = form.id ? 'edit' : 'create';
  if (!can(ctx, 'accounting.assets', action)) return { ok: false, error: t().ui.act.noPermission };
  if (!form.code || !form.name) return { ok: false, error: t().ui.assetLoc.codeNameRequired };

  const supabase = createClient();
  const row = {
    company_id: ctx.company.id,
    code: String(form.code).trim(),
    name: String(form.name).trim(),
    building: form.building || null,
    floor: form.floor || null,
    room: form.room || null,
    is_active: form.is_active !== false,
  };
  const q = form.id
    ? supabase.from('asset_locations').update(row).eq('id', form.id).select('id').maybeSingle()
    : supabase.from('asset_locations').insert(row).select('id').maybeSingle();
  const { data, error } = await q;
  if (error) {
    if (error.code === '23505') return { ok: false, error: t().ui.assetLoc.codeUsed };
    return { ok: false, error: error.message };
  }
  revalidatePath('/accounting/asset-locations');
  return { ok: true, id: data?.id };
}

export async function deleteAssetLocation(id: string): Promise<LocRes> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: t().ui.act.noSession };
  if (!can(ctx, 'accounting.assets', 'delete')) return { ok: false, error: t().ui.act.noPermission };
  const supabase = createClient();
  const { error } = await supabase.from('asset_locations').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/accounting/asset-locations');
  return { ok: true };
}
