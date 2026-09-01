'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Lock } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { saveAccount } from '@/actions/master';
import type { Dictionary } from '@/i18n';

export interface AccountRow {
  id: string; code: string;
  name_th: string; name_en: string | null; name_zh: string | null;
  type: string; parent_code: string | null;
  is_header: boolean; normal_side: string; is_active: boolean;
  system_key: string | null;
}

const TYPES = [
  'asset', 'liability', 'equity', 'revenue', 'cost_of_sales',
  'expense', 'other_income', 'other_expense', 'tax',
] as const;

/** หมวดบัญชีกำหนดด้านปกติเสมอ ให้ระบบเลือกให้แทนที่จะปล่อยคนเลือกผิด */
const SIDE_BY_TYPE: Record<string, 'D' | 'C'> = {
  asset: 'D', liability: 'C', equity: 'C', revenue: 'C', cost_of_sales: 'D',
  expense: 'D', other_income: 'C', other_expense: 'D', tax: 'D',
};

export function AccountEditor({
  row, parents, d, canEdit,
}: {
  row?: AccountRow;
  parents: { code: string; label: string }[];
  d: Dictionary;
  canEdit: boolean;
}) {
  const L = d.ui.coa;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: row?.code || '', name_th: row?.name_th || '',
    name_en: row?.name_en || '', name_zh: row?.name_zh || '',
    type: row?.type || 'expense',
    parent_code: row?.parent_code || '',
    is_header: row?.is_header || false,
    normal_side: row?.normal_side || 'D',
    is_active: row?.is_active !== false,
  });
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  if (!canEdit) return null;
  const locked = !!row?.system_key;

  const typeLabel: Record<string, string> = {
    asset: L.typeAsset, liability: L.typeLiability, equity: L.typeEquity,
    revenue: L.typeRevenue, cost_of_sales: L.typeCostOfSales, expense: L.typeExpense,
    other_income: L.typeOtherIncome, other_expense: L.typeOtherExpense, tax: L.typeTax,
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setErr(''); setOpen(true); }}
        aria-label={row ? L.edit : undefined}
        className={row ? 'rounded p-1 text-ink-400 hover:bg-brand-50 hover:text-brand-700' : 'btn-primary'}
      >
        {row
          ? <Pencil className="h-4 w-4" strokeWidth={1.8} />
          : <><Plus className="h-4 w-4" strokeWidth={2} /> {L.create}</>}
      </button>

      <SlidePanel
        open={open} onClose={() => setOpen(false)} title={row ? L.edit : L.create}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setOpen(false)}>{d.common.cancel}</button>
            <button className="btn-primary" disabled={pending}
                    onClick={() => start(async () => {
                      setErr('');
                      const res = await saveAccount({ id: row?.id, ...form });
                      if (!res.ok) { setErr(res.error || ''); return; }
                      setOpen(false); router.refresh();
                    })}>
              {pending && <ShdSpinner size={16} />} {d.common.save}
            </button>
          </div>
        }
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}

        {locked && (
          <p className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            <span>{L.systemLocked} — <span className="font-mono">{row?.system_key}</span></span>
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">{L.code} *</label>
            {/* รหัสของบัญชีระบบเปลี่ยนไม่ได้ เพราะ app.acc() ใช้อ้างอิงตอนลงบัญชี */}
            <input className="input font-mono" value={form.code} disabled={locked}
                   onChange={(e) => set('code', e.target.value)} />
          </div>
          <div>
            <label className="label">{L.type} *</label>
            <select className="input" value={form.type} disabled={locked}
                    onChange={(e) => setForm((f) => ({
                      ...f, type: e.target.value,
                      // หมวดบัญชีกำหนดด้านปกติเสมอ ตั้งให้อัตโนมัติกันเลือกผิด
                      normal_side: SIDE_BY_TYPE[e.target.value] || 'D',
                    }))}>
              {TYPES.map((x) => <option key={x} value={x}>{typeLabel[x]}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">{L.name} *</label>
            <input className="input" value={form.name_th} onChange={(e) => set('name_th', e.target.value)} />
          </div>
          <div>
            <label className="label">{L.nameEn}</label>
            <input className="input" value={form.name_en} onChange={(e) => set('name_en', e.target.value)} />
          </div>
          <div>
            <label className="label">{L.nameZh}</label>
            <input className="input" value={form.name_zh} onChange={(e) => set('name_zh', e.target.value)} />
          </div>
          <div>
            <label className="label">{L.parent}</label>
            <select className="input text-xs" value={form.parent_code}
                    onChange={(e) => set('parent_code', e.target.value)}>
              <option value="">—</option>
              {parents.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{L.normalSide}</label>
            <select className="input" value={form.normal_side} disabled={locked}
                    onChange={(e) => set('normal_side', e.target.value)}>
              <option value="D">{L.debit}</option>
              <option value="C">{L.credit}</option>
            </select>
          </div>
        </div>

        <label className="mt-4 flex items-start gap-2 text-sm text-ink-700">
          <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-ink-300"
                 checked={form.is_header} disabled={locked}
                 onChange={(e) => set('is_header', e.target.checked)} />
          <span>
            {L.isHeader}
            <span className="block text-xxs text-ink-400">{L.headerHint}</span>
          </span>
        </label>

        <label className="mt-3 flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" className="h-4 w-4 rounded border-ink-300"
                 checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
          {L.active}
        </label>
      </SlidePanel>
    </>
  );
}
