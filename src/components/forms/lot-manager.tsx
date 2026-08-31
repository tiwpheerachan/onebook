'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, PackageMinus, GitBranch, ArrowDown, ArrowUp } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { receiveLot, issueLot } from '@/actions/lots';
import { money, localeDate } from '@/lib/format';
import type { Dictionary } from '@/i18n';

export interface LotRow {
  id: string; lot_no: string;
  product_id: string; sku: string; product_name: string; tracking: string;
  warehouse: string | null;
  mfg_date: string | null; expiry_date: string | null;
  qty_received: number; qty_issued: number; qty_remaining: number;
  expired: boolean;
}
interface Option { id: string; label: string; tracking?: string }

/** รับของเข้าทะเบียน */
export function LotReceive({
  products, warehouses, d, canEdit,
}: {
  products: Option[]; warehouses: Option[]; d: Dictionary; canEdit: boolean;
}) {
  const L = d.ui.lot;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    product_id: '', warehouse_id: warehouses[0]?.id || '',
    lot_no: '', qty: 1, expiry_date: '', mfg_date: '', note: '',
  });
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  if (!canEdit) return null;
  const isSerial = products.find((p) => p.id === form.product_id)?.tracking === 'serial';

  return (
    <>
      <button type="button" className="btn-primary" onClick={() => { setErr(''); setOpen(true); }}>
        <Plus className="h-4 w-4" strokeWidth={2} /> {L.receive}
      </button>

      <SlidePanel
        open={open} onClose={() => setOpen(false)} title={L.receive}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setOpen(false)}>{d.common.cancel}</button>
            <button className="btn-primary" disabled={pending || !form.product_id || !form.lot_no}
                    onClick={() => start(async () => {
                      setErr('');
                      const res = await receiveLot({
                        ...form,
                        qty: isSerial ? 1 : Number(form.qty),
                        expiry_date: form.expiry_date || null,
                        mfg_date: form.mfg_date || null,
                      });
                      if (!res.ok) { setErr(res.error || ''); return; }
                      setOpen(false); setForm((f) => ({ ...f, lot_no: '', qty: 1, note: '' }));
                      router.refresh();
                    })}>
              {pending && <ShdSpinner size={16} />} {d.common.save}
            </button>
          </div>
        }
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">{L.product} *</label>
            <select className="input" value={form.product_id} onChange={(e) => set('product_id', e.target.value)}>
              <option value="">— {d.common.search} —</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{L.warehouse} *</label>
            <select className="input" value={form.warehouse_id} onChange={(e) => set('warehouse_id', e.target.value)}>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{L.lotNo} *</label>
            <input className="input font-mono" value={form.lot_no} onChange={(e) => set('lot_no', e.target.value)} />
          </div>
          <div>
            <label className="label">{L.qty} *</label>
            {/* หมายเลขเครื่องคือของหนึ่งชิ้นเสมอ ล็อกช่องไว้ไม่ให้กรอกผิด */}
            <input type="number" step="0.0001" className="input num" value={isSerial ? 1 : form.qty}
                   disabled={isSerial} onChange={(e) => set('qty', e.target.value)} />
            {isSerial && <p className="mt-1 text-xxs text-ink-400">{L.serialQty}</p>}
          </div>
          <div>
            <label className="label">{L.mfgDate}</label>
            <input type="date" className="input" value={form.mfg_date} onChange={(e) => set('mfg_date', e.target.value)} />
          </div>
          <div>
            <label className="label">{L.expiryDate}</label>
            <input type="date" className="input" value={form.expiry_date} onChange={(e) => set('expiry_date', e.target.value)} />
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

