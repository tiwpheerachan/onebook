'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, Check, AlertTriangle, Save } from 'lucide-react';
import { cn } from '@/lib/cn';
import { money } from '@/lib/format';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { openStockCount, saveCountedQty, confirmStockCount } from '@/actions/inventory';
import type { Dictionary } from '@/i18n';

/** เปิดใบตรวจนับใหม่ */
export function OpenCount({
  warehouses, d, canEdit,
}: {
  warehouses: { id: string; label: string }[];
  d: Dictionary;
  canEdit: boolean;
}) {
  const L = d.ui.count;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    warehouse_id: warehouses[0]?.id || '',
    date: new Date().toISOString().slice(0, 10),
    note: '',
  });
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  if (!canEdit || warehouses.length === 0) return null;

  const submit = () => {
    setErr('');
    start(async () => {
      const res = await openStockCount(form);
      if (!res.ok) { setErr(res.error || ''); return; }
      setOpen(false);
      if (res.id) router.push(`/inventory/counts/${res.id}`);
      else router.refresh();
    });
  };

  return (
    <>
      <button type="button" onClick={() => { setErr(''); setOpen(true); }} className="btn-primary">
        <ClipboardList className="h-4 w-4" strokeWidth={1.8} /> {L.open}
      </button>

      <SlidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={L.open}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setOpen(false)}>{d.common.cancel}</button>
            <button className="btn-primary" disabled={pending || !form.warehouse_id} onClick={submit}>
              {pending && <ShdSpinner size={16} />} {L.open}
            </button>
          </div>
        }
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}

        <p className="mb-4 rounded-lg bg-brand-50 px-3 py-2.5 text-xs leading-relaxed text-brand-800">
          {L.openHint}
        </p>

        <div className="space-y-4">
          <div>
            <label className="label">{L.warehouse} *</label>
            <select
              className="input"
              value={form.warehouse_id}
              onChange={(e) => setForm((f) => ({ ...f, warehouse_id: e.target.value }))}
            >
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{L.date}</label>
            <input
              className="input"
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">{d.common.notes}</label>
            <input
              className="input"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            />
          </div>
        </div>
      </SlidePanel>
    </>
  );
}

interface Line {
  id: string; sku: string; name: string; unit: string;
  system_qty: number; counted_qty: number | null; unit_cost: number;
}

/**
 * ใบตรวจนับ : กรอกยอดที่นับได้แล้วยืนยัน
 *
 * ผลต่างคำนวณสดบนหน้าจอเพื่อให้เห็นทันทีที่พิมพ์
 * แต่ตัวเลขที่ใช้ปรับสต๊อกจริงคำนวณใหม่ที่ฐานข้อมูลตอนยืนยันเสมอ
 * หน้าจอเป็นแค่ตัวช่วยดู ไม่ใช่แหล่งความจริง
 */
