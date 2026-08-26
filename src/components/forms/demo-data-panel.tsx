'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Trash2, ShieldCheck, Check } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { seedDemoData, purgeDemoData } from '@/actions/settings';
import type { Dictionary } from '@/i18n';

/** สร้างและลบข้อมูลจำลอง — ปุ่มลบขอยืนยันก่อนเสมอ */
export function DemoDataPanel({
  status, d, canCreate, canDelete,
}: {
  status: { contacts: number; documents: number; seeded_at: string | null };
  d: Dictionary;
  canCreate: boolean;
  canDelete: boolean;
}) {
  const L = d.ui.demo;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [confirming, setConfirming] = useState(false);

  const has = status.contacts > 0 || status.documents > 0;

  const run = (fn: () => Promise<any>, done: (r: any) => string) => {
    setErr(''); setMsg('');
    start(async () => {
      const res = await fn();
      if (!res.ok) { setErr(res.error || ''); return; }
      setMsg(done(res));
      setConfirming(false);
      router.refresh();
    });
  };

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-brand-600" strokeWidth={1.8} />
        <h2 className="text-sm font-semibold text-ink-900">{L.title}</h2>
      </div>
      <p className="mt-0.5 text-xs text-ink-500">{L.subtitle}</p>

      <p className="mt-4 text-sm text-ink-800">
        {has
          ? L.has.replace('{c}', String(status.contacts)).replace('{d}', String(status.documents))
          : L.none}
      </p>
      {has && status.seeded_at && (
        <p className="mt-0.5 text-xxs text-ink-400">
          {L.seededAt} {new Date(status.seeded_at).toLocaleString()}
        </p>
      )}

      {!has && (
        <div className="mt-4 rounded-xl bg-ink-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{L.whatYouGet}</p>
          <ul className="mt-2 space-y-1.5">
            {[L.i1, L.i2, L.i3].map((x) => (
              <li key={x} className="text-xs leading-relaxed text-ink-700">• {x}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 flex items-start gap-1.5 rounded-lg bg-emerald-50 px-3 py-2.5 text-xs leading-relaxed text-emerald-900 ring-1 ring-inset ring-emerald-200">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
        {L.safety}
      </p>

      {err && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}
      {msg && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700">
          <Check className="h-3.5 w-3.5" strokeWidth={2.2} /> {msg}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {!has && canCreate && (
          <button
            className="btn-primary"
            disabled={pending}
            onClick={() => run(seedDemoData, (r) => L.created.replace('{n}', String(r.rows)))}
          >
            {pending ? <><ShdSpinner size={16} /> {L.creating}</> : <><Sparkles className="h-4 w-4" strokeWidth={1.8} /> {L.create}</>}
          </button>
        )}

        {has && canDelete && !confirming && (
          <button className="btn-secondary text-rose-600" disabled={pending} onClick={() => setConfirming(true)}>
            <Trash2 className="h-4 w-4" strokeWidth={1.8} /> {L.purge}
          </button>
        )}

        {has && canDelete && confirming && (
          <>
            <span className="self-center text-xs text-ink-700">{L.confirmPurge}</span>
            <button className="btn-secondary" disabled={pending} onClick={() => setConfirming(false)}>
              {d.common.cancel}
            </button>
            <button
              className="btn-primary bg-rose-600 hover:bg-rose-700"
              disabled={pending}
              onClick={() => run(purgeDemoData, () => L.purged)}
            >
              {pending ? <><ShdSpinner size={16} /> {L.purging}</> : <>{d.common.confirm}</>}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
