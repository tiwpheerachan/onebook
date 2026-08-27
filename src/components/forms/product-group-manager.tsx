'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Layers, Plus, Pencil, Wand2, Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { saveProductGroup, applyGroupAccounts } from '@/actions/master';
import type { Dictionary } from '@/i18n';

export interface GroupRow {
  id: string; code: string; name: string; note?: string | null;
  is_active: boolean;
  income_account_id?: string | null; expense_account_id?: string | null;
  inventory_account_id?: string | null; cogs_account_id?: string | null;
}

export function GroupEditor({
  row, accounts, d, canEdit,
}: {
  row?: GroupRow;
  accounts: { id: string; label: string }[];
  d: Dictionary;
  canEdit: boolean;
}) {
  const L = d.ui.pgroup;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: row?.code || '', name: row?.name || '', note: row?.note || '',
    income_account_id: row?.income_account_id || '',
    expense_account_id: row?.expense_account_id || '',
    inventory_account_id: row?.inventory_account_id || '',
    cogs_account_id: row?.cogs_account_id || '',
    is_active: row?.is_active !== false,
  });
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  if (!canEdit) return null;

  const submit = () => {
    setErr('');
    start(async () => {
      const res = await saveProductGroup({ id: row?.id, ...form });
      if (!res.ok) { setErr(res.error || ''); return; }
      setOpen(false);
      router.refresh();
    });
  };

  const Acc = ({ k, label }: { k: keyof typeof form; label: string }) => (
    <div>
      <label className="label">{label}</label>
      <select className="input" value={String(form[k] || '')} onChange={(e) => set(k as string, e.target.value)}>
        <option value="">—</option>
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
      </select>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => { setErr(''); setOpen(true); }}
        className={row
          ? 'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ink-500 hover:bg-brand-50 hover:text-brand-700'
          : 'btn-primary'}
      >
        {row
          ? <><Pencil className="h-3.5 w-3.5" strokeWidth={1.8} /> {d.common.edit}</>
          : <><Plus className="h-4 w-4" strokeWidth={1.8} /> {L.add}</>}
      </button>

      <SlidePanel
        open={open} onClose={() => setOpen(false)} title={row ? L.edit : L.add}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setOpen(false)}>{d.common.cancel}</button>
            <button className="btn-primary" disabled={pending} onClick={submit}>
              {pending && <ShdSpinner size={16} />} {d.common.save}
            </button>
          </div>
        }
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}

        <p className="mb-4 rounded-lg bg-brand-50 px-3 py-2.5 text-xs leading-relaxed text-brand-800">
          {L.templateHint}
        </p>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">{L.code} *</label>
              <input className="input font-mono uppercase" value={form.code} onChange={(e) => set('code', e.target.value)} />
            </div>
            <div>
              <label className="label">{L.name} *</label>
              <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
          </div>

          <Acc k="income_account_id" label={L.income} />
          <Acc k="cogs_account_id" label={L.cogs} />
          <Acc k="inventory_account_id" label={L.inventory} />
          <Acc k="expense_account_id" label={L.expense} />

          <div>
            <label className="label">{d.common.notes}</label>
            <input className="input" value={form.note} onChange={(e) => set('note', e.target.value)} />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-300"
              checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
            {d.common.yes}
          </label>
        </div>
      </SlidePanel>
    </>
  );
}

/** กดใช้ผังบัญชีของกลุ่มกับสินค้าทั้งกลุ่ม */
export function ApplyGroupAccounts({ groupId, d, canEdit }: { groupId: string; d: Dictionary; canEdit: boolean }) {
  const L = d.ui.pgroup;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [pending, start] = useTransition();

  if (!canEdit) return null;

  const run = () => {
    setErr(''); setMsg('');
    start(async () => {
      const res = await applyGroupAccounts(groupId, overwrite);
      if (!res.ok) { setErr(res.error || ''); return; }
      setMsg(L.applied.replace('{n}', String(res.updated)));
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setErr(''); setMsg(''); setOpen(true); }}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ink-500 hover:bg-brand-50 hover:text-brand-700"
      >
        <Wand2 className="h-3.5 w-3.5" strokeWidth={1.8} /> {L.apply}
      </button>

      <SlidePanel
        open={open} onClose={() => setOpen(false)} title={L.apply}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setOpen(false)}>{d.common.close}</button>
            <button className={cn('btn-primary', overwrite && 'bg-amber-600 hover:bg-amber-700')}
              disabled={pending} onClick={run}>
              {pending && <ShdSpinner size={16} />} {d.common.confirm}
            </button>
          </div>
        }
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}
        {msg && (
          <p className="mb-4 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 ring-1 ring-inset ring-emerald-200">
            <Check className="h-3.5 w-3.5" strokeWidth={2.2} /> {msg}
          </p>
        )}

        <div className="space-y-2">
          {[
            { v: false, label: L.applyFill },
            { v: true, label: L.applyOverwrite },
          ].map((o) => (
            <button key={String(o.v)} type="button" onClick={() => setOverwrite(o.v)}
              className={cn('flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition',
                overwrite === o.v ? 'border-brand-400 bg-brand-50 text-brand-800' : 'border-ink-200 text-ink-700 hover:bg-ink-50')}>
              {o.label}
            </button>
          ))}
        </div>

        {overwrite && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200">
            {L.applyAsk}
          </p>
        )}
      </SlidePanel>
    </>
  );
}

export { Layers as GroupIcon };