export function CountSheet({
  countId, lines, editable, d,
}: {
  countId: string;
  lines: Line[];
  editable: boolean;
  d: Dictionary;
}) {
  const L = d.ui.count;
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, string>>(
    Object.fromEntries(lines.map((l) => [l.id, l.counted_qty == null ? '' : String(l.counted_qty)]))
  );
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();

  const diffOf = (l: Line) => {
    const v = vals[l.id];
    if (v === '' || v == null) return null;
    return Number(v) - Number(l.system_qty);
  };

  const totalDiff = lines.reduce((s, l) => {
    const dq = diffOf(l);
    return dq == null ? s : s + dq * Number(l.unit_cost);
  }, 0);

  const save = () => {
    setErr(''); setMsg('');
    start(async () => {
      const res = await saveCountedQty(
        countId,
        lines.map((l) => ({ id: l.id, counted_qty: vals[l.id] === '' ? null : Number(vals[l.id]) }))
      );
      if (!res.ok) { setErr(res.error || ''); return; }
      setMsg(L.saved);
      router.refresh();
    });
  };

  const confirm = () => {
    setErr(''); setMsg('');
    start(async () => {
      // บันทึกยอดที่พิมพ์ค้างไว้ก่อนเสมอ ไม่งั้นยอดล่าสุดจะหายไป
      const saved = await saveCountedQty(
        countId,
        lines.map((l) => ({ id: l.id, counted_qty: vals[l.id] === '' ? null : Number(vals[l.id]) }))
      );
      if (!saved.ok) { setErr(saved.error || ''); return; }

      const res = await confirmStockCount(countId);
      if (!res.ok) { setErr(res.error || ''); return; }
      setAsking(false);
      setMsg(L.confirmed);
      router.refresh();
    });
  };

  return (
    <div>
      {err && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}
      {msg && (
        <p className="mb-3 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 ring-1 ring-inset ring-emerald-200">
          <Check className="h-3.5 w-3.5" strokeWidth={2.2} /> {msg}
        </p>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-xxs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-2.5 text-left">SKU</th>
                <th className="px-4 py-2.5 text-left">{d.inv.productName}</th>
                <th className="px-4 py-2.5 text-right">{L.systemQty}</th>
                <th className="px-4 py-2.5 text-right">{L.countedQty}</th>
                <th className="px-4 py-2.5 text-right">{L.diff}</th>
                <th className="px-4 py-2.5 text-right">{L.diffValue}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {lines.map((l) => {
                const dq = diffOf(l);
                return (
                  <tr key={l.id} className={cn(dq != null && dq !== 0 && 'bg-amber-50/40')}>
                    <td className="px-4 py-2 font-mono text-xs text-ink-600">{l.sku}</td>
                    <td className="px-4 py-2 text-ink-800">{l.name}<span className="ml-1 text-xxs text-ink-400">{l.unit}</span></td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink-600">{Number(l.system_qty).toLocaleString()}</td>
                    <td className="px-4 py-2 text-right">
                      {editable ? (
                        <input
                          type="number"
                          step="any"
                          value={vals[l.id] ?? ''}
                          onChange={(e) => setVals((v) => ({ ...v, [l.id]: e.target.value }))}
                          className="w-28 rounded-lg border border-ink-300 px-2 py-1 text-right tabular-nums outline-none focus:border-brand-400"
                        />
                      ) : (
                        <span className="tabular-nums text-ink-800">
                          {l.counted_qty == null ? '—' : Number(l.counted_qty).toLocaleString()}
                        </span>
                      )}
                    </td>
                    <td className={cn('px-4 py-2 text-right tabular-nums font-medium',
                      dq == null ? 'text-ink-300' : dq === 0 ? 'text-ink-400' : dq > 0 ? 'text-emerald-700' : 'text-rose-700')}>
                      {dq == null ? '—' : dq > 0 ? `+${dq.toLocaleString()}` : dq.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink-600">
                      {dq == null ? '—' : money(dq * Number(l.unit_cost))}
                    </td>
                  </tr>
                );
              })}
              {lines.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-ink-400">{L.noLines}</td></tr>
              )}
            </tbody>
            <tfoot className="bg-ink-50 font-medium">
              <tr>
                <td className="px-4 py-2.5" colSpan={5}>{L.diffValue}</td>
                <td className={cn('px-4 py-2.5 text-right tabular-nums',
                  totalDiff < 0 ? 'text-rose-700' : totalDiff > 0 ? 'text-emerald-700' : 'text-ink-700')}>
                  {money(totalDiff)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {editable && (
        <>
          <p className="mt-4 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            {L.confirmHint}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button className="btn-secondary" disabled={pending} onClick={save}>
              {pending ? <ShdSpinner size={16} /> : <Save className="h-4 w-4 text-ink-400" strokeWidth={1.8} />} {L.save}
            </button>

            {!asking ? (
              <button className="btn-primary" disabled={pending} onClick={() => setAsking(true)}>
                <Check className="h-4 w-4" strokeWidth={1.8} /> {L.confirm}
              </button>
            ) : (
              <>
                <span className="text-xs text-ink-700">{L.confirmAsk}</span>
                <button className="btn-secondary" disabled={pending} onClick={() => setAsking(false)}>
                  {d.common.cancel}
                </button>
                <button className="btn-primary" disabled={pending} onClick={confirm}>
                  {pending && <ShdSpinner size={16} />} {d.common.confirm}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
