'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { saveProduct } from '@/actions/master';

const blank = {
  id: null as string | null, sku: '', name: '', name_en: '', name_zh: '', kind: 'good',
  unit: '', category: '', sale_price: 0, purchase_price: 0,
  vat_treatment: 'exclusive', track_inventory: true, tracking: 'none',
  income_account_id: '', expense_account_id: '', is_active: true,
};

export function ProductManager({
  canCreate, canEdit, editRow, accounts, labels,
}: { canCreate: boolean; canEdit: boolean; editRow?: any; accounts: { id: string; label: string }[]; labels: Record<string, string> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(blank);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  function submit() {
    setErr('');
    if (!form.sku || !form.name) { setErr(labels.required); return; }
    start(async () => {
      const res = await saveProduct(form);
      if (!res.ok) { setErr(res.error || ''); return; }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      {editRow ? (
        canEdit && (
          <button onClick={() => { setForm({ ...blank, ...editRow }); setOpen(true); }}
                  className="rounded p-1 text-ink-400 hover:bg-brand-50 hover:text-brand-600">
            <Pencil className="h-4 w-4" strokeWidth={1.8} />
          </button>
        )
      ) : (
        canCreate && (
          <button onClick={() => { setForm({ ...blank }); setOpen(true); }} className="btn-primary">
            <Plus className="h-4 w-4" /> {labels.create}
          </button>
        )
      )}

      <SlidePanel
        open={open} onClose={() => setOpen(false)} title={form.id ? labels.edit : labels.create}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setOpen(false)}>{labels.cancel}</button>
            <button className="btn-primary" disabled={pending} onClick={submit}>
              {pending && <ShdSpinner size={16} />} {labels.save}
            </button>
          </div>
        }
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}
        <div className="grid grid-cols-2 gap-4">
          <F label={`${labels.sku} *`}><input className="input" value={form.sku} onChange={(e) => set('sku', e.target.value)} /></F>
          <F label={labels.kind}>
            <select className="input" value={form.kind} onChange={(e) => set('kind', e.target.value)}>
              <option value="good">{labels.kindGood}</option>
              <option value="service">{labels.kindService}</option>
              <option value="asset">{labels.kindAsset}</option>
            </select>
          </F>
          <F label={`${labels.nameTh} *`} span><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></F>
          <F label={labels.nameEn}><input className="input" value={form.name_en || ''} onChange={(e) => set('name_en', e.target.value)} /></F>
          <F label={labels.nameZh}><input className="input" value={form.name_zh || ''} onChange={(e) => set('name_zh', e.target.value)} /></F>
          <F label={labels.unit}><input className="input" value={form.unit} onChange={(e) => set('unit', e.target.value)} /></F>
          <F label={labels.category}><input className="input" value={form.category || ''} onChange={(e) => set('category', e.target.value)} /></F>
          <F label={labels.salePrice}><input type="number" step="0.01" className="input num" value={form.sale_price} onChange={(e) => set('sale_price', e.target.value)} /></F>
          <F label={labels.purchasePrice}><input type="number" step="0.01" className="input num" value={form.purchase_price} onChange={(e) => set('purchase_price', e.target.value)} /></F>
          <F label={labels.vat}>
            <select className="input" value={form.vat_treatment} onChange={(e) => set('vat_treatment', e.target.value)}>
              <option value="exclusive">{labels.vatExclusive}</option>
              <option value="inclusive">{labels.vatInclusive}</option>
              <option value="zero_rated">{labels.vatZero}</option>
              <option value="exempt">{labels.vatExempt}</option>
              <option value="none">{labels.vatNone}</option>
            </select>
          </F>
          <F label={labels.trackStock}>
            <select className="input" value={form.track_inventory ? '1' : '0'} onChange={(e) => set('track_inventory', e.target.value === '1')}>
              <option value="1">{labels.yes}</option><option value="0">{labels.no}</option>
            </select>
          </F>
          {/* ตามรอยรายล็อตหรือรายชิ้นได้เฉพาะสินค้าที่ตัดสต๊อก */}
          {form.track_inventory && (
            <F label={labels.tracking}>
              <select className="input" value={form.tracking || 'none'}
                      onChange={(e) => set('tracking', e.target.value)}>
                <option value="none">{labels.trackNone}</option>
                <option value="lot">{labels.trackLot}</option>
                <option value="serial">{labels.trackSerial}</option>
              </select>
            </F>
          )}
          <F label={labels.incomeAccount} span>
            <select className="input" value={form.income_account_id || ''} onChange={(e) => set('income_account_id', e.target.value)}>
              <option value="">— {labels.auto} —</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </F>
          <F label={labels.expenseAccount} span>
            <select className="input" value={form.expense_account_id || ''} onChange={(e) => set('expense_account_id', e.target.value)}>
              <option value="">— {labels.auto} —</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </F>
        </div>
      </SlidePanel>
    </>
  );
}

function F({ label, children, span }: { label: string; children: React.ReactNode; span?: boolean }) {
  return <div className={span ? 'col-span-2' : ''}><label className="label">{label}</label>{children}</div>;
}
