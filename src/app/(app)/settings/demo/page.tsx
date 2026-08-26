import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';
import { PageHeader } from '@/components/ui/page-header';
import { DemoDataPanel } from '@/components/forms/demo-data-panel';

export const dynamic = 'force-dynamic';

export default async function DemoDataPage() {
  const ctx = await requirePermission('documents', 'view');
  const d = t();
  const supabase = createClient();

  const { data } = await supabase.rpc('rpt_demo_status', { p_company: ctx.company.id });
  const status = (data || { contacts: 0, documents: 0, seeded_at: null }) as any;

  return (
    <>
      <PageHeader title={d.ui.demo.title} subtitle={`${ctx.company.name_th} · ${d.ui.demo.subtitle}`} />
      <div className="max-w-2xl">
        <DemoDataPanel
          status={status}
          d={d}
          canCreate={can(ctx, 'documents', 'create')}
          canDelete={can(ctx, 'documents', 'delete')}
        />
      </div>
    </>
  );
}
