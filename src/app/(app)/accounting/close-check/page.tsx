import { requirePermission, can } from '@/lib/session';
import { t, currentLocale } from '@/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/page-header';
import { MonthPicker } from '@/components/forms/month-picker';
import { CloseCheckPanel, CloseSummary, type FindingView } from '@/components/forms/close-check-panel';
import { aiCloseBrief, sortFindings, type CloseCheck } from '@/lib/close-check';

export const dynamic = 'force-dynamic';

export default async function CloseCheckPage({
  searchParams,
}: {
  searchParams: { y?: string; m?: string };
}) {
  const ctx = await requirePermission('report', 'view');
  const d = t();
  const L = d.ui.closeCheck;
  const now = new Date();
  const year = Number(searchParams.y) || now.getFullYear();
  const month = Number(searchParams.m) || now.getMonth() + 1;

  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const to = new Date(year, month, 0).toISOString().slice(0, 10);
  const period = `${year}${String(month).padStart(2, '0')}`;

  const supabase = createClient();
  const { data, error } = await supabase.rpc('rpt_close_check', {
    p_company: ctx.company.id, p_from: from, p_to: to,
  });

  if (error) {
    return (
      <>
        <PageHeader title={L.title} subtitle={ctx.company.name_th} />
        <p className="card card-pad text-sm text-rose-700">{L.failed} : {error.message}</p>
      </>
    );
  }

  const check = data as CloseCheck;
  const findings = sortFindings(check.findings || []) as FindingView[];
  const brief = await aiCloseBrief(check, d, currentLocale());

  return (
    <>
      <PageHeader
        title={L.title}
        subtitle={`${ctx.company.name_th} · ${L.subtitle.replace('{period}', `${month}/${year}`)}`}
        breadcrumb={[{ label: d.nav.accounting }, { label: L.title }]}
        action={<MonthPicker year={year} month={month} />}
      />

      <CloseSummary
        errors={check.errors}
        warnings={check.warnings}
        infos={check.infos}
        lines={brief.lines}
        actions={brief.actions}
        byAi={brief.byAi}
        note={brief.note}
      />

      <CloseCheckPanel
        findings={findings}
        period={period}
        canCreateTask={can(ctx, 'tasks', 'create')}
      />
    </>
  );
}
