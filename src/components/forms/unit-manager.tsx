'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Lock } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { useI18n } from '@/i18n/provider';
import { money } from '@/lib/format';
import { saveProductUnit, deleteProductUnit } from '@/actions/units';

export interface UnitRow {
  id: string;
  code: string;
  factor: number;
  barcode: string | null;
  sale_price: number | null;
  is_base: boolean;
}

export function UnitManager({
  productId, units, baseCode, canEdit,
}: {
  productId: string;
  units: UnitRow[];
  baseCode: string;
  canEdit: boolean;
}) {
  const { dict: d } = useI18n();
  const L = d.ui.unitMgr;
  const packs = units.filter((u) => !u.is_base);

  return (
    <section className="card mt-5 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-ink-900">{L.title}</h2>
        <span className="text-xxs text-ink-400">{L.subtitle}</span>
        <span className="ml-auto">
          <UnitEditor productId={productId} baseCode={baseCode} canEdit={canEdit} />
        </span>
      </div>

      <ul className="divide-y divide-ink-100">
        {/* หน่วยฐานแสดงไว้ให้เห็นเสมอ แต่แก้ที่นี่ไม่ได้ */}
        <li className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
          <Lock className="h-3.5 w-3.5 shrink-0 text-ink-300" strokeWidth={2} />
          <span className="font-medium text-ink-800">{baseCode}</span>
          <span className="chip bg-ink-100 text-ink-600 ring-ink-200">{L.base}</span>
          <span className="ml-auto text-xxs text-ink-400">{L.baseLocked}</span>
        </li>

        {packs.length === 0 && (
          <li className="px-5 py-4 text-xs text-ink-400">{L.empty}</li>
        )}
        {packs.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
            <span className="font-medium text-ink-800">{u.code}</span>
            <span className="text-xs text-ink-500">
              {L.equals.replace('{unit}', u.code)
                       .replace('{n}', String(Number(u.factor)))
                       .replace('{base}', baseCode)}
            </span>
            {u.barcode && <span className="font-mono text-xxs text-ink-400">{u.barcode}</span>}
            {u.sale_price != null && (
              <span className="text-xxs text-ink-500">{money(u.sale_price)}</span>
            )}
            <span className="ml-auto">
              <UnitEditor productId={productId} row={u} baseCode={baseCode} canEdit={canEdit} />
            </span>
          </li>
        ))}
      </ul>

      {canEdit && <p className="border-t border-ink-100 px-5 py-2.5 text-xxs leading-relaxed text-ink-400">{L.factorHint}</p>}
    </section>
  );
}

function UnitEditor({
  productId, row, baseCode, canEdit,
}: {
  productId: string; row?: UnitRow; baseCode: string; canEdit: boolean;
}) {
  const { dict: d } = useI18n();
  const L = d.ui.unitMgr;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: row?.code || '',
    factor: row?.factor ?? 1,
    barcode: row?.barcode || '',
    sale_price: row?.sale_price ?? '',
  });
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  if (!canEdit) return null;

  return (
    <>
      <button type="button" onClick={() => { setErr(''); setOpen(true); }}
              aria-label={row ? L.edit : undefined}
              className={row ? 'rounded p-1 text-ink-400 hover:bg-brand-50 hover:text-brand-700'
                             : 'btn-secondary px-2 py-1 text-xs'}>
        {row ? <Pencil className="h-4 w-4" strokeWidth={1.8} />
             : <><Plus className="h-3.5 w-3.5" strokeWidth={2} /> {L.add}</>}
      </button>

      <SlidePanel
        open={open} onClose={() => setOpen(false)} title={row ? L.edit : L.add}
        footer={
          <div className="flex justify-between gap-2">
            {row ? (
              <button className="btn-ghost text-rose-600 hover:bg-rose-50" disabled={pending}
                      onClick={() => start(async () => {
                        const res = await deleteProductUnit(row.id, productId);
                        if (!res.ok) { setErr(res.error || ''); return; }
                        setOpen(false); router.refresh();
                      })}>
                <Trash2 className="h-4 w-4" strokeWidth={1.8} /> {d.common.delete}
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={() => setOpen(false)}>{d.common.cancel}</button>
              <button className="btn-primary" disabled={pending}
                      onClick={() => start(async () => {
                        setErr('');
                        const res = await saveProductUnit({
                          id: row?.id, product_id: productId,
                          code: form.code, factor: Number(form.factor),
                          barcode: form.barcode,
                          sale_price: form.sale_price === '' ? null : Number(form.sale_price),
                        });
                        if (!res.ok) { setErr(res.error || ''); return; }
                        setOpen(false); router.refresh();
                      })}>
                {pending && <ShdSpinner size={16} />} {d.common.save}
              </button>
            </div>
          </div>
        }
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">{L.code} *</label>
            <input className="input" value={form.code} onChange={(e) => set('code', e.target.value)} />
          </div>
          <div>
            <label className="label">{L.factor} *</label>
            <input type="number" min={0} step="0.000001" className="input num"
                   value={form.factor} onChange={(e) => set('factor', e.target.value)} />
          </div>
          <div>
            <label className="label">{L.barcode}</label>
            <input className="input font-mono" value={form.barcode}
                   onChange={(e) => set('barcode', e.target.value)} />
          </div>
          <div>
            <label className="label">{L.salePrice}</label>
            <input type="number" step="0.01" className="input num" value={form.sale_price}
                   onChange={(e) => set('sale_price', e.target.value)} />
          </div>
        </div>

        <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2.5 text-sm text-brand-800">
          {L.equals.replace('{unit}', form.code || '—')
                   .replace('{n}', String(Number(form.factor) || 0))
                   .replace('{base}', baseCode)}
        </p>
        <p className="mt-2 text-xxs leading-relaxed text-ink-400">{L.salePriceHint}</p>
      </SlidePanel>
    </>
  );
}
