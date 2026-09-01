'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { saveSalesRef, deleteSalesRef } from '@/actions/sales-reps';
import type { Dictionary } from '@/i18n';

export interface RefRow {
  id: string; code: string; name: string; is_active: boolean;
  customer_count: number;
  phone?: string | null; email?: string | null; commission_rate?: number;
}

export function SalesRefEditor({
  kind, row, d, canEdit,
}: { kind: 'rep' | 'zone'; row?: RefRow; d: Dictionary; canEdit: boolean }) {
  const L = d.ui.salesRep;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: row?.code || '', name: row?.name || '',
    phone: row?.phone || '', email: row?.email || '',
    commission_rate: row?.commission_rate ?? 0,
    is_active: row?.is_active !== false,
  });
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  if (!canEdit) return null;
  const addLabel = kind === 'rep' ? L.addRep : L.addZone;
  const editLabel = kind === 'rep' ? L.editRep : L.editZone;

  return (
    <>
      <button
        type="button"
        onClick={() => { setErr(''); setOpen(true); }}
        aria-label={row ? editLabel : undefined}
        className={row ? 'rounded p-1 text-ink-400 hover:bg-brand-50 hover:text-brand-700' : 'btn-primary'}
      >
        {row
          ? <Pencil className="h-4 w-4" strokeWidth={1.8} />
          : <><Plus className="h-4 w-4" strokeWidth={2} /> {addLabel}</>}
      </button>

      <SlidePanel
        open={open} onClose={() => setOpen(false)} title={row ? editLabel : addLabel}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setOpen(false)}>{d.common.cancel}</button>
            <button className="btn-primary" disabled={pending}
                    onClick={() => start(async () => {
                      setErr('');
                      const res = await saveSalesRef(kind, { id: row?.id, ...form });
                      if (!res.ok) { setErr(res.error || ''); return; }
                      setOpen(false); router.refresh();
                    })}>
              {pending && <ShdSpinner size={16} />} {d.common.save}
            </button>
          </div>
        }
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">{L.code} *</label>
            <input className="input font-mono" value={form.code} onChange={(e) => set('code', e.target.value)} />
          </div>
          <div>
            <label className="label">{L.name} *</label>
            <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          {kind === 'rep' && (
            <>
              <div>
                <label className="label">{L.phone}</label>
                <input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
              </div>
              <div>
                <label className="label">{L.email}</label>
                <input className="input" value={form.email} onChange={(e) => set('email', e.target.value)} />
              </div>
              <div>
                <label className="label">{L.commissionRate}</label>
                <input type="number" step="0.001" min={0} max={100} className="input num"
                       value={form.commission_rate}
                       onChange={(e) => set('commission_rate', e.target.value)} />
              </div>
            </>
          )}
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" className="h-4 w-4 rounded border-ink-300"
                 checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
          {L.active}
        </label>
      </SlidePanel>
    </>
  );
}

export function SalesRefDelete({
  kind, row, d, canDelete,
}: { kind: 'rep' | 'zone'; row: RefRow; d: Dictionary; canDelete: boolean }) {
  const L = d.ui.salesRep;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');

  // มีลูกค้าอ้างอยู่ก็ลบไม่ได้อยู่ดี ซ่อนปุ่มดีกว่าให้กดแล้วเจอข้อความปฏิเสธ
  if (!canDelete || row.customer_count > 0) return null;

  return (
    <>
      <button type="button" aria-label={d.common.delete} disabled={pending}
              onClick={() => start(async () => {
                const res = await deleteSalesRef(kind, row.id);
                if (!res.ok) { setErr(res.error || ''); return; }
                router.refresh();
              })}
              className="rounded p-1 text-ink-400 hover:bg-rose-50 hover:text-rose-600">
        {pending ? <ShdSpinner size={16} /> : <Trash2 className="h-4 w-4" strokeWidth={1.8} />}
      </button>
      {err && <span className="ml-1 text-xxs text-rose-600">{err}</span>}
    </>
  );
}
