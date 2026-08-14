'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Link2, Link2Off, EyeOff } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { setLineMatch } from '@/actions/reconcile';

const fmt = (n: any) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ปุ่มจับคู่ / ยกเลิกจับคู่ / ข้าม สำหรับรายการ statement 1 บรรทัด */
export function BankMatchRow({
  line,
  candidates,
  labels,
}: {
  line: any;
  candidates: { id: string; label: string }[];
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const [pick, setPick] = useState('');
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  function run(status: 'matched' | 'unmatched' | 'ignored', paymentId?: string) {
    setErr('');
    start(async () => {
      const res = await setLineMatch({ line_id: line.id, status, payment_id: paymentId || null });
      if (!res.ok) { setErr(res.error || ''); return; }
      setPicking(false);
      setPick('');
      router.refresh();
    });
  }

  if (line.status === 'matched') {
    return (
      <div className="flex items-center justify-end gap-2">
        {line.match_score != null && (
          <span className="text-xxs text-ink-400">{Number(line.match_score).toFixed(0)}%</span>
        )}
        <button
          onClick={() => run('unmatched')}
          disabled={pending}
          title={labels.unmatch}
          className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
        >
          {pending ? <ShdSpinner size={16} /> : <Link2Off className="h-4 w-4" strokeWidth={1.8} />}
        </button>
      </div>
    );
  }

  if (line.status === 'ignored') {
    return (
      <button
        onClick={() => run('unmatched')}
        disabled={pending}
        className="text-xxs text-ink-400 underline-offset-2 hover:text-ink-700 hover:underline"
      >
        {labels.undo}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {err && <span className="text-xxs text-rose-600">{err}</span>}
      {picking ? (
        <div className="flex items-center gap-1.5">
          <select className="input h-8 max-w-[18rem] py-1 text-xs" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">— {labels.choosePayment} —</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          <button
            className="btn-primary h-8 px-2.5 py-1 text-xs"
            disabled={pending || !pick}
            onClick={() => run('matched', pick)}
          >
            {pending ? <ShdSpinner size={14} /> : labels.confirm}
          </button>
          <button className="btn-ghost h-8 px-2 py-1 text-xs" onClick={() => setPicking(false)}>×</button>
        </div>
      ) : (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => setPicking(true)}
            title={labels.match}
            className="rounded p-1 text-ink-400 hover:bg-brand-50 hover:text-brand-600"
          >
            <Link2 className="h-4 w-4" strokeWidth={1.8} />
          </button>
          <button
            onClick={() => run('ignored')}
            disabled={pending}
            title={labels.ignore}
            className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
          >
            <EyeOff className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>
      )}
    </div>
  );
}

/** ปุ่มสั่งจับคู่อัตโนมัติซ้ำ + ปิดกระทบยอด */
export function ReconcileActions({
  statementId,
  channelId,
  asOf,
  labels,
}: {
  statementId?: string;
  channelId: string;
  asOf: string;
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState('');
  const [pending, start] = useTransition();

  function rematch() {
    if (!statementId) return;
    setMsg('');
    start(async () => {
      const { autoMatch } = await import('@/actions/reconcile');
      const res = await autoMatch(statementId);
      setMsg(res.ok ? labels.matchedCount.replace('{n}', String(res.matched || 0)) : res.error || '');
      router.refresh();
    });
  }

  function close() {
    setMsg('');
    start(async () => {
      const { closeReconciliation } = await import('@/actions/reconcile');
      const res = await closeReconciliation({ channel_id: channelId, as_of: asOf });
      setMsg(res.ok ? `${labels.closed} · ${labels.difference} ${fmt(res.summary?.difference)}` : res.error || '');
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xxs text-ink-500">{msg}</span>}
      {statementId && (
        <button className="btn-secondary" disabled={pending} onClick={rematch}>
          {pending && <ShdSpinner size={16} />} {labels.autoMatch}
        </button>
      )}
      <button className="btn-secondary" disabled={pending} onClick={close}>
        {labels.closeRec}
      </button>
    </div>
  );
}
