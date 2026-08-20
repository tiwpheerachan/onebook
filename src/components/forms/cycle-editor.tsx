'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, Check, Star } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { setContactCycle } from '@/actions/master';
import type { Dictionary } from '@/i18n';

export interface CycleRow {
  id: string;
  name: string;
  cycle_days: number | null;
  cycle_source: string | null;
  cycle_note: string | null;
  suggested_days: number | null;
  is_regular: boolean;
  order_count: number;
}

/** ตั้งรอบการขายของลูกค้ารายหนึ่ง */
export function CycleEditor({ row, d, canEdit }: { row: CycleRow; d: Dictionary; canEdit: boolean }) {
  const L = d.ui.cycles;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<string>(row.cycle_days ? String(row.cycle_days) : '');
  const [regular, setRegular] = useState(row.is_regular);
  const [note, setNote] = useState(row.cycle_note || '');
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  if (!canEdit) return null;

  const submit = (clear = false) => {
    setErr('');
    start(async () => {
      const res = await setContactCycle({
        contact_id: row.id,
        days: clear || !days.trim() ? null : Number(days),
        is_regular: regular,
        note: note.trim() || undefined,
      });
      if (!res.ok) { setErr(res.error || ''); return; }
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setErr(''); setOpen(true); }}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ink-500 hover:bg-brand-50 hover:text-brand-700"
      >
        <CalendarClock className="h-3.5 w-3.5" strokeWidth={1.8} /> {L.setCycle}
      </button>

      <SlidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={`${L.setCycle} · ${row.name}`}
        footer={
          <div className="flex justify-between gap-2">
            <button
              className="btn-secondary"
              disabled={pending || !row.cycle_days}
              onClick={() => submit(true)}
            >
              {L.clearCycle}
            </button>
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={() => setOpen(false)}>{d.common.cancel}</button>
              <button className="btn-primary" disabled={pending} onClick={() => submit()}>
                {pending && <ShdSpinner size={16} />} {L.save}
              </button>
            </div>
          </div>
        }
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}

        <p className="mb-4 rounded-lg bg-brand-50 px-3 py-2.5 text-xs leading-relaxed text-brand-800">
          {L.howItWorks}
        </p>

        <div className="space-y-4">
          <div>
            <label className="label">{L.cycle} ({L.days})</label>
            <input
              className="input"
              type="number"
              min={1}
              max={730}
              placeholder={row.suggested_days ? String(row.suggested_days) : '30'}
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
            {row.suggested_days ? (
              <button
                type="button"
                onClick={() => setDays(String(row.suggested_days))}
                className="mt-1.5 text-xxs text-brand-600 hover:underline"
              >
                {L.suggested.replace('{n}', String(row.suggested_days))} — {L.useSuggested}
              </button>
            ) : (
              <p className="mt-1 text-xxs text-ink-400">{L.needHistory}</p>
            )}
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-300"
              checked={regular}
              onChange={(e) => setRegular(e.target.checked)}
            />
            <Star className={cn('h-3.5 w-3.5', regular ? 'text-amber-500' : 'text-ink-300')} strokeWidth={1.8} />
            {L.markRegular}
          </label>

          <div>
            <label className="label">{L.note}</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
      </SlidePanel>
    </>
  );
}

/** ป้ายสถานะรอบการขาย */
export function CycleBadge({ status, days, d }: { status: string; days: number | null; d: Dictionary }) {
  const L = d.ui.cycles;
  const map: Record<string, { cls: string; text: string }> = {
    overdue:   { cls: 'bg-rose-50 text-rose-700 ring-rose-200',
                 text: days != null ? L.daysLate.replace('{n}', String(days)) : L.overdue },
    due_soon:  { cls: 'bg-amber-50 text-amber-700 ring-amber-200',
                 text: days != null ? L.daysLeft.replace('{n}', String(Math.abs(days))) : L.dueSoon },
    ok:        { cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', text: L.onTrack },
    untracked: { cls: 'bg-ink-100 text-ink-500 ring-ink-200', text: L.untracked },
  };
  const s = map[status] || map.untracked;
  return <span className={cn('chip', s.cls)}>{s.text}</span>;
}
