'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { useI18n } from '@/i18n/provider';
import { saveApprovalRule, deleteApprovalRule } from '@/actions/approval';
import { SALES_KINDS, PURCHASE_KINDS, SLUG_BY_KIND } from '@/lib/constants';
import { docTitle } from '@/components/documents/doc-meta';

export interface RuleRow {
  id: string;
  doc_kind: string | null;
  min_amount: number;
  max_amount: number | null;
  step_no: number;
  role_id: string;
  is_active: boolean;
  note: string | null;
}

export function ApprovalRuleEditor({
  row, roles, canEdit,
}: {
  row?: RuleRow;
  roles: { id: string; label: string }[];
  canEdit: boolean;
}) {
  const { dict: d } = useI18n();
  const L = d.ui.approval;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    doc_kind: row?.doc_kind || '',
    min_amount: row?.min_amount ?? 0,
    max_amount: row?.max_amount ?? '',
    step_no: row?.step_no ?? 1,
    role_id: row?.role_id || '',
    is_active: row?.is_active !== false,
    note: row?.note || '',
  });
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  if (!canEdit) return null;
  const kinds = [...SALES_KINDS, ...PURCHASE_KINDS];

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
            {row ? (
              <button className="btn-ghost text-rose-600 hover:bg-rose-50" disabled={pending}
                      onClick={() => start(async () => {
                        const res = await deleteApprovalRule(row.id);
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
                        const res = await saveApprovalRule({
                          id: row?.id,
                          doc_kind: form.doc_kind || null,
                          min_amount: Number(form.min_amount),
                          max_amount: form.max_amount === '' ? null : Number(form.max_amount),
                          step_no: Number(form.step_no),
                          role_id: form.role_id,
                          is_active: form.is_active,
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
            <label className="label">{L.docKind}</label>
            <select className="input text-xs" value={form.doc_kind}
                    onChange={(e) => set('doc_kind', e.target.value)}>
              <option value="">{L.anyKind}</option>
              {kinds.map((k) => (
                <option key={k} value={k}>{docTitle(d, SLUG_BY_KIND[k])}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{L.minAmount}</label>
            <input type="number" min={0} step="0.01" className="input num"
                   value={form.min_amount} onChange={(e) => set('min_amount', e.target.value)} />
          </div>
          <div>
            <label className="label">{L.maxAmount}</label>
            <input type="number" min={0} step="0.01" className="input num" placeholder={L.noLimit}
                   value={form.max_amount} onChange={(e) => set('max_amount', e.target.value)} />
          </div>
          <div>
            <label className="label">{L.step} *</label>
            <select className="input" value={form.step_no} onChange={(e) => set('step_no', e.target.value)}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{L.role} *</label>
            <select className="input text-xs" value={form.role_id}
                    onChange={(e) => set('role_id', e.target.value)}>
              <option value="">—</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">{L.note}</label>
            <input className="input" value={form.note} onChange={(e) => set('note', e.target.value)} />
          </div>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" className="h-4 w-4 rounded border-ink-300"
                 checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
          {L.active}
        </label>

        <p className="mt-4 text-xxs leading-relaxed text-ink-400">{L.amountHint}</p>
        <p className="mt-1 text-xxs leading-relaxed text-ink-400">{L.ruleHint}</p>
      </SlidePanel>
    </>
  );
}
