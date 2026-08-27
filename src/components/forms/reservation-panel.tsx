'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bookmark, Check, X } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { reserveStock, releaseReservation } from '@/actions/inventory';
import type { Dictionary } from '@/i18n';

export function NewReservation({
  products, warehouses, d, canEdit,
}: {
  products: { id: string; label: string }[];
  warehouses: { id: string; label: string }[];
  d: Dictionary;
  canEdit: boolean;
}) {
  const L = d.ui.reserve;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    product_id: '', warehouse_id: warehouses[0]?.id || '', qty: '',
    expires_at: '', note: '',
  });
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  if (!canEdit) return null;

  const submit = () => {
    setErr('');
    start(async () => {
      const res = await reserveStock({ ...form, qty: Number(form.qty) });
      if (!res.ok) { setErr(res.error || ''); return; }
      setOpen(false);
      setForm((f) => ({ ...f, qty: '', note: '' }));
      router.refresh();
    });
  };

  return (
    <>
      <button type="button" onClick={() => { setErr(''); setOpen(true); }} className="btn-primary">
        <Bookmark className="h-4 w-4" strokeWidth={1.8} /> {L.add}
      </button>

      <SlidePanel
        open={open} onClose={() => setOpen(false)} title={L.add}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setOpen(false)}>{d.common.cancel}</button>
            <button className="btn-primary"
              disabled={pending || !form.product_id || !form.warehouse_id || !(Number(form.qty) > 0)}
              onClick={submit}>
              {pending && <ShdSpinner size={16} />} {d.common.save}
            </button>
          </div>
        }
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}
        <p className="mb-4 rounded-lg bg-brand-50 px-3 py-2.5 text-xs leading-relaxed text-brand-800">{L.hint}</p>

        <div className="space-y-4">
          <div>
            <label className="label">{L.product} *</label>
            <select className="input" value={form.product_id} onChange={(e) => set('product_id', e.target.value)}>
              <option value="">—</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{L.warehouse} *</label>
            <select className="input" value={form.warehouse_id} onChange={(e) => set('warehouse_id', e.target.value)}>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">{L.qty} *</label>
              <input className="input text-right" type="number" step="any" min="0"
                value={form.qty} onChange={(e) => set('qty', e.target.value)} />
            </div>
            <div>
              <label className="label">{L.expires}</label>
              <input className="input" type="date" value={form.expires_at}
                onChange={(e) => set('expires_at', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">{d.common.notes}</label>
            <input className="input" value={form.note} onChange={(e) => set('note', e.target.value)} />
          </div>
        </div>
      </SlidePanel>
    </>
  );
}

export function ReleaseButtons({ id, d, canEdit }: { id: string; d: Dictionary; canEdit: boolean }) {
  const L = d.ui.reserve;
  const router = useRouter();
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  if (!canEdit) return null;

  const run = (fulfilled: boolean) => {
    setErr('');
    start(async () => {
      const res = await releaseReservation(id, fulfilled);
      if (!res.ok) { setErr(res.error || ''); return; }
      router.refresh();
    });
  };

  return (
    <span className="flex items-center justify-end gap-1">
      {err && <span className="text-xxs text-rose-600">{err}</span>}
      <button disabled={pending} onClick={() => run(true)}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-500 hover:bg-emerald-50 hover:text-emerald-700">
        <Check className="h-3.5 w-3.5" strokeWidth={1.8} /> {L.fulfilled}
      </button>
      <button disabled={pending} onClick={() => run(false)}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-500 hover:bg-ink-100">
        <X className="h-3.5 w-3.5" strokeWidth={1.8} /> {L.release}
      </button>
    </span>
  );
}
