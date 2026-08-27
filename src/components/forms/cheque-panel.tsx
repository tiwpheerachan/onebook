'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Banknote, Check, XCircle, Plus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { saveCheque, clearCheque, bounceCheque } from '@/actions/cheques';
import type { Dictionary } from '@/i18n';

/** บันทึกเช็คใบใหม่ */
export function NewCheque({
  contacts, channels, d, canEdit,
}: {
  contacts: { id: string; label: string }[];
  channels: { id: string; label: string }[];
  d: Dictionary;
  canEdit: boolean;
}) {
  const L = d.ui.cheque;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    direction: 'receive' as 'receive' | 'pay',
    cheque_number: '', bank_name: '', cheque_date: '',
    due_date: new Date().toISOString().slice(0, 10),
    amount: '', contact_id: '', channel_id: channels[0]?.id || '', note: '',
  });
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  if (!canEdit) return null;

  const submit = () => {
    setErr('');
    start(async () => {
      const res = await saveCheque({ ...form, amount: Number(form.amount) });
      if (!res.ok) { setErr(res.error || ''); return; }
      setOpen(false);
      setForm((f) => ({ ...f, cheque_number: '', amount: '', note: '' }));
      router.refresh();
    });
  };

  return (
    <>
      <button type="button" onClick={() => { setErr(''); setOpen(true); }} className="btn-primary">
        <Plus className="h-4 w-4" strokeWidth={1.8} /> {L.add}
      </button>

      <SlidePanel
        open={open} onClose={() => setOpen(false)} title={L.add}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setOpen(false)}>{d.common.cancel}</button>
            <button className="btn-primary" disabled={pending || !form.cheque_number || !(Number(form.amount) > 0)} onClick={submit}>
              {pending && <ShdSpinner size={16} />} {d.common.save}
            </button>
          </div>
        }
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}

        <p className="mb-4 rounded-lg bg-brand-50 px-3 py-2.5 text-xs leading-relaxed text-brand-800">{L.warnHint}</p>

        <div className="space-y-4">
          <div>
            <label className="label">{L.direction}</label>
            <select className="input" value={form.direction} onChange={(e) => set('direction', e.target.value)}>
              <option value="receive">{L.dReceive}</option>
              <option value="pay">{L.dPay}</option>
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">{L.number} *</label>
              <input className="input font-mono" value={form.cheque_number} onChange={(e) => set('cheque_number', e.target.value)} />
            </div>
            <div>
              <label className="label">{L.bank}</label>
              <input className="input" value={form.bank_name} onChange={(e) => set('bank_name', e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">{L.chequeDate}</label>
              <input className="input" type="date" value={form.cheque_date} onChange={(e) => set('cheque_date', e.target.value)} />
            </div>
            <div>
              <label className="label">{L.dueDate} *</label>
              <input className="input" type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">{L.amount} *</label>
            <input className="input text-right" type="number" step="0.01" min="0"
              value={form.amount} onChange={(e) => set('amount', e.target.value)} />
          </div>
          <div>
            <label className="label">{L.contact}</label>
            <select className="input" value={form.contact_id} onChange={(e) => set('contact_id', e.target.value)}>
              <option value="">—</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{L.channel}</label>
            <select className="input" value={form.channel_id} onChange={(e) => set('channel_id', e.target.value)}>
              <option value="">—</option>
              {channels.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
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

/** ปุ่มขึ้นเงิน / แจ้งเช็คเด้ง */
export function ChequeActions({
  id, channels, d, canEdit,
}: {
  id: string;
  channels: { id: string; label: string }[];
  d: Dictionary;
  canEdit: boolean;
}) {
  const L = d.ui.cheque;
  const router = useRouter();
  const [mode, setMode] = useState<null | 'clear' | 'bounce'>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [channel, setChannel] = useState(channels[0]?.id || '');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  if (!canEdit) return null;

  const run = () => {
    setErr('');
    start(async () => {
      const res = mode === 'clear'
        ? await clearCheque(id, date, channel || undefined)
        : await bounceCheque(id, date, reason);
      if (!res.ok) { setErr(res.error || ''); return; }
      setMode(null); setReason('');
      router.refresh();
    });
  };

  return (
    <>
      <span className="flex items-center justify-end gap-1">
        <button
          onClick={() => { setErr(''); setMode('clear'); }}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-500 hover:bg-emerald-50 hover:text-emerald-700"
        >
          <Check className="h-3.5 w-3.5" strokeWidth={1.8} /> {L.clearDo}
        </button>
        <button
          onClick={() => { setErr(''); setMode('bounce'); }}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-500 hover:bg-rose-50 hover:text-rose-700"
        >
          <XCircle className="h-3.5 w-3.5" strokeWidth={1.8} /> {L.bounceDo}
        </button>
      </span>

      <SlidePanel
        open={mode !== null}
        onClose={() => setMode(null)}
        title={mode === 'clear' ? L.clearDo : L.bounceDo}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setMode(null)}>{d.common.cancel}</button>
            <button
              className={cn('btn-primary', mode === 'bounce' && 'bg-rose-600 hover:bg-rose-700')}
              disabled={pending || (mode === 'bounce' && !reason.trim())}
              onClick={run}
            >
              {pending && <ShdSpinner size={16} />} {d.common.confirm}
            </button>
          </div>
        }
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}
        {mode === 'bounce' && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200">
            {L.bounceHint}
          </p>
        )}

        <div className="space-y-4">
          <div>
            <label className="label">{d.common.date}</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {mode === 'clear' && (
            <div>
              <label className="label">{L.channel}</label>
              <select className="input" value={channel} onChange={(e) => setChannel(e.target.value)}>
                <option value="">—</option>
                {channels.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
          )}
          {mode === 'bounce' && (
            <div>
              <label className="label">{L.reason} *</label>
              <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}
        </div>
      </SlidePanel>
    </>
  );
}

export { Banknote as ChequeIcon };
