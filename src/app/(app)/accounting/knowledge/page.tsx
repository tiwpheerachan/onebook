import { Info, ExternalLink } from 'lucide-react';
import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { localeDate } from '@/lib/format';
import { KnowledgeGenerate } from '@/components/forms/knowledge-generate';
import { KnowledgeDelete } from '@/components/forms/knowledge-delete';

export const dynamic = 'force-dynamic';

export default async function KnowledgePage() {
  const ctx = await requirePermission('accounting.assets', 'view');
  const d = t();
  const locale = currentLocale();
  const supabase = createClient();
  const { data } = await supabase
    .from('asset_knowledge')
    .select('id, topic, title, summary, content, sources, tags, model, updated_at')
    .eq('company_id', ctx.company.id)
    .order('updated_at', { ascending: false });
  const rows = (data || []) as any[];
  const canCreate = can(ctx, 'accounting.assets', 'create');
  const canDelete = can(ctx, 'accounting.assets', 'delete');

  return (
    <>
      <PageHeader title={d.ui.knowledge.title} subtitle={d.ui.knowledge.subtitle} />

      <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200">
        <Info className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
        <span>{d.ui.knowledge.disclaimer}</span>
      </div>

      {canCreate && (
        <Card className="mb-5">
          <div className="p-4">
            <KnowledgeGenerate
              suggested={d.ui.knowledge.topics as unknown as string[]}
              labels={{
                placeholder: d.ui.knowledge.placeholder,
                generate: d.ui.knowledge.generate,
                failed: d.ui.knowledge.failed,
                suggested: d.ui.knowledge.suggested,
              }}
            />
          </div>
        </Card>
      )}

      {rows.length === 0 ? (
        <Card><div className="px-4 py-10 text-center text-[13px] text-ink-400">{d.ui.knowledge.empty}</div></Card>
      ) : (
        <div className="space-y-4">
          {rows.map((a) => (
            <Card key={a.id}>
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[15px] font-semibold text-ink-900">{a.title || a.topic}</h3>
                    {a.summary && <p className="mt-0.5 text-[13px] text-ink-500">{a.summary}</p>}
                  </div>
                  {canDelete && <KnowledgeDelete id={a.id} confirmText={d.ui.knowledge.confirmDelete} />}
                </div>

                {a.content && (
                  <div className="mt-3 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-800">{a.content}</div>
                )}

                {Array.isArray(a.sources) && a.sources.length > 0 && (
                  <div className="mt-4 border-t border-ink-100 pt-3">
                    <div className="mb-1.5 text-[12px] font-medium text-ink-500">{d.ui.knowledge.sources}</div>
                    <ul className="space-y-1">
                      {a.sources.map((s: any, i: number) => (
                        <li key={i} className="text-[12.5px] text-ink-600">
                          {s.url ? (
                            <a href={s.url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                              {s.title} <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span>{s.title}</span>
                          )}
                          {s.date && <span className="text-ink-400"> · {s.date}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-3 text-[11px] text-ink-400">
                  {d.ui.knowledge.updatedAt} {localeDate(a.updated_at, locale)}{a.model ? ` · ${a.model}` : ''}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
