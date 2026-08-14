'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { SlidePanel } from './slide-panel';
import { SlidersHorizontal } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { adjustStock } from '@/actions/inventory';

const today = () => new Date().toISOString().slice(0, 10);

export function StockAdjust({
  products,
  presetProductId,
  labels,
}: {
  products: { id: string; label: string }[];
  presetProductId?: string;
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({
    product_id: presetProductId || '',
    move_date: today(),
    qty_delta: '',
    unit_cost: '',
    note: '',
  });
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  function submit() {
    setErr('');
    start(async () => {
      const res = await adjustStock(form);
      if (!res.ok) {
        setErr(res.error || '');
        return;
      }
      setOpen(false);
      setForm({ ...form, qty_delta: '', unit_cost: '', note: '' });
      router.refresh();
    });
  }

  const qty = Number(form.qty_delta);

  return (
    <>
      <button className="btn-secondary" onClick={() => setOpen(true)}>
        <SlidersHorizontal className="h-4 w-4" strokeWidth={1.8} /> {labels.adjust}
      </button>

      <SlidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={labels.adjust}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setOpen(false)}>{labels.cancel}</button>
            <button className="btn-primary" disabled={pending} onClick={submit}>
              {pending && <ShdSpinner size={16} />} {labels.save}
            </button>
          </div>
        }
      >
        {err && (
          <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">{labels.product} *</label>
            <select className="input" value={form.product_id} onChange={(e) => set('product_id', e.target.value)}>
              <option value="">—</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{labels.date}</label>
            <input type="date" className="input" value={form.move_date} onChange={(e) => set('move_date', e.target.value)} />
          </div>
          <div>
            <label className="label">{labels.qtyDelta} *</label>
            <input
              type="number" step="0.0001" className="input num" value={form.qty_delta}
              onChange={(e) => set('qty_delta', e.target.value)} placeholder="+10 / -3"
            />
          </div>
          {qty > 0 && (
            <div className="col-span-2">
              <label className="label">{labels.unitCost}</label>
              <input
                type="number" step="0.0001" className="input num" value={form.unit_cost}
                onChange={(e) => set('unit_cost', e.target.value)} placeholder={labels.unitCostHint}
              />
            </div>
          )}
          <div className="col-span-2">
            <label className="label">{labels.note}</label>
            <input className="input" value={form.note} onChange={(e) => set('note', e.target.value)} />
          </div>
        </div>

        <p className="mt-4 rounded-lg bg-ink-50 px-3 py-2 text-xxs leading-relaxed text-ink-500">
          {labels.adjustHint}
        </p>
      </SlidePanel>
    </>
  );
}
