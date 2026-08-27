'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Coins, Plus, Trash2, Check, Info } from 'lucide-react';
import { cn } from '@/lib/cn';
import { money } from '@/lib/format';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import {
  createLandedCost, addLandedCharge, removeLandedCharge, confirmLandedCost,
} from '@/actions/inventory';
import type { Dictionary } from '@/i18n';

/** สร้างใบปรับต้นทุนใหม่ */
export function NewLandedCost({
  documents, d, canEdit,
}: {
  documents: { id: string; label: string }[];
  d: Dictionary;
  canEdit: boolean;
}) {
  const L = d.ui.landed;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    source_document_id: '', date: new Date().toISOString().slice(0, 10),
    method: 'value' as 'value' | 'qty' | 'weight', note: '',
  });
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  if (!canEdit) return null;

  const submit = () => {
    setErr('');
    start(async () => {
      const res = await createLandedCost(form);
      if (!res.ok) { setErr(res.error || ''); return; }
      setOpen(false);
      if (res.id) router.push(`/inventory/landed-costs/${res.id}`);
    });
  };

  return (
    <>
      <button type="button" onClick={() => { setErr(''); setOpen(true); }} className="btn-primary">
        <Coins className="h-4 w-4" strokeWidth={1.8} /> {L.create}
      </button>

      <SlidePanel
        open={open} onClose={() => setOpen(false)} title={L.create}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setOpen(false)}>{d.common.cancel}</button>
            <button className="btn-primary" disabled={pending || !form.source_document_id} onClick={submit}>
              {pending && <ShdSpinner size={16} />} {d.common.create}
            </button>
          </div>
        }
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}

        <div className="space-y-4">
          <div>
            <label className="label">{L.sourceDoc} *</label>
            <select className="input" value={form.source_document_id}
              onChange={(e) => setForm((f) => ({ ...f, source_document_id: e.target.value }))}>
              <option value="">—</option>
              {documents.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{L.method}</label>
            <select className="input" value={form.method}
              onChange={(e) => setForm((f) => ({ ...f, method: e.target.value as any }))}>
              <option value="value">{L.mValue}</option>
              <option value="qty">{L.mQty}</option>
              <option value="weight">{L.mWeight}</option>
            </select>
            {form.method === 'weight' && <p className="mt-1 text-xxs text-amber-700">{L.weightHint}</p>}
          </div>
          <div>
            <label className="label">{L.date}</label>
            <input className="input" type="date" value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </div>
          <div>
            <label className="label">{d.common.notes}</label>
            <input className="input" value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          </div>
        </div>
      </SlidePanel>
    </>
  );
}

interface Charge { id: string; description: string; amount: number; accounts?: { code: string; name_th: string } }
interface BaseRow {
  layer_id: string; sku: string; name: string; unit: string;
  qty: number; qty_remaining: number; qty_used: number;
  unit_cost: number; basis: number;
}

