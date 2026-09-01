'use client';
import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, RotateCcw } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { saveJournalEntry, reverseJournalEntry } from '@/actions/journal';
import { money } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { Dictionary } from '@/i18n';

interface Option { id: string; label: string }

interface Line {
  key: string;
  account_id: string;
  description: string;
  debit: number | string;
  credit: number | string;
  dimension_id: string;
}

const blankLine = (): Line => ({
  key: Math.random().toString(36).slice(2),
  account_id: '', description: '', debit: '', credit: '', dimension_id: '',
});

export function JournalEntryForm({
  accounts, dimensions, d, canCreate, canPost,
}: {
  accounts: Option[];
  dimensions: Option[];
  d: Dictionary;
  canCreate: boolean;
  canPost: boolean;
}) {
  const L = d.ui.journalEntry;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');

  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [book, setBook] = useState<'GL' | 'ADJ'>('GL');
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<Line[]>([blankLine(), blankLine()]);

  const totals = useMemo(() => {
    const debit = lines.reduce((a, l) => a + (Number(l.debit) || 0), 0);
    const credit = lines.reduce((a, l) => a + (Number(l.credit) || 0), 0);
    return { debit, credit, diff: Math.round((debit - credit) * 100) / 100 };
  }, [lines]);

  if (!canCreate) return null;

  const update = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const reset = () => {
    setDescription(''); setLines([blankLine(), blankLine()]); setErr('');
    setEntryDate(new Date().toISOString().slice(0, 10)); setBook('GL');
  };

  const submit = (post: boolean) => {
    setErr('');
    start(async () => {
      const res = await saveJournalEntry({
        entry_date: entryDate, book, description,
        lines: lines.map((l) => ({
          account_id: l.account_id || null,
          description: l.description || null,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          dimension_id: l.dimension_id || null,
        })),
        post,
      });
      if (!res.ok) { setErr(res.error || ''); return; }
      setOpen(false); reset(); router.refresh();
    });
  };

  return (
    <>
      <button type="button" className="btn-primary" onClick={() => { reset(); setOpen(true); }}>
        <Plus className="h-4 w-4" strokeWidth={2} /> {L.create}
      </button>

      <SlidePanel
        open={open} onClose={() => setOpen(false)} title={L.create}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className={cn('text-sm font-medium',
              totals.diff === 0 && totals.debit > 0 ? 'text-emerald-700' : 'text-amber-700')}>
              {totals.diff === 0 && totals.debit > 0
                ? L.balanced
                : `${L.difference} ${money(totals.diff)}`}
            </span>
            <span className="flex flex-wrap gap-2">
              <button className="btn-secondary" onClick={() => setOpen(false)}>{d.common.cancel}</button>
              <button className="btn-secondary" disabled={pending} onClick={() => submit(false)}>
                {L.saveDraft}
              </button>
              {canPost && (
                <button className="btn-primary"
                        disabled={pending || totals.diff !== 0 || totals.debit <= 0 || !description.trim()}
                        onClick={() => submit(true)}>
                  {pending && <ShdSpinner size={16} />} {L.savePost}
                </button>
              )}
            </span>
          </div>
        }
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}
        <p className="mb-4 rounded-lg bg-brand-50 px-3 py-2.5 text-xs leading-relaxed text-brand-800">{L.hint}</p>

        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className="label">{L.entryDate} *</label>
            <input type="date" className="input" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
          </div>
          <div>
            <label className="label">{L.book}</label>
            <select className="input" value={book} onChange={(e) => setBook(e.target.value as 'GL' | 'ADJ')}>
              <option value="GL">{L.bookGL}</option>
              <option value="ADJ">{L.bookADJ}</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">{L.description} *</label>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <p className="section-title">{L.account}</p>
          {lines.map((l, i) => (
            <div key={l.key} className="grid grid-cols-1 gap-2 rounded-lg border border-ink-200 p-2.5 sm:grid-cols-12">
              <div className="sm:col-span-5">
                <select className="input text-xs" value={l.account_id}
                        onChange={(e) => update(i, { account_id: e.target.value })}>
                  <option value="">— {L.account} —</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </div>
              <div className="sm:col-span-3">
                <input className="input text-xs" placeholder={L.lineNote} value={l.description}
                       onChange={(e) => update(i, { description: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                {/* กรอกข้างหนึ่งแล้วล้างอีกข้างให้เอง กันบรรทัดที่มีทั้งเดบิตและเครดิต */}
                <input type="number" step="0.01" className="input num text-xs" placeholder={L.debit}
                       value={l.debit}
                       onChange={(e) => update(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} />
              </div>
              <div className="sm:col-span-2">
                <input type="number" step="0.01" className="input num text-xs" placeholder={L.credit}
                       value={l.credit}
                       onChange={(e) => update(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} />
              </div>
              {dimensions.length > 0 && (
                <div className="sm:col-span-10">
                  <select className="input text-xs" value={l.dimension_id}
                          onChange={(e) => update(i, { dimension_id: e.target.value })}>
                    <option value="">— {L.dimension} —</option>
                    {dimensions.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                  </select>
                </div>
              )}
              <div className={cn('flex items-center justify-end', dimensions.length > 0 ? 'sm:col-span-2' : 'sm:col-span-12')}>
                {lines.length > 2 && (
                  <button type="button" aria-label={L.removeLine}
                          onClick={() => setLines(lines.filter((_, x) => x !== i))}
                          className="rounded p-1 text-ink-400 hover:bg-rose-50 hover:text-rose-600">
                    <Trash2 className="h-4 w-4" strokeWidth={1.8} />
                  </button>
                )}
              </div>
            </div>
          ))}

          <button type="button" onClick={() => setLines([...lines, blankLine()])}
                  className="btn-ghost self-start text-brand-700">
            <Plus className="h-4 w-4" /> {L.addLine}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-ink-50 px-4 py-3 text-sm">
          <div><p className="text-xxs text-ink-500">{L.totalDebit}</p>
            <p className="font-medium tabular-nums">{money(totals.debit)}</p></div>
          <div><p className="text-xxs text-ink-500">{L.totalCredit}</p>
            <p className="font-medium tabular-nums">{money(totals.credit)}</p></div>
          <div><p className="text-xxs text-ink-500">{L.difference}</p>
            <p className={cn('font-medium tabular-nums',
              totals.diff === 0 ? 'text-emerald-700' : 'text-rose-600')}>{money(totals.diff)}</p></div>
        </div>
      </SlidePanel>
    </>
  );
}

export function ReverseEntryButton({
  entryId, d, canVoid, reversed,
}: { entryId: string; d: Dictionary; canVoid: boolean; reversed: boolean }) {
  const L = d.ui.journalEntry;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [date, setDate] = useState('');
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  if (!canVoid || reversed) return null;

  return (
    <>
      <button type="button" aria-label={L.reverse}
              onClick={() => { setErr(''); setOpen(true); }}
              className="rounded p-1 text-ink-400 hover:bg-amber-50 hover:text-amber-700">
        <RotateCcw className="h-4 w-4" strokeWidth={1.8} />
      </button>

      <SlidePanel
        open={open} onClose={() => setOpen(false)} title={L.reverse}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setOpen(false)}>{d.common.cancel}</button>
            <button className="btn-danger" disabled={pending || !reason.trim()}
                    onClick={() => start(async () => {
                      const res = await reverseJournalEntry(entryId, reason.trim(), date || null);
                      if (!res.ok) { setErr(res.error || ''); return; }
                      setOpen(false); router.refresh();
                    })}>
              {pending && <ShdSpinner size={16} />} {L.reverse}
            </button>
          </div>
        }
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">{L.reverseDate}</label>
            {/* เว้นว่างไว้ = ใช้วันที่เดียวกับรายการเดิม */}
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label">{L.reverseReason} *</label>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
      </SlidePanel>
    </>
  );
}
