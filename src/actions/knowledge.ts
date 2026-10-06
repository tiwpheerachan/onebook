'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext, can } from '@/lib/session';
import { t } from '@/i18n/server';
import { generateKnowledge } from '@/lib/deepseek';

export interface KnowledgeRes { ok: boolean; error?: string; id?: string }

/** สร้าง/อัปเดตบทความความรู้ด้วย AI แล้วบันทึก (topic เดิม = อัปเดตทับ) */
export async function generateKnowledgeArticle(topic: string, tags: string[] = []): Promise<KnowledgeRes> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: t().ui.act.noSession };
  if (!can(ctx, 'accounting.assets', 'create')) return { ok: false, error: t().ui.act.noPermission };
  if (!topic.trim()) return { ok: false, error: t().ui.knowledge.topicRequired };

  let art;
  try {
    art = await generateKnowledge(topic.trim());
  } catch (e: any) {
    const msg = e?.message === 'DEEPSEEK_NOT_CONFIGURED' ? t().ui.knowledge.notConfigured : String(e?.message || e);
    return { ok: false, error: msg };
  }

  const supabase = createClient();
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const { data, error } = await supabase
    .from('asset_knowledge')
    .upsert(
      {
        company_id: ctx.company.id,
        topic: topic.trim(),
        title: art.title,
        summary: art.summary,
        content: art.content,
        sources: art.sources,
        tags,
        model,
        generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_by: ctx.userId,
      },
      { onConflict: 'company_id,topic' },
    )
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  revalidatePath('/accounting/knowledge');
  return { ok: true, id: data?.id };
}

export async function deleteKnowledge(id: string): Promise<KnowledgeRes> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: t().ui.act.noSession };
  if (!can(ctx, 'accounting.assets', 'delete')) return { ok: false, error: t().ui.act.noPermission };

  const supabase = createClient();
  const { error } = await supabase.from('asset_knowledge').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/accounting/knowledge');
  return { ok: true };
}
