'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PackageMinus } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { disposeAsset } from '@/actions/assets';

const fmt = (n: any) =>
  Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function AssetDispose({
  asset, labels,
}: {
  asset: { id: string; code: string; name: string; book_value: number };
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    disposed_date: new Date().toISOString().slice(0, 10),
    proceeds: 0 as any,
    note: '',
  });
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  const gain = Number(form.proceeds || 0) - Number(asset.book_value || 0);

  function submit() {
    setErr('');
    start(async () => {
      const res = await disposeAsset({ asset_id: asset.id, ...form });
      if (!res.ok) { setErr(res.error || ''); return; }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={labels.dispose}
        className="rounded p-1 text-ink-400 hover:bg-rose-50 hover:text-rose-600"
      >
        <PackageMinus className="h-4 w-4" strokeWidth={1.8} />
      </button>

      <SlidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={`${labels.dispose} · ${asset.code}`}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setOpen(false)}>{labels.cancel}</button>
            <button className="btn-primary" disabled={pending} onClick={submit}>
              {pending && <ShdSpinner size={16} />} {labels.confirm}
            </button>
          </div>
        }
      >
        {err && (
          <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>
        )}

        <p className="mb-4 text-sm text-ink-700">{asset.name}</p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">{labels.disposedDate}</label>
            <input type="date" className="input" value={form.disposed_date}
                   onChange={(e) => setForm({ ...form, disposed_date: e.target.value })} />
          </div>
          <div>
            <label className="label">{labels.proceeds}</label>
            <input type="number" step="0.01" className="input num" value={form.proceeds}
                   onChange={(e) => setForm({ ...form, proceeds: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className="label">{labels.note}</label>
            <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
        </div>

        <dl className="mt-4 space-y-1.5 rounded-lg bg-ink-50 px-3 py-2.5 text-xs">
          <div className="flex justify-between">
            <dt className="text-ink-500">{labels.bookValue}</dt>
            <dd className="num font-medium text-ink-800">{fmt(asset.book_value)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-500">{gain >= 0 ? labels.gain : labels.loss}</dt>
            <dd className={`num font-semibold ${gain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmt(Math.abs(gain))}</dd>
          </div>
        </dl>
      </SlidePanel>
    </>
  );
}
