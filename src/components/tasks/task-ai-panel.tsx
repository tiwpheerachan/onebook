'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles, CalendarPlus, Info, Check, PanelRightClose, PanelRightOpen, Plus, ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { seedTaxDeadlines, addSuggestedTasks } from '@/actions/tasks';
import { kindMeta, priorityMeta } from '@/lib/task-meta';
import type { Brief, TaskSummary } from '@/lib/ai-brief';
import type { Suggestion } from '@/lib/task-suggest';

/**
 * แถบผู้ช่วยฝั่งขวา
 * ส่วนบนเป็นบทสรุป ส่วนล่างเป็นงานที่ระบบเสนอ ซึ่งติ๊กเลือกแล้วกดเพิ่มเข้าตารางได้ทันที
 */
export function TaskAiPanel({
  brief, summary, suggestions, canCreate,
}: {
  brief: Brief;
  summary: TaskSummary;
  suggestions: Suggestion[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [picked, setPicked] = useState<string[]>(
    () => suggestions.filter((s) => s.preselect).map((s) => s.key)
  );
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  const open_ = summary.counts.todo + summary.counts.in_progress + summary.counts.blocked + summary.counts.review;
  const stats = [
    { label: 'ค้างอยู่', value: open_, tone: 'text-ink-900' },
    { label: 'เลยกำหนด', value: summary.overdue_count, tone: summary.overdue_count > 0 ? 'text-rose-600' : 'text-ink-900' },
    { label: 'ครบวันนี้', value: summary.due_today, tone: summary.due_today > 0 ? 'text-amber-600' : 'text-ink-900' },
    { label: 'ปิดใน 7 วัน', value: summary.done_last_7_days, tone: 'text-emerald-600' },
  ];

  const chosen = useMemo(() => suggestions.filter((s) => picked.includes(s.key)), [suggestions, picked]);

  function addPicked() {
    setErr(''); setMsg('');
    start(async () => {
      const res = await addSuggestedTasks(
        chosen.map((s) => ({
          key: s.key, title: s.title, kind: s.kind, priority: s.priority,
          dueInDays: s.dueInDays, documentId: s.documentId, contactId: s.contactId, reason: s.reason,
        }))
      );
      if (!res.ok) { setErr(res.error || ''); return; }
      setMsg(res.count ? `เพิ่มเข้าตารางงานแล้ว ${res.count} รายการ` : 'งานเหล่านี้ถูกเพิ่มไว้แล้ว');
      setPicked([]);
      router.refresh();
    });
  }

  function seed() {
    setErr(''); setMsg('');
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    start(async () => {
      const res = await seedTaxDeadlines(d.getFullYear(), d.getMonth() + 1);
      if (!res.ok) { setErr(res.error || ''); return; }
      setMsg(res.count ? `เพิ่มกำหนดยื่นภาษี ${res.count} รายการ` : 'ปฏิทินภาษีงวดนี้ถูกเพิ่มไว้แล้ว');
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="เปิดแถบผู้ช่วย"
        className="sticky top-20 flex h-11 w-11 items-center justify-center rounded-xl border border-ink-200 bg-white text-brand-700 shadow-card transition hover:bg-brand-50"
      >
        <PanelRightOpen className="h-4 w-4" strokeWidth={1.8} />
      </button>
    );
  }

  return (
    <aside className="sticky top-20 space-y-4">
      {/* บทสรุป */}
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-br from-brand-700 to-brand-900 px-4 py-3.5 text-white">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-white/15 p-1.5">
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
            </span>
            <h2 className="text-sm font-semibold">ผู้ช่วยสรุปงาน</h2>
            <button
              onClick={() => setOpen(false)}
              title="ย่อแถบผู้ช่วย"
              className="ml-auto rounded-lg p-1 text-white/70 transition hover:bg-white/15 hover:text-white"
            >
              <PanelRightClose className="h-3.5 w-3.5" strokeWidth={1.8} />
            </button>
          </div>

          <span className={cn(
            'chip mt-2 ring-0',
            brief.byAi ? 'bg-white/20 text-white' : 'bg-white/10 text-white/70'
          )}>
            {brief.byAi ? 'เรียบเรียงโดย AI' : 'สรุปอัตโนมัติ'}
          </span>

          <div className="mt-2 space-y-1.5">
            {brief.lines.map((l, i) => (
              <p key={i} className="text-xs leading-relaxed text-white/90">{l}</p>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-y divide-ink-100">
          {stats.map((s) => (
            <div key={s.label} className="px-3 py-2.5 text-center">
              <p className={cn('text-lg font-semibold tabular-nums', s.tone)}>{s.value}</p>
              <p className="text-xxs text-ink-500">{s.label}</p>
            </div>
          ))}
        </div>

        {brief.actions.length > 0 && (
          <ul className="divide-y divide-ink-100 border-t border-ink-100">
            {brief.actions.map((a, i) => (
              <li key={i} className="flex items-start gap-2 px-4 py-2 text-xs text-ink-700">
                <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-brand-500" strokeWidth={2} />
                <span className="leading-relaxed">{a}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* งานที่เสนอให้เพิ่ม */}
      {canCreate && (
        <div className="card overflow-hidden">
          <div className="border-b border-ink-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-ink-900">งานที่แนะนำให้เพิ่ม</h2>
            <p className="mt-0.5 text-xxs leading-relaxed text-ink-400">
              ทุกข้อมาจากข้อมูลจริงในระบบ ติ๊กเลือกแล้วกดเพิ่มเข้าตารางงานได้เลย
            </p>
          </div>

          {suggestions.length === 0 ? (
            <p className="px-4 py-4 text-xs text-ink-400">
              ยังไม่มีงานที่ต้องเสนอเพิ่ม — บิลค้างชำระและงานค้างอยู่ในเกณฑ์ปกติ
            </p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {suggestions.map((s) => {
                const on = picked.includes(s.key);
                return (
                  <li key={s.key}>
                    <label
                      className={cn(
                        'flex cursor-pointer items-start gap-2.5 px-4 py-2.5 transition',
                        on ? 'bg-brand-50/60' : 'hover:bg-ink-50'
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-300 text-brand-600 focus:ring-brand-300"
                        checked={on}
                        onChange={(e) =>
                          setPicked((p) => (e.target.checked ? [...p, s.key] : p.filter((x) => x !== s.key)))
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-medium leading-snug text-ink-900">{s.title}</span>
                        <span className="mt-0.5 block text-xxs leading-relaxed text-ink-500">{s.reason}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-1">
                          <span className={cn('chip', priorityMeta(s.priority).chip)}>
                            {priorityMeta(s.priority).label}
                          </span>
                          <span className={cn('chip ring-0', kindMeta(s.kind).block)}>
                            {kindMeta(s.kind).label}
                          </span>
                          <span className="text-xxs text-ink-400">
                            {s.dueInDays === 0 ? 'ครบกำหนดวันนี้' : `อีก ${s.dueInDays} วัน`}
                          </span>
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {suggestions.length > 0 && (
            <div className="border-t border-ink-200 bg-ink-50 px-4 py-3">
              <button
                className="btn-primary w-full"
                disabled={pending || chosen.length === 0}
                onClick={addPicked}
              >
                {pending ? <ShdSpinner size={16} /> : <Plus className="h-4 w-4" strokeWidth={2} />}
                เพิ่มเข้าตารางงาน {chosen.length > 0 && `(${chosen.length})`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ภาระงานรายคน */}
      {summary.workload.length > 0 && (
        <div className="card card-pad">
          <p className="section-title mb-2.5">ภาระงานรายคน</p>
          <ul className="space-y-2">
            {summary.workload.slice(0, 6).map((w) => (
              <li key={w.id}>
                <div className="flex items-center justify-between text-xs">
                  <span className="truncate text-ink-700">{w.name}</span>
                  <span className="shrink-0 tabular-nums text-ink-500">
                    {w.open_tasks} งาน
                    {w.overdue_tasks > 0 && <b className="ml-1 text-rose-600">·{w.overdue_tasks} เลยกำหนด</b>}
                  </span>
                </div>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-ink-100">
                  <span
                    className={cn('block h-full rounded-full', w.overdue_tasks > 0 ? 'bg-rose-400' : 'bg-brand-500')}
                    style={{ width: `${Math.min(100, (w.open_tasks / Math.max(1, summary.workload[0].open_tasks)) * 100)}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* เครื่องมือ */}
      <div className="card card-pad space-y-2">
        {canCreate && (
          <button className="btn-secondary w-full" disabled={pending} onClick={seed}>
            {pending ? <ShdSpinner size={16} /> : <CalendarPlus className="h-4 w-4 text-ink-400" strokeWidth={1.8} />}
            ดึงปฏิทินภาษีเดือนนี้
          </button>
        )}
        {msg && (
          <p className="flex items-center gap-1.5 text-xs text-emerald-700">
            <Check className="h-3.5 w-3.5" strokeWidth={2} /> {msg}
          </p>
        )}
        {err && <p className="text-xs text-rose-600">{err}</p>}
        {brief.note && (
          <p className="flex items-start gap-1.5 text-xxs leading-relaxed text-ink-400">
            <Info className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} /> {brief.note}
          </p>
        )}
      </div>
    </aside>
  );
}
