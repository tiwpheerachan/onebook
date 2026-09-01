'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle, XCircle, Send } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { useI18n } from '@/i18n/provider';
import { localeDate } from '@/lib/format';
import { cn } from '@/lib/cn';
import { submitForApproval, decideApproval } from '@/actions/approval';

export interface ApprovalStep {
  step_no: number;
  role_name: string;
  role_name_en: string | null;
  role_name_zh: string | null;
  status: 'pending' | 'approved' | 'rejected';
  decided_by: string | null;
  decided_at: string | null;
  note: string | null;
}
export interface ApprovalState {
  required: number;
  steps: ApprovalStep[];
  my_turn: boolean;
}

/**
 * สายอนุมัติของเอกสารหนึ่งใบ
 *
 * แสดงเฉพาะเอกสารที่เข้าเงื่อนไขกฎ (required > 0) หรือเคยส่งอนุมัติไปแล้ว
 * ใบที่ไม่ต้องอนุมัติจะไม่มีแผงนี้เลย เพื่อไม่ให้รกหน้าจอ
 */
export function ApprovalPanel({
  documentId, state, canEdit, canApprove,
}: {
  documentId: string;
  state: ApprovalState;
  canEdit: boolean;
  canApprove: boolean;
}) {
  const { dict: d, locale } = useI18n();
  const L = d.ui.approval;
  const router = useRouter();
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  const steps = state.steps || [];
  if (!state.required && steps.length === 0) return null;

  const roleName = (s: ApprovalStep) =>
    locale === 'en' ? s.role_name_en || s.role_name
    : locale === 'zh' ? s.role_name_zh || s.role_name
    : s.role_name;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setErr('');
      const res = await fn();
      if (!res.ok) { setErr(res.error || ''); return; }
      router.refresh();
    });

  return (
    <section className="card mt-5 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-ink-900">{L.panelTitle}</h2>
        {steps.length === 0 && (
          <span className="text-xxs text-ink-500">
            {L.requiredSteps.replace('{n}', String(state.required))}
          </span>
        )}
        {state.my_turn && (
          <span className="ml-auto chip bg-amber-50 text-amber-800 ring-amber-200">{L.myTurn}</span>
        )}
      </div>

      {err && <p className="border-b border-ink-100 bg-rose-50 px-5 py-2 text-xs text-rose-700">{err}</p>}

      {steps.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <p className="text-xs text-ink-600">
            {L.notSubmitted.replace('{n}', String(state.required))}
          </p>
          {canEdit && (
            <button className="btn-primary ml-auto" disabled={pending}
                    onClick={() => run(() => submitForApproval(documentId))}>
              {pending ? <ShdSpinner size={16} /> : <Send className="h-4 w-4" strokeWidth={1.8} />}
              {L.submit}
            </button>
          )}
        </div>
      ) : (
        <>
          <ol className="divide-y divide-ink-100">
            {steps.map((s) => (
              <li key={s.step_no} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-xs">
                {s.status === 'approved'
                  ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2} />
                  : s.status === 'rejected'
                    ? <XCircle className="h-4 w-4 shrink-0 text-rose-600" strokeWidth={2} />
                    : <Circle className="h-4 w-4 shrink-0 text-ink-300" strokeWidth={2} />}
                <span className="text-ink-400">{L.step} {s.step_no}</span>
                <span className="font-medium text-ink-800">{roleName(s)}</span>
                <span className={cn('chip',
                  s.status === 'approved' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                  : s.status === 'rejected' ? 'bg-rose-50 text-rose-700 ring-rose-200'
                  : 'bg-ink-100 text-ink-600 ring-ink-200')}>
                  {s.status === 'approved' ? L.approved : s.status === 'rejected' ? L.rejected : L.pending}
                </span>
                {s.decided_by && (
                  <span className="ml-auto text-xxs text-ink-400">
                    {L.decidedBy.replace('{name}', s.decided_by)}
                    {s.decided_at && ` · ${localeDate(s.decided_at, locale)}`}
                    {s.note && ` · ${s.note}`}
                  </span>
                )}
              </li>
            ))}
          </ol>

          {state.my_turn && canApprove && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-ink-200 bg-ink-50 px-5 py-3">
              <button
                className="btn-ghost text-rose-600 hover:bg-rose-50"
                disabled={pending}
                onClick={() => {
                  const note = window.prompt(L.rejectReason);
                  if (note === null) return;
                  run(() => decideApproval(documentId, false, note));
                }}
              >
                <XCircle className="h-4 w-4" strokeWidth={1.8} /> {L.reject}
              </button>
              <button className="btn-primary" disabled={pending}
                      onClick={() => run(() => decideApproval(documentId, true))}>
                {pending ? <ShdSpinner size={16} /> : <CheckCircle2 className="h-4 w-4" strokeWidth={1.8} />}
                {L.approve}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
