'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Play, X } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { useI18n } from '@/i18n/provider';
import { money } from '@/lib/format';
import {
  saveRecurring, deleteRecurring, saveAmortization, deleteAmortization, runRecurring,
} from '@/actions/recurring';

interface Opt { id: string; label: string }

export interface RecurringRow {
  id: string; name: string; description: string; book: string;
  frequency: string; day_of_month: number;
  start_date: string; end_date: string | null; next_date: string;
  auto_reverse: boolean; is_active: boolean;
  lines?: { account_id: string; description: string | null; debit: number; credit: number; dimension_id: string | null }[];
}

export function RecurringEditor({
  row, accounts, dimensions, canEdit,
}: {
  row?: RecurringRow;
  accounts: Opt[];
  dimensions: Opt[];
  canEdit: boolean;
}) {
  const { dict: d } = useI18n();
  const L = d.ui.recurring;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<any>({
    name: row?.name || '', description: row?.description || '',
    book: row?.book || 'GL', frequency: row?.frequency || 'monthly',
    day_of_month: row?.day_of_month ?? 1,
    start_date: row?.start_date || today,
    end_date: row?.end_date || '',
    auto_reverse: row?.auto_reverse || false,
    is_active: row?.is_active !== false,
  });
  const [lines, setLines] = useState(
    row?.lines?.length
      ? row.lines.map((l) => ({ ...l, description: l.description || '', dimension_id: l.dimension_id || '' }))
      : [{ account_id: '', description: '', debit: 0, credit: 0, dimension_id: '' },
         { account_id: '', description: '', debit: 0, credit: 0, dimension_id: '' }]
  );
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const setLine = (i: number, k: string, v: any) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  if (!canEdit) return null;
  const dr = lines.reduce((a, l) => a + (Number(l.debit) || 0), 0);
  const cr = lines.reduce((a, l) => a + (Number(l.credit) || 0), 0);

  return (
    <>
      <button type="button" onClick={() => { setErr(''); setOpen(true); }}
              aria-label={row ? L.edit : undefined}
              className={row ? 'rounded p-1 text-ink-400 hover:bg-brand-50 hover:text-brand-700' : 'btn-primary'}>
        {row ? <Pencil className="h-4 w-4" strokeWidth={1.8} />
             : <><Plus className="h-4 w-4" strokeWidth={2} /> {L.create}</>}
      </button>

      <SlidePanel
        open={open} onClose={() => setOpen(false)} title={row ? L.edit : L.create}
        footer={
          <div className="flex justify-between gap-2">
            {row ? (
              <button className="btn-ghost text-rose-600 hover:bg-rose-50" disabled={pending}
                      onClick={() => start(async () => {
                        const res = await deleteRecurring(row.id);
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
                        const res = await saveRecurring({ id: row?.id, ...form, lines });
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
            <label className="label">{L.name} *</label>
            <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">{L.description} *</label>
            <input className="input" value={form.description} onChange={(e) => set('description', e.target.value)} />
          </div>
          <div>
            <label className="label">{L.frequency}</label>
            <select className="input" value={form.frequency} onChange={(e) => set('frequency', e.target.value)}>
              <option value="monthly">{L.monthly}</option>
              <option value="quarterly">{L.quarterly}</option>
              <option value="yearly">{L.yearly}</option>
            </select>
          </div>
          <div>
            <label className="label">{L.dayOfMonth}</label>
            <input type="number" min={1} max={31} className="input num"
                   value={form.day_of_month} onChange={(e) => set('day_of_month', e.target.value)} />
            <p className="mt-1 text-xxs text-ink-400">{L.dayHint}</p>
          </div>
          <div>
            <label className="label">{L.startDate} *</label>
            <input type="date" className="input" value={form.start_date}
                   onChange={(e) => set('start_date', e.target.value)} />
          </div>
          <div>
            <label className="label">{L.endDate}</label>
            <input type="date" className="input" value={form.end_date}
                   onChange={(e) => set('end_date', e.target.value)} />
          </div>
        </div>

        <label className="mt-4 flex items-start gap-2 text-sm text-ink-700">
          <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-ink-300"
                 checked={form.auto_reverse} onChange={(e) => set('auto_reverse', e.target.checked)} />
          <span>
            {L.autoReverse}
            <span className="block text-xxs text-ink-400">{L.autoReverseHint}</span>
          </span>
        </label>

        <label className="mt-3 flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" className="h-4 w-4 rounded border-ink-300"
                 checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
          {L.active}
        </label>

        <p className="section-title mb-2 mt-6">{L.lines}</p>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_1.5rem] gap-2">
              <select className="input text-xs" value={l.account_id}
                      onChange={(e) => setLine(i, 'account_id', e.target.value)}>
                <option value="">—</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
              <input type="number" step="0.01" className="input num text-xs" placeholder={L.debit}
                     value={l.debit || ''} onChange={(e) => setLine(i, 'debit', e.target.value)} />
              <input type="number" step="0.01" className="input num text-xs" placeholder={L.credit}
                     value={l.credit || ''} onChange={(e) => setLine(i, 'credit', e.target.value)} />
              <button type="button" aria-label={L.removeLine}
                      className="rounded p-1 text-ink-300 hover:bg-rose-50 hover:text-rose-600"
                      onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                <X className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn-ghost mt-2 px-2 py-1 text-xs"
                onClick={() => setLines((ls) => [...ls, { account_id: '', description: '', debit: 0, credit: 0, dimension_id: '' }])}>
          <Plus className="h-3.5 w-3.5" strokeWidth={2} /> {L.addLine}
        </button>

        <p className="mt-3 flex justify-between rounded-lg bg-ink-50 px-3 py-2 text-xs tabular-nums">
          <span>{L.debit} {money(dr)}</span>
          <span className={dr !== cr ? 'font-medium text-rose-600' : 'text-ink-600'}>
            {L.credit} {money(cr)}
          </span>
        </p>
      </SlidePanel>
    </>
  );
}

export interface AmortRow {
  id: string; name: string;
  prepaid_account_id: string; expense_account_id: string; dimension_id: string | null;
  total_amount: number; months: number; start_date: string;
  posted_periods: number; is_active: boolean; note: string | null;
}

export function AmortEditor({
  row, accounts, dimensions, canEdit,
}: {
  row?: AmortRow; accounts: Opt[]; dimensions: Opt[]; canEdit: boolean;
}) {
  const { dict: d } = useI18n();
  const L = d.ui.recurring;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<any>({
    name: row?.name || '',
    prepaid_account_id: row?.prepaid_account_id || '',
    expense_account_id: row?.expense_account_id || '',
    dimension_id: row?.dimension_id || '',
    total_amount: row?.total_amount ?? 0,
    months: row?.months ?? 12,
    start_date: row?.start_date || today,
    is_active: row?.is_active !== false,
    note: row?.note || '',
  });
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  if (!canEdit) return null;
  const per = Number(form.months) > 0 ? Number(form.total_amount) / Number(form.months) : 0;

  return (
    <>
      <button type="button" onClick={() => { setErr(''); setOpen(true); }}
              aria-label={row ? L.amortEdit : undefined}
              className={row ? 'rounded p-1 text-ink-400 hover:bg-brand-50 hover:text-brand-700' : 'btn-secondary'}>
        {row ? <Pencil className="h-4 w-4" strokeWidth={1.8} />
             : <><Plus className="h-4 w-4" strokeWidth={2} /> {L.amortCreate}</>}
      </button>

      <SlidePanel
        open={open} onClose={() => setOpen(false)} title={row ? L.amortEdit : L.amortCreate}
        footer={
          <div className="flex justify-between gap-2">
            {row ? (
              <button className="btn-ghost text-rose-600 hover:bg-rose-50" disabled={pending}
                      onClick={() => start(async () => {
                        const res = await deleteAmortization(row.id);
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
                        const res = await saveAmortization({ id: row?.id, ...form });
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
            <label className="label">{L.amortName} *</label>
            <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">{L.prepaidAccount} *</label>
            <select className="input text-xs" value={form.prepaid_account_id}
                    onChange={(e) => set('prepaid_account_id', e.target.value)}>
              <option value="">—</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">{L.expenseAccount} *</label>
            <select className="input text-xs" value={form.expense_account_id}
                    onChange={(e) => set('expense_account_id', e.target.value)}>
              <option value="">—</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{L.totalAmount} *</label>
            <input type="number" step="0.01" min={0} className="input num"
                   value={form.total_amount} onChange={(e) => set('total_amount', e.target.value)} />
          </div>
          <div>
            <label className="label">{L.months} *</label>
            <input type="number" min={1} max={600} className="input num"
                   value={form.months} onChange={(e) => set('months', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">{L.startDate} *</label>
            <input type="date" className="input" value={form.start_date}
                   onChange={(e) => set('start_date', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">{d.common.notes}</label>
            <input className="input" value={form.note} onChange={(e) => set('note', e.target.value)} />
          </div>
        </div>

        <p className="mt-4 flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2.5 text-sm text-brand-800">
          <span>{L.perPeriod}</span>
          <b className="tabular-nums">{money(per)}</b>
        </p>
        <p className="mt-2 text-xxs leading-relaxed text-ink-400">{L.lastPeriodHint}</p>
      </SlidePanel>
    </>
  );
}

/** ปุ่มสร้างรายการที่ถึงกำหนด กดซ้ำได้โดยไม่เกิดรายการซ้ำ */
export function RunRecurringButton({ canRun }: { canRun: boolean }) {
  const { dict: d } = useI18n();
  const L = d.ui.recurring;
  const router = useRouter();
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  if (!canRun) return null;
  return (
    <span className="flex flex-wrap items-center gap-2">
      {msg && <span className="text-xs text-emerald-700">{msg}</span>}
      {err && <span className="text-xs text-rose-600">{err}</span>}
      <button className="btn-primary" disabled={pending}
              onClick={() => start(async () => {
                setErr(''); setMsg('');
                const res = await runRecurring();
                if (!res.ok) { setErr(res.error || ''); return; }
                const parts = [L.generated.replace('{n}', String(res.created))];
                if (res.skipped) parts.push(L.skipped.replace('{n}', String(res.skipped)));
                setMsg(parts.join(' · '));
                router.refresh();
              })}>
        {pending ? <ShdSpinner size={16} /> : <Play className="h-4 w-4" strokeWidth={1.8} />}
        {L.generate}
      </button>
    </span>
  );
}