/** จ่ายของออกจากทะเบียน */
export function LotIssue({ row, d, canEdit }: { row: LotRow; d: Dictionary; canEdit: boolean }) {
  const L = d.ui.lot;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<number | string>(row.tracking === 'serial' ? 1 : '');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  if (!canEdit || row.qty_remaining <= 0) return null;

  return (
    <>
      <button type="button" aria-label={L.issue}
              onClick={() => { setErr(''); setOpen(true); }}
              className="rounded p-1 text-ink-400 hover:bg-amber-50 hover:text-amber-700">
        <PackageMinus className="h-4 w-4" strokeWidth={1.8} />
      </button>

      <SlidePanel
        open={open} onClose={() => setOpen(false)} title={`${L.issue} · ${row.lot_no}`}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setOpen(false)}>{d.common.cancel}</button>
            <button className="btn-primary" disabled={pending || !Number(qty)}
                    onClick={() => start(async () => {
                      setErr('');
                      const res = await issueLot({
                        product_id: row.product_id, lot_no: row.lot_no,
                        qty: Number(qty), note: note || null,
                      });
                      if (!res.ok) { setErr(res.error || ''); return; }
                      setOpen(false); router.refresh();
                    })}>
              {pending && <ShdSpinner size={16} />} {d.common.save}
            </button>
          </div>
        }
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}
        <p className="mb-4 rounded-lg bg-ink-50 px-3 py-2.5 text-xs text-ink-600">
          {row.sku} · {row.product_name} — {L.remaining} <b className="tabular-nums">{money(row.qty_remaining, 4)}</b>
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">{L.qty} *</label>
            <input type="number" step="0.0001" className="input num" value={qty}
                   disabled={row.tracking === 'serial'} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div>
            <label className="label">{L.note}</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
      </SlidePanel>
    </>
  );
}

/** ประวัติของล็อต — ตอบว่าของไปอยู่กับใคร */
export function LotTrace({ row, trace, d }: { row: LotRow; trace: any; d: Dictionary }) {
  const L = d.ui.lot;
  const [open, setOpen] = useState(false);
  const moves = (trace?.movements || []) as any[];

  return (
    <>
      <button type="button" aria-label={L.trace}
              onClick={() => setOpen(true)}
              className="rounded p-1 text-ink-400 hover:bg-brand-50 hover:text-brand-700">
        <GitBranch className="h-4 w-4" strokeWidth={1.8} />
      </button>

      <SlidePanel open={open} onClose={() => setOpen(false)} title={`${L.traceTitle} · ${row.lot_no}`}>
        <div className="mb-4 grid grid-cols-3 gap-3 rounded-lg bg-ink-50 px-4 py-3 text-sm">
          <div><p className="text-xxs text-ink-500">{L.received}</p>
            <p className="font-medium tabular-nums">{money(row.qty_received, 4)}</p></div>
          <div><p className="text-xxs text-ink-500">{L.issued}</p>
            <p className="font-medium tabular-nums">{money(row.qty_issued, 4)}</p></div>
          <div><p className="text-xxs text-ink-500">{L.remaining}</p>
            <p className="font-medium tabular-nums text-ink-900">{money(row.qty_remaining, 4)}</p></div>
        </div>

        <ul className="flex flex-col divide-y divide-ink-100">
          {moves.map((m) => {
            const isIn = Number(m.qty_in) > 0;
            return (
              <li key={m.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5 text-sm">
                <span className="flex min-w-0 items-start gap-2">
                  {isIn
                    ? <ArrowDown className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2} />
                    : <ArrowUp className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" strokeWidth={2} />}
                  <span className="min-w-0">
                    <span className="block text-xxs text-ink-400">
                      {isIn ? L.traceIn : L.traceOut}
                    </span>
                    {m.document_id ? (
                      <Link href={`/documents/trace/${m.document_id}`}
                            className="font-mono text-xs text-brand-700 hover:underline">
                        {m.doc_number}
                      </Link>
                    ) : <span className="text-xs text-ink-400">—</span>}
                    {m.contact_name && (
                      <span className="block truncate text-xs text-ink-600">{m.contact_name}</span>
                    )}
                  </span>
                </span>
                <span className="text-right">
                  <b className={'tabular-nums ' + (isIn ? 'text-emerald-700' : 'text-amber-700')}>
                    {isIn ? '+' : '−'}{money(isIn ? m.qty_in : m.qty_out, 4)}
                  </b>
                  <span className="block text-xxs text-ink-400">{m.move_date}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </SlidePanel>
    </>
  );
}
