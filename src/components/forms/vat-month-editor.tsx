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
  tax_invoice_number: string | null;
  tax_invoice_date: string | null;
}

/** บวกเดือนให้ 'YYYY-MM' — เทียบกันด้วยสตริงได้ตรง ๆ เพราะรูปแบบเรียงตามเวลาอยู่แล้ว */
function addMonths(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  return dt.toISOString().slice(0, 7);
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
  const [tiNumber, setTiNumber] = useState(row.tax_invoice_number || '');
  const [tiDate, setTiDate] = useState(row.tax_invoice_date ? row.tax_invoice_date.slice(0, 10) : '');
  const [note, setNote] = useState(row.vat_note || '');
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  if (!canEdit) return null;

  // กรอบหกเดือนนับจากเดือนในใบกำกับ ไม่ใช่เดือนของเอกสารที่ตั้งไว้
  // บิลซื้อมักตั้งจากใบแจ้งหนี้ก่อนได้รับใบกำกับ สองวันที่นี้จึงคนละตัวกัน
  const anchor = (tiDate || row.doc_date).slice(0, 7);
  const lastMonth = addMonths(anchor, 6);
  const futureTi = !!tiDate && tiDate > new Date().toISOString().slice(0, 10);
  const monthOutOfRange = mode === 'month' && !!month && (month < anchor || month > lastMonth);

  const submit = () => {
    setErr('');
    if (futureTi) { setErr(L.tiDateFuture); return; }
    if (monthOutOfRange) {
      setErr(month < anchor ? L.beforeDoc : L.overSixBlock.replace('{to}', lastMonth));
      return;
    }
    start(async () => {
      const res = await setVatTaxMonth({
        document_id: row.id,
        month: mode === 'month' ? month : null,
        defer: mode === 'defer',
        note: note.trim() || undefined,
        tax_invoice_number: tiNumber.trim() || null,
        tax_invoice_date: tiDate || null,
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
              disabled={pending || futureTi || monthOutOfRange || (mode === 'month' && !month)}
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

        {/* ใบกำกับภาษีที่ได้รับจริง — คนละใบกับเอกสารที่ตั้งไว้เมื่อตั้งจากใบแจ้งหนี้ */}
        <div className="mb-4 rounded-lg border border-ink-200 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">{L.taxInvoiceNumber}</label>
              <input
                className="input"
                placeholder={row.doc_number}
                value={tiNumber}
                onChange={(e) => setTiNumber(e.target.value)}
              />
            </div>
            <div>
              <label className="label">{L.taxInvoiceDate}</label>
              <input
                type="date"
                className={cn('input', futureTi && 'border-rose-400 focus:border-rose-400 focus:ring-rose-100')}
                max={new Date().toISOString().slice(0, 10)}
                value={tiDate}
                onChange={(e) => setTiDate(e.target.value)}
              />
            </div>
          </div>
          <p className="mt-2 text-xxs leading-relaxed text-ink-400">{L.taxInvoiceHint}</p>
          {futureTi && <p className="mt-1 text-xxs text-rose-600">{L.tiDateFuture}</p>}
        </div>

        <div className="space-y-2">
          <Opt id="month" icon={<CalendarClock className="h-4 w-4" strokeWidth={1.8} />} label={L.useMonth} />
          {mode === 'month' && (
            <div className="ml-6">
              <input
                type="month"
                className={cn('input w-auto', monthOutOfRange && 'border-rose-400 focus:border-rose-400 focus:ring-rose-100')}
                min={anchor}
                max={lastMonth}
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
              <p className={cn('mt-1 text-xxs', monthOutOfRange ? 'text-rose-600' : 'text-ink-400')}>
                {L.windowRange.replace('{from}', anchor).replace('{to}', lastMonth)}
              </p>
            </div>
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
