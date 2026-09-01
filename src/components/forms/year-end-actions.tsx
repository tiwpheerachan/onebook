'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, RotateCcw } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { useI18n } from '@/i18n/provider';
import { money } from '@/lib/format';
import { closeFiscalYear, reopenFiscalYear } from '@/actions/year-end';

export function YearEndActions({
  year, closed, blocked, canClose, canReopen,
}: {
  year: number;
  closed: boolean;
  /** จำนวนรายการที่ยังไม่ผ่าน ถ้ามีจะปิดไม่ได้ */
  blocked: number;
  canClose: boolean;
  canReopen: boolean;
}) {
  const { dict: d } = useI18n();
  const L = d.ui.yearEnd;
  const router = useRouter();
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  return (
    <span className="flex flex-wrap items-center gap-2">
      {msg && <span className="text-xs text-emerald-700">{msg}</span>}
      {err && <span className="max-w-[22rem] text-right text-xs text-rose-600">{err}</span>}

      {!closed && canClose && (
        <button className="btn-primary" disabled={pending || blocked > 0}
                title={blocked > 0 ? L.hasDrafts.replace('{n}', String(blocked)) : undefined}
                onClick={() => {
                  if (!window.confirm(L.confirmClose.replace('{year}', String(year)))) return;
                  start(async () => {
                    setErr(''); setMsg('');
                    const res = await closeFiscalYear(year);
                    if (!res.ok) { setErr(res.error || ''); return; }
                    setMsg(L.closed.replace('{year}', String(year))
                             .replace('{amount}', money(res.netProfit)));
                    router.refresh();
                  });
                }}>
          {pending ? <ShdSpinner size={16} /> : <Lock className="h-4 w-4" strokeWidth={1.8} />}
          {L.close}
        </button>
      )}

      {closed && canReopen && (
        <button className="btn-secondary" disabled={pending}
                onClick={() => {
                  const reason = window.prompt(L.reopenReason);
                  if (!reason) return;
                  start(async () => {
                    setErr(''); setMsg('');
                    const res = await reopenFiscalYear(year, reason);
                    if (!res.ok) { setErr(res.error || ''); return; }
                    setMsg(L.reopened.replace('{year}', String(year)));
                    router.refresh();
                  });
                }}>
          {pending ? <ShdSpinner size={16} /> : <RotateCcw className="h-4 w-4 text-ink-400" strokeWidth={1.8} />}
          {L.reopen}
        </button>
      )}
    </span>
  );
}
