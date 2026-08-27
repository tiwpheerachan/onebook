'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Warehouse, Plus, Pencil, ArrowLeftRight, Check, Star } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { saveWarehouse, transferStock } from '@/actions/inventory';
import type { Dictionary } from '@/i18n';

export interface WarehouseRow {
  id: string;
  code: string;
  name: string;
  address: string | null;
  is_default: boolean;
  is_active: boolean;
}

/** สร้างหรือแก้ไขคลัง */
export function WarehouseEditor({
  row, d, canEdit,
}: {
  row?: WarehouseRow;
  d: Dictionary;
  canEdit: boolean;
}) {
  const L = d.ui.warehouse;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: row?.code || '',
    name: row?.name || '',
    address: row?.address || '',
    is_default: row?.is_default || false,
    is_active: row?.is_active !== false,
  });
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  if (!canEdit) return null;

  const submit = () => {
    setErr('');
    start(async () => {
      const res = await saveWarehouse({ id: row?.id, ...form });
      if (!res.ok) { setErr(res.error || ''); return; }
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setErr(''); setOpen(true); }}
        className={row ? 'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ink-500 hover:bg-brand-50 hover:text-brand-700' : 'btn-secondary'}
      >
        {row
          ? <><Pencil className="h-3.5 w-3.5" strokeWidth={1.8} /> {d.common.edit}</>
          : <><Plus className="h-4 w-4 text-ink-400" strokeWidth={1.8} /> {L.add}</>}
      </button>

      <SlidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={row ? L.edit : L.add}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setOpen(false)}>{d.common.cancel}</button>
            <button className="btn-primary" disabled={pending} onClick={submit}>
              {pending && <ShdSpinner size={16} />} {L.save}
            </button>
          </div>
        }
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}

        <div className="space-y-4">
          <div>
            <label className="label">{L.code} *</label>
            <input
              className="input font-mono uppercase"
              placeholder="WH2"
              value={form.code}
              onChange={(e) => set('code', e.target.value)}
            />
          </div>
          <div>
            <label className="label">{L.name} *</label>
            <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div>
            <label className="label">{L.address}</label>
            <input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-300"
              checked={form.is_default}
              onChange={(e) => set('is_default', e.target.checked)}
            />
            {L.isDefault}
          </label>
          <p className="-mt-2 text-xxs text-ink-400">{L.defaultHint}</p>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-300"
              checked={form.is_active}
              onChange={(e) => set('is_active', e.target.checked)}
            />
            {L.active}
          </label>
        </div>
      </SlidePanel>
    </>
  );
}

/** โอนสินค้าระหว่างคลัง */
export function StockTransfer({
  warehouses, products, d, canEdit,
}: {
  warehouses: { id: string; label: string }[];
  products: { id: string; label: string }[];
  d: Dictionary;
  canEdit: boolean;
}) {
  const L = d.ui.warehouse;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    product_id: '', qty: '', from_id: '', to_id: '',
    date: new Date().toISOString().slice(0, 10), note: '',
  });
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const set = (k: string, v: string) => { setForm((f) => ({ ...f, [k]: v })); setDone(false); };

  if (!canEdit || warehouses.length < 2) return null;

  const submit = () => {
    setErr('');
    start(async () => {
      const res = await transferStock({ ...form, qty: Number(form.qty) });
      if (!res.ok) { setErr(res.error || ''); return; }
      setDone(true);
      setForm((f) => ({ ...f, qty: '', note: '' }));
      router.refresh();
    });
  };

  const ready = form.product_id && form.from_id && form.to_id && Number(form.qty) > 0;

  return (
    <>
      <button type="button" onClick={() => { setErr(''); setDone(false); setOpen(true); }} className="btn-secondary">
        <ArrowLeftRight className="h-4 w-4 text-ink-400" strokeWidth={1.8} /> {L.transfer}
      </button>

      <SlidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={L.transfer}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setOpen(false)}>{d.common.close}</button>
            <button className="btn-primary" disabled={pending || !ready} onClick={submit}>
              {pending && <ShdSpinner size={16} />} {L.transferDo}
            </button>
          </div>
        }
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}
        {done && (
          <p className="mb-4 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 ring-1 ring-inset ring-emerald-200">
            <Check className="h-3.5 w-3.5" strokeWidth={2.2} /> {L.transferred}
          </p>
        )}

        <p className="mb-4 rounded-lg bg-brand-50 px-3 py-2.5 text-xs leading-relaxed text-brand-800">
          {L.transferHint}
        </p>

        <div className="space-y-4">
          <div>
            <label className="label">{L.product} *</label>
            <select className="input" value={form.product_id} onChange={(e) => set('product_id', e.target.value)}>
              <option value="">—</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">{L.from} *</label>
              <select className="input" value={form.from_id} onChange={(e) => set('from_id', e.target.value)}>
                <option value="">—</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{L.to} *</label>
              <select className="input" value={form.to_id} onChange={(e) => set('to_id', e.target.value)}>
                <option value="">—</option>
                {warehouses.filter((w) => w.id !== form.from_id).map((w) => (
                  <option key={w.id} value={w.id}>{w.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">{L.qty} *</label>
              <input
                className="input"
                type="number"
                min="0"
                step="any"
                value={form.qty}
                onChange={(e) => set('qty', e.target.value)}
              />
            </div>
            <div>
              <label className="label">{d.common.date}</label>
              <input className="input" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
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

/** ป้ายคลังหลัก */
export function DefaultBadge({ on, label }: { on: boolean; label: string }) {
  if (!on) return null;
  return (
    <span className={cn('chip bg-amber-50 text-amber-700 ring-amber-200')}>
      <Star className="mr-1 h-3 w-3" strokeWidth={2} />{label}
    </span>
  );
}

export { Warehouse as WarehouseIcon };
