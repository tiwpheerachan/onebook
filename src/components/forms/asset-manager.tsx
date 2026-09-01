'use client';
import { useState, useTransition } from 'react';
import { useI18n } from '@/i18n/provider';
import { useRouter } from 'next/navigation';
import { Plus, Pencil } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { saveAsset } from '@/actions/assets';

const blank = {
  id: null as string | null,
  code: '', name: '', name_en: '', category: '', serial_no: '', location: '',
  acquired_date: new Date().toISOString().slice(0, 10),
  in_service_date: '',
  cost: 0, salvage_value: 0, useful_life_months: 60,
  method: 'straight_line', declining_rate: 0, opening_accum_dep: 0,
  asset_account_id: '', accum_dep_account_id: '', expense_account_id: '',
  note: '',
};

export function AssetManager({
  canCreate, canEdit, editRow, accounts, labels,
}: {
  canCreate: boolean;
  canEdit: boolean;
  editRow?: any;
  accounts: { id: string; label: string }[];
  labels: Record<string, string>;
}) {
  const M = useI18n().dict.ui.misc;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(blank);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  function submit() {
    setErr('');
    start(async () => {
      const res = await saveAsset(form);
      if (!res.ok) { setErr(res.error || ''); return; }
      setOpen(false);
      router.refresh();
    });
  }

  // ค่าเสื่อมต่อเดือนแบบเส้นตรง ให้ผู้ใช้เห็นทันทีขณะกรอก
  const monthly =
    form.method === 'straight_line' && Number(form.useful_life_months) > 0
      ? (Number(form.cost || 0) - Number(form.salvage_value || 0)) / Number(form.useful_life_months)
      : null;

  return (
    <>
      {editRow ? (
        canEdit && (
          <button
            onClick={() => { setForm({ ...blank, ...editRow }); setOpen(true); }}
            className="rounded p-1 text-ink-400 hover:bg-brand-50 hover:text-brand-600"
          >
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
        open={open}
        onClose={() => setOpen(false)}
        title={form.id ? labels.edit : labels.create}
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
          <F label={`${labels.code} *`}><input className="input" value={form.code} onChange={(e) => set('code', e.target.value)} /></F>
          <F label={labels.category}><input className="input" value={form.category || ''} onChange={(e) => set('category', e.target.value)} /></F>
          <F label={`${labels.name} *`} span><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></F>
          <F label={labels.serialNo}><input className="input" value={form.serial_no || ''} onChange={(e) => set('serial_no', e.target.value)} /></F>
          <F label={labels.location}><input className="input" value={form.location || ''} onChange={(e) => set('location', e.target.value)} /></F>

          <F label={`${labels.acquiredDate} *`}>
            <input type="date" className="input" value={form.acquired_date || ''} onChange={(e) => set('acquired_date', e.target.value)} />
          </F>
          <F label={labels.inServiceDate}>
            <input type="date" className="input" value={form.in_service_date || ''} onChange={(e) => set('in_service_date', e.target.value)} />
          </F>

          <F label={`${labels.cost} *`}>
            <input type="number" step="0.01" className="input num" value={form.cost} onChange={(e) => set('cost', e.target.value)} />
          </F>
          <F label={labels.salvage}>
            <input type="number" step="0.01" className="input num" value={form.salvage_value} onChange={(e) => set('salvage_value', e.target.value)} />
          </F>

          <F label={labels.method}>
            <select className="input" value={form.method} onChange={(e) => set('method', e.target.value)}>
              <option value="straight_line">{labels.straightLine}</option>
              <option value="declining_balance">{labels.declining}</option>
              <option value="none">{labels.noDep}</option>
            </select>
          </F>
          <F label={labels.lifeMonths}>
            <input type="number" className="input num" value={form.useful_life_months} onChange={(e) => set('useful_life_months', e.target.value)} />
          </F>

          {form.method === 'declining_balance' && (
            <F label={labels.decliningRate} span>
              <input type="number" step="0.0001" className="input num" value={form.declining_rate}
                     onChange={(e) => set('declining_rate', e.target.value)} placeholder={M.decliningHint} />
            </F>
          )}

          <F label={labels.openingAccum} span>
            <input type="number" step="0.01" className="input num" value={form.opening_accum_dep}
                   onChange={(e) => set('opening_accum_dep', e.target.value)} />
          </F>

          <F label={`${labels.assetAccount} *`} span>
            <select className="input" value={form.asset_account_id || ''} onChange={(e) => set('asset_account_id', e.target.value)}>
              <option value="">—</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </F>
          <F label={`${labels.accumAccount} *`} span>
            <select className="input" value={form.accum_dep_account_id || ''} onChange={(e) => set('accum_dep_account_id', e.target.value)}>
              <option value="">—</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </F>
          <F label={labels.depExpenseAccount} span>
            <select className="input" value={form.expense_account_id || ''} onChange={(e) => set('expense_account_id', e.target.value)}>
              <option value="">— {labels.auto} —</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </F>

          <F label={labels.note} span><input className="input" value={form.note || ''} onChange={(e) => set('note', e.target.value)} /></F>
        </div>

        {monthly != null && monthly > 0 && (
          <p className="mt-4 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
            {labels.monthlyPreview}: {monthly.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        )}
      </SlidePanel>
    </>
  );
}

function F({ label, children, span }: { label: string; children: React.ReactNode; span?: boolean }) {
  return <div className={span ? 'col-span-2' : ''}><label className="label">{label}</label>{children}</div>;
}
