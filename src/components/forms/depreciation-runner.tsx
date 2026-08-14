'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, Check } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { runDepreciation } from '@/actions/assets';

const lastDayOfPrevMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 0).toISOString().slice(0, 10);
};

const fmt = (n: any) =>
  Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function DepreciationRunner({ labels }: { labels: Record<string, string> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [periodEnd, setPeriodEnd] = useState(lastDayOfPrevMonth());
  const [preview, setPreview] = useState<any>(null);
  const [done, setDone] = useState<any>(null);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  function calc() {
    setErr(''); setDone(null);
    start(async () => {
      const res = await runDepreciation(periodEnd, true);
      if (!res.ok) { setErr(res.error || ''); setPreview(null); return; }
      setPreview(res.result);
    });
  }

  function post() {
    setErr('');
    start(async () => {
      const res = await runDepreciation(periodEnd, false);
      if (!res.ok) { setErr(res.error || ''); return; }
      setDone(res.result);
      setPreview(null);
      router.refresh();
    });
  }

  return (
    <>
      <button className="btn-secondary" onClick={() => { setOpen(true); setPreview(null); setDone(null); setErr(''); }}>
        <CalendarClock className="h-4 w-4" strokeWidth={1.8} /> {labels.runDep}
      </button>

      <SlidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={labels.runDep}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setOpen(false)}>{labels.close}</button>
            <button className="btn-secondary" disabled={pending} onClick={calc}>
              {pending && <ShdSpinner size={16} />} {labels.calculate}
            </button>
            <button className="btn-primary" disabled={pending || !preview || preview.asset_count === 0} onClick={post}>
              {labels.postToJournal}
            </button>
          </div>
        }
      >
        {err && (
          <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>
        )}

        <div className="mb-4">
          <label className="label">{labels.periodEnd}</label>
          <input type="date" className="input" value={periodEnd} onChange={(e) => { setPeriodEnd(e.target.value); setPreview(null); setDone(null); }} />
          <p className="mt-1.5 text-xxs text-ink-400">{labels.periodHint}</p>
        </div>

        {done && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700 ring-1 ring-inset ring-emerald-200">
            <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
            <span>{labels.posted}: {done.asset_count} {labels.items} · {fmt(done.total_amount)}</span>
          </div>
        )}

        {preview && (
          preview.asset_count === 0 ? (
            <p className="rounded-lg bg-ink-50 px-3 py-2.5 text-xs text-ink-500">{labels.nothingToPost}</p>
          ) : (
            <>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="section-title">{labels.preview}</span>
                <span className="text-sm font-semibold text-ink-900">{fmt(preview.total_amount)}</span>
              </div>
              <div className="overflow-hidden rounded-lg border border-ink-200">
                <table className="w-full text-sm">
                  <thead className="bg-ink-50">
                    <tr>
                      <th className="th-cell">{labels.code}</th>
                      <th className="th-cell">{labels.name}</th>
                      <th className="th-cell num">{labels.amount}</th>
                      <th className="th-cell num">{labels.bookValue}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {(preview.items || []).map((it: any) => (
                      <tr key={it.asset_id}>
                        <td className="td-cell font-mono text-xxs">{it.code}</td>
                        <td className="td-cell">{it.name}</td>
                        <td className="td-cell num">{fmt(it.amount)}</td>
                        <td className="td-cell num text-ink-500">{fmt(it.book_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        )}
      </SlidePanel>
    </>
  );
}
