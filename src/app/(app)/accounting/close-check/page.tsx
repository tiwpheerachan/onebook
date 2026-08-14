import { requirePermission, can } from '@/lib/session';
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
        <PageHeader title="ตรวจก่อนปิดงบ" subtitle={ctx.company.name_th} />
        <p className="card card-pad text-sm text-rose-700">ตรวจไม่สำเร็จ : {error.message}</p>
      </>
    );
  }

  const check = data as CloseCheck;
  const findings = sortFindings(check.findings || []) as FindingView[];
  const brief = await aiCloseBrief(check);

  return (
    <>
      <PageHeader
        title="ตรวจก่อนปิดงบ"
        subtitle={`${ctx.company.name_th} · งวด ${month}/${year} · ตรวจ 15 ข้อที่นักบัญชีต้องไล่เช็กเองทุกเดือน`}
        breadcrumb={[{ label: 'บัญชี' }, { label: 'ตรวจก่อนปิดงบ' }]}
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
