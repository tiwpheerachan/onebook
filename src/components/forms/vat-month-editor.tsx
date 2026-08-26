'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, PauseCircle, RotateCcw, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { setVatTaxMonth } from '@/actions/settings';
import type { Dictionary } from '@/i18n';

export interface VatRow {
  id: string;
  doc_number: string;
  doc_date: string;
  contact_name: string | null;
  vat_amount: number;
  vat_deferred: boolean;
  vat_tax_month: string | null;
  vat_note: string | null;
  months_aged: number;
}

/** เลือกเดือนภาษีที่จะใช้สิทธิ์ หรือพักไว้ก่อน */
export function VatMonthEditor({ row, d, canEdit }: { row: VatRow; d: Dictionary; canEdit: boolean }) {
  const L = d.ui.vatPending;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'month' | 'defer' | 'reset'>(
    row.vat_deferred ? 'defer' : row.vat_tax_month ? 'month' : 'reset'
  );
  const [month, setMonth] = useState(row.vat_tax_month ? row.vat_tax_month.slice(0, 7) : '');
  const [note, setNote] = useState(row.vat_note || '');
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  if (!canEdit) return null;

  const submit = () => {
    setErr('');
    start(async () => {
      const res = await setVatTaxMonth({
        document_id: row.id,
        month: mode === 'month' ? month : null,
        defer: mode === 'defer',
        note: note.trim() || undefined,
      });
      if (!res.ok) { setErr(res.error || ''); return; }
      setOpen(false);
      router.refresh();
    });
  };

  const Opt = ({ id, icon, label }: { id: typeof mode; icon: React.ReactNode; label: string }) => (
    <button
      type="button"
      onClick={() => setMode(id)}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition',
        mode === id ? 'border-brand-400 bg-brand-50 text-brand-800' : 'border-ink-200 text-ink-700 hover:bg-ink-50'
      )}
    >
      {icon}{label}
    </button>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => { setErr(''); setOpen(true); }}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ink-500 hover:bg-brand-50 hover:text-brand-700"
      >
        <CalendarClock className="h-3.5 w-3.5" strokeWidth={1.8} /> {L.manage}
      </button>

      <SlidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={`${L.manage} · ${row.doc_number}`}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setOpen(false)}>{d.common.cancel}</button>
            <button
              className="btn-primary"
              disabled={pending || (mode === 'month' && !month)}
              onClick={submit}
            >
              {pending && <ShdSpinner size={16} />} {L.save}
            </button>
          </div>
        }
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}

        <p className="mb-4 rounded-lg bg-brand-50 px-3 py-2.5 text-xs leading-relaxed text-brand-800">
          {L.howItWorks}
        </p>

        {row.months_aged > 6 && (
          <p className="mb-4 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            <span>{L.sixMonthWarn}<br />{L.sixMonthNote}</span>
          </p>
        )}

        <div className="space-y-2">
          <Opt id="month" icon={<CalendarClock className="h-4 w-4" strokeWidth={1.8} />} label={L.useMonth} />
          {mode === 'month' && (
            <input
              type="month"
              className="input ml-6 w-auto"
              min={row.doc_date.slice(0, 7)}
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          )}
          <Opt id="defer" icon={<PauseCircle className="h-4 w-4" strokeWidth={1.8} />} label={L.defer} />
          <Opt id="reset" icon={<RotateCcw className="h-4 w-4" strokeWidth={1.8} />} label={L.reset} />
        </div>

        <div className="mt-4">
          <label className="label">{L.note}</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </SlidePanel>
    </>
  );
}