/** แผงจัดการค่าใช้จ่าย + แสดงผลการปันส่วนล่วงหน้า + ยืนยัน */
export function LandedCostEditor({
  landedId, charges, base, totalBasis, accounts, editable, d,
}: {
  landedId: string;
  charges: Charge[];
  base: BaseRow[];
  totalBasis: number;
  accounts: { id: string; label: string }[];
  editable: boolean;
  d: Dictionary;
}) {
  const L = d.ui.landed;
  const router = useRouter();
  const [form, setForm] = useState({ description: '', amount: '', account_id: accounts[0]?.id || '' });
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();

  const total = charges.reduce((s, c) => s + Number(c.amount), 0);

  // แสดงผลล่วงหน้าให้เห็นก่อนกดยืนยัน ตัวเลขจริงคำนวณใหม่ที่ฐานข้อมูลเสมอ
  const preview = base.map((r) => {
    const alloc = totalBasis > 0 ? (total * Number(r.basis)) / totalBasis : 0;
    const stockPart = Number(r.qty) > 0 ? (alloc * Number(r.qty_remaining)) / Number(r.qty) : 0;
    const newCost = Number(r.qty_remaining) > 0
      ? (Number(r.qty_remaining) * Number(r.unit_cost) + stockPart) / Number(r.qty_remaining)
      : Number(r.unit_cost);
    return { ...r, alloc, stockPart, cogsPart: alloc - stockPart, newCost };
  });
  const toInv = preview.reduce((s, r) => s + r.stockPart, 0);
  const toCogs = total - toInv;

  const run = (fn: () => Promise<any>, ok: string) => {
    setErr(''); setMsg('');
    start(async () => {
      const res = await fn();
      if (!res.ok) { setErr(res.error || ''); return; }
      setMsg(ok); setAsking(false);
      setForm((f) => ({ ...f, description: '', amount: '' }));
      router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}
      {msg && (
        <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 ring-1 ring-inset ring-emerald-200">
          <Check className="h-3.5 w-3.5" strokeWidth={2.2} /> {msg}
        </p>
      )}

      {/* ---------- ค่าใช้จ่าย ---------- */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-ink-900">{L.charges}</h2>

        <ul className="mt-3 divide-y divide-ink-100">
          {charges.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink-800">{c.description}</span>
                {c.accounts && (
                  <span className="block text-xxs text-ink-400">{c.accounts.code} {c.accounts.name_th}</span>
                )}
              </span>
              <span className="tabular-nums text-sm text-ink-800">{money(c.amount)}</span>
              {editable && (
                <button
                  disabled={pending}
                  onClick={() => run(() => removeLandedCharge(landedId, c.id), d.common.saved)}
                  className="rounded p-1 text-ink-400 hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                </button>
              )}
            </li>
          ))}
          {charges.length === 0 && <li className="py-3 text-sm text-ink-400">{L.noCharge}</li>}
        </ul>

        <div className="mt-2 flex justify-between border-t border-ink-200 pt-2.5 text-sm font-medium">
          <span>{L.totalCharge}</span>
          <span className="tabular-nums">{money(total)}</span>
        </div>

        {editable && (
          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_9rem_1fr_auto]">
            <input className="input" placeholder={L.chargeDesc} value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            <input className="input text-right" type="number" step="0.01" min="0" placeholder={L.amount}
              value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
            <select className="input" value={form.account_id}
              onChange={(e) => setForm((f) => ({ ...f, account_id: e.target.value }))}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
            <button
              className="btn-secondary"
              disabled={pending || !form.description.trim() || !(Number(form.amount) > 0)}
              onClick={() => run(() => addLandedCharge({
                landed_id: landedId, description: form.description,
                amount: Number(form.amount), account_id: form.account_id,
              }), d.common.saved)}
            >
              <Plus className="h-4 w-4 text-ink-400" strokeWidth={1.8} /> {L.addCharge}
            </button>
          </div>
        )}
      </div>

      {/* ---------- ผลการปันส่วน ---------- */}
      <div className="card overflow-hidden">
        <div className="border-b border-ink-200 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-ink-900">{L.preview}</h2>
          <p className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-ink-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />{L.splitHint}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-xxs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-2.5 text-left">{L.sku}</th>
                <th className="px-4 py-2.5 text-right">{L.qty}</th>
                <th className="px-4 py-2.5 text-right">{L.qtyUsed}</th>
                <th className="px-4 py-2.5 text-right">{L.basis}</th>
                <th className="px-4 py-2.5 text-right">{L.alloc}</th>
                <th className="px-4 py-2.5 text-right">{L.unitCost}</th>
                <th className="px-4 py-2.5 text-right">{L.newUnitCost}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {preview.map((r) => (
                <tr key={r.layer_id}>
                  <td className="px-4 py-2">
                    <span className="font-mono text-xs text-ink-500">{r.sku}</span>
                    <span className="ml-2 text-ink-800">{r.name}</span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-600">{Number(r.qty).toLocaleString()}</td>
                  <td className={cn('px-4 py-2 text-right tabular-nums',
                    Number(r.qty_used) > 0 ? 'text-amber-700' : 'text-ink-400')}>
                    {Number(r.qty_used).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-500">{money(r.basis)}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium text-ink-900">{money(r.alloc)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-500">{money(r.unit_cost, 4)}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium text-brand-700">{money(r.newCost, 4)}</td>
                </tr>
              ))}
              {preview.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-ink-400">{L.noBase}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 border-t border-ink-200 px-5 py-3 sm:grid-cols-2">
          <div className="flex justify-between text-sm">
            <span className="text-ink-600">{L.toInventory}</span>
            <span className="tabular-nums font-medium text-ink-900">{money(toInv)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-ink-600">{L.toCogs}</span>
            <span className="tabular-nums font-medium text-amber-700">{money(toCogs)}</span>
          </div>
        </div>
      </div>

      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          {!asking ? (
            <button className="btn-primary" disabled={pending || total <= 0 || preview.length === 0}
              onClick={() => setAsking(true)}>
              <Check className="h-4 w-4" strokeWidth={1.8} /> {L.confirm}
            </button>
          ) : (
            <>
              <span className="text-xs text-ink-700">{L.confirmAsk}</span>
              <button className="btn-secondary" disabled={pending} onClick={() => setAsking(false)}>
                {d.common.cancel}
              </button>
              <button className="btn-primary" disabled={pending}
                onClick={() => run(() => confirmLandedCost(landedId), L.confirmed)}>
                {pending && <ShdSpinner size={16} />} {d.common.confirm}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
