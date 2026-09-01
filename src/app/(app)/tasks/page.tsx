import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader } from '@/components/ui/page-header';
import { TaskWorkspace, type TaskRow } from '@/components/tasks/task-workspace';
import { TaskAiPanel } from '@/components/tasks/task-ai-panel';
import type { TaskDetail } from '@/components/tasks/task-panel';
import { aiBrief, type TaskSummary } from '@/lib/ai-brief';
import { SLUG_BY_KIND } from '@/lib/constants';
import { buildSuggestions, type OverdueDoc } from '@/lib/task-suggest';

export const dynamic = 'force-dynamic';

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const TASK_FIELDS =
  'id, code, title, description, kind, status, priority, start_at, due_at, progress, document_id, contact_id';

export default async function TasksPage({
  searchParams,
}: {
  searchParams: { d?: string; t?: string; view?: string; u?: string; q?: string };
}) {
  const ctx = await requirePermission('tasks', 'view');
  const d = t();
  const supabase = createClient();

  const anchor = searchParams.d && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.d)
    ? new Date(searchParams.d + 'T00:00:00')
    : new Date();

  // ดึงข้อมูลคลุมทั้งเดือนบวกลบหนึ่งสัปดาห์ มุมมองสัปดาห์ที่คร่อมเดือนจึงยังครบ
  const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  from.setDate(from.getDate() - 7);
  const to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  to.setDate(to.getDate() + 7);

  const [{ data: dated }, { data: undatedRows }, { data: memberRows }, { data: summaryJson }] = await Promise.all([
    supabase
      .from('tasks')
      .select(TASK_FIELDS)
      .eq('company_id', ctx.company.id)
      .or(`and(start_at.gte.${from.toISOString()},start_at.lte.${to.toISOString()}),` +
          `and(start_at.is.null,due_at.gte.${from.toISOString()},due_at.lte.${to.toISOString()})`)
      .order('due_at', { nullsFirst: false })
      .limit(1000),
    supabase
      .from('tasks')
      .select(TASK_FIELDS)
      .eq('company_id', ctx.company.id)
      .is('start_at', null)
      .is('due_at', null)
      .in('status', ['todo', 'in_progress', 'blocked', 'review'])
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('user_companies')
      .select('user_id, profiles(id, full_name, email)')
      .eq('company_id', ctx.company.id)
      .eq('is_active', true),
    supabase.rpc('rpt_task_summary', { p_company: ctx.company.id }),
  ]);

  const members = (memberRows || [])
    .map((r: any) => ({
      id: r.profiles?.id || r.user_id,
      name: r.profiles?.full_name || r.profiles?.email || d.ui.task.unknownName,
      email: r.profiles?.email,
    }))
    .filter((m: any) => m.id);

  const all = [...(dated || []), ...(undatedRows || [])] as any[];
  const ids = all.map((x) => x.id);

  // นับของประกอบทีเดียวทั้งชุด แทนที่จะยิงทีละงาน
  const [{ data: assigneeRows }, { data: commentRows }, { data: checkRows }, { data: fileRows }] =
    ids.length > 0
      ? await Promise.all([
          supabase.from('task_assignees').select('task_id, user_id').in('task_id', ids),
          supabase.from('task_comments').select('task_id').in('task_id', ids),
          supabase.from('task_checklist').select('task_id, is_done').in('task_id', ids),
          supabase.from('attachments').select('task_id').in('task_id', ids),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const nameOf = new Map(members.map((m: any) => [m.id, m.name]));
  const assigneesOf = new Map<string, { id: string; name: string }[]>();
  for (const a of assigneeRows || []) {
    const list = assigneesOf.get(a.task_id) || [];
    list.push({ id: a.user_id, name: nameOf.get(a.user_id) || d.ui.task.unknownName });
    assigneesOf.set(a.task_id, list);
  }
  const countIn = (rows: any[] | null, key = 'task_id') => {
    const m = new Map<string, number>();
    for (const r of rows || []) m.set(r[key], (m.get(r[key]) || 0) + 1);
    return m;
  };
  const comments = countIn(commentRows);
  const files = countIn(fileRows);
  const checkTotal = countIn(checkRows);
  const checkDone = countIn((checkRows || []).filter((c: any) => c.is_done));

  const toRow = (x: any): TaskRow => ({
    id: x.id, code: x.code, title: x.title, description: x.description,
    kind: x.kind, status: x.status, priority: x.priority,
    start_at: x.start_at, due_at: x.due_at, progress: x.progress,
    assignees: assigneesOf.get(x.id) || [],
    comment_count: comments.get(x.id) || 0,
    checklist_total: checkTotal.get(x.id) || 0,
    checklist_done: checkDone.get(x.id) || 0,
    attachment_count: files.get(x.id) || 0,
  });

  /* ───────── งานที่เปิดอยู่ในแผงรายละเอียด ───────── */
  let detail: TaskDetail | null = null;
  if (searchParams.t) {
    const { data: task } = await supabase
      .from('tasks')
      .select(TASK_FIELDS)
      .eq('id', searchParams.t)
      .eq('company_id', ctx.company.id)
      .maybeSingle();

    if (task) {
      const [{ data: cm }, { data: cl }, { data: at }, { data: asg }] = await Promise.all([
        supabase.from('task_comments').select('id, body, created_by, created_at')
          .eq('task_id', task.id).order('created_at'),
        supabase.from('task_checklist').select('id, title, is_done')
          .eq('task_id', task.id).order('position'),
        supabase.from('attachments').select('id, file_name, size_bytes')
          .eq('task_id', task.id).order('created_at', { ascending: false }),
        supabase.from('task_assignees').select('user_id').eq('task_id', task.id),
      ]);

      let doc: any = null;
      if (task.document_id) {
        const { data } = await supabase.from('documents').select('id, doc_number, kind').eq('id', task.document_id).maybeSingle();
        if (data) doc = { id: data.id, doc_number: data.doc_number, kind: SLUG_BY_KIND[data.kind] || 'invoices' };
      }
      let contact: any = null;
      if (task.contact_id) {
        const { data } = await supabase.from('contacts').select('id, name').eq('id', task.contact_id).maybeSingle();
        contact = data;
      }

      detail = {
        ...(task as any),
        assignees: (asg || []).map((a: any) => ({ id: a.user_id, name: nameOf.get(a.user_id) || d.ui.task.unknownName })),
        comments: (cm || []).map((c: any) => ({
          ...c, author: nameOf.get(c.created_by) || d.ui.task.unknownName,
        })),
        checklist: cl || [],
        attachments: at || [],
        doc,
        contact,
      };
    }
  }

  /* ───────── ข้อมูลตั้งต้นสำหรับงานที่ระบบเสนอ ───────── */
  const todayIso = new Date().toISOString().slice(0, 10);
  const [{ data: arRows }, { data: keyRows }] = await Promise.all([
    supabase
      .from('documents')
      .select('id, doc_number, due_date, grand_total, net_payable, paid_amount, contact_id, contact_snapshot, contacts(name)')
      .eq('company_id', ctx.company.id)
      .in('kind', ['invoice', 'tax_invoice', 'billing_note', 'debit_note'])
      .in('status', ['approved', 'partial', 'overdue'])
      .lt('due_date', todayIso)
      .order('due_date')
      .limit(30),
    supabase
      .from('tasks')
      .select('auto_key')
      .eq('company_id', ctx.company.id)
      .not('auto_key', 'is', null),
  ]);

  const overdueDocs: OverdueDoc[] = (arRows || [])
    .map((r: any) => {
      const owed = Number(r.net_payable ?? r.grand_total ?? 0) - Number(r.paid_amount || 0);
      return {
        id: r.id,
        doc_number: r.doc_number,
        contact_name: r.contacts?.name || (r.contact_snapshot || {}).name || d.ui.task.unknownCustomer,
        contact_id: r.contact_id,
        days_late: Math.max(1, Math.floor((Date.now() - new Date(r.due_date).getTime()) / 86400000)),
        outstanding: owed,
      };
    })
    .filter((d) => d.outstanding > 0.005)
    .sort((a, b) => b.days_late - a.days_late);

  const existingKeys = (keyRows || [])
    .map((r: any) => String(r.auto_key).replace(/^sug-/, ''));

  // งวดภาษีที่ต้องยื่นในเดือนนี้ คือข้อมูลของเดือนก่อนหน้า
  const now = new Date();
  const taxMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const taxPeriod = `${taxMonth.getFullYear()}${String(taxMonth.getMonth() + 1).padStart(2, '0')}`;

  const summary = (summaryJson || {
    counts: { todo: 0, in_progress: 0, blocked: 0, review: 0, done: 0, total: 0 },
    overdue_count: 0, overdue: [], due_today: 0, due_week: 0,
    unassigned: 0, done_last_7_days: 0, workload: [], upcoming: [],
  }) as TaskSummary;

  const brief = await aiBrief(summary, d, currentLocale());

  const suggestions = buildSuggestions({
    overdueDocs,
    blocked: summary.counts.blocked,
    unassigned: summary.unassigned,
    overdueTasks: summary.overdue_count,
    existingKeys,
    taxPeriod,
    taxPeriodLabel: `${String(taxMonth.getMonth() + 1).padStart(2, '0')}/${taxMonth.getFullYear()}`,
    hasTaxTasks: existingKeys.some((k) => k.endsWith(taxPeriod)),
  }, d, ctx.company.base_currency, currentLocale());

  return (
    <>
      <PageHeader
        title={d.nav.tasks}
        subtitle={`${ctx.company.name_th} · ${d.ui.task.pageSubtitle}`}
      />

      <TaskWorkspace
        tasks={(dated || []).map(toRow)}
        undated={(undatedRows || []).map(toRow)}
        members={members}
        anchorDate={dayKey(anchor)}
        currentUserId={ctx.userId}
        perms={{
          create: can(ctx, 'tasks', 'create'),
          edit: can(ctx, 'tasks', 'edit'),
          delete: can(ctx, 'tasks', 'delete'),
        }}
        detail={detail}
        aiPanel={
          <TaskAiPanel
            brief={brief}
            summary={summary}
            suggestions={suggestions}
            canCreate={can(ctx, 'tasks', 'create')}
          />
        }
      />
    </>
  );
}
