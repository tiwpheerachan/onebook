'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { useI18n } from '@/i18n/provider';
import { saveBudget, deleteBudget } from '@/actions/budget';

export interface BudgetRow {
  id: string;
  account_id: string;
  dimension_id: string | null;
  fiscal_year: number;
  month: number | null;
  amount: number;
  note: string | null;
}

export function BudgetEditor({
  row, accounts, dimensions, year, month, canEdit, canDelete,
}: {
  row?: BudgetRow;
  accounts: { id: string; label: string }[];
  dimensions: { id: string; label: string }[];
  year: number;
  month: number | null;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const { dict: d } = useI18n();
  const L = d.ui.budget;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    account_id: row?.account_id || '',
    dimension_id: row?.dimension_id || '',
    fiscal_year: row?.fiscal_year ?? year,
    month: row?.month ?? month ?? '',
    amount: row?.amount ?? 0,
    note: row?.note || '',
  });
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  if (!canEdit) return null;

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
          <div className="flex justify-between gap-2">
            {row && canDelete ? (
              <button
                className="btn-ghost text-rose-600 hover:bg-rose-50"
                disabled={pending}
                onClick={() => start(async () => {
                  const res = await deleteBudget(row.id);
                  if (!res.ok) { setErr(res.error || ''); return; }
                  setOpen(false); router.refresh();
                })}
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.8} /> {d.common.delete}
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={() => setOpen(false)}>{d.common.cancel}</button>
              <button className="btn-primary" disabled={pending}
                      onClick={() => start(async () => {
                        setErr('');
                        const res = await saveBudget({
                          id: row?.id,
                          account_id: form.account_id,
                          dimension_id: form.dimension_id || null,
                          fiscal_year: Number(form.fiscal_year),
                          month: form.month === '' ? null : Number(form.month),
                          amount: Number(form.amount),
                          note: form.note,
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
          <div className="sm:col-span-2">
            <label className="label">{L.account} *</label>
            {/* บัญชีเปลี่ยนไม่ได้หลังตั้งแล้ว เพราะจะกลายเป็นงบคนละช่อง ให้ลบแล้วตั้งใหม่แทน */}
            <select className="input text-xs" value={form.account_id} disabled={!!row}
                    onChange={(e) => set('account_id', e.target.value)}>
              <option value="">—</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{L.dimension}</label>
            <select className="input text-xs" value={form.dimension_id} disabled={!!row}
                    onChange={(e) => set('dimension_id', e.target.value)}>
              <option value="">{L.allDimensions}</option>
              {dimensions.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{L.amount} *</label>
            <input type="number" min={0} step="0.01" className="input num"
                   value={form.amount} onChange={(e) => set('amount', e.target.value)} />
          </div>
          <div>
            <label className="label">{L.year} *</label>
            <input type="number" className="input num" value={form.fiscal_year} disabled={!!row}
                   onChange={(e) => set('fiscal_year', e.target.value)} />
          </div>
          <div>
            <label className="label">{L.month}</label>
            <select className="input" value={form.month} disabled={!!row}
                    onChange={(e) => set('month', e.target.value)}>
              <option value="">{L.wholeYear}</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">{L.note}</label>
            <input className="input" value={form.note} onChange={(e) => set('note', e.target.value)} />
          </div>
        </div>
      </SlidePanel>
    </>
  );
}
