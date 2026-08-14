'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Save, CheckCircle2, XCircle, Lock } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { calcDocument, calcLine, WHT_PRESETS, type VatTreatment } from '@/lib/tax';
import { money, bahtTextSafe } from '@/lib/ui-helpers';
import { saveDocument, approveDocument, voidDocument } from '@/actions/documents';

interface Option { id: string; label: string; sub?: string; price?: number; unit?: string }

export interface EditorProps {
  slug: string;
  kind: string;
  section: 'sales' | 'purchase';
  title: string;
  contacts: Option[];
  products: Option[];
  accounts: Option[];
  doc: any | null;
  lines: any[];
  /** ผู้ติดต่อตั้งต้นเมื่อเปิดจากหน้าผู้ติดต่อ */
  initialContactId?: string;
  perms: { create: boolean; edit: boolean; approve: boolean; void: boolean };
  lockedThrough: string | null;
  labels: Record<string, string>;
}

interface Row {
  key: string;
  product_id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  discount_pct: number;
  vat_treatment: VatTreatment;
  vat_rate: number;
  wht_code: string;
  wht_rate: number;
  account_id: string;
}

const emptyRow = (): Row => ({
  key: Math.random().toString(36).slice(2),
  product_id: '', description: '', quantity: 1, unit: '', unit_price: 0,
  discount_pct: 0, vat_treatment: 'exclusive', vat_rate: 7,
  wht_code: 'NONE', wht_rate: 0, account_id: '',
});

export function DocumentEditor(p: EditorProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const readOnly =
    !!p.doc && (['approved', 'paid', 'partial', 'void', 'closed'].includes(p.doc.status) || !p.perms.edit);
  const frozen = !!p.lockedThrough && !!p.doc && p.doc.doc_date <= p.lockedThrough;

  const [docDate, setDocDate] = useState<string>(p.doc?.doc_date || new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState<string>(p.doc?.due_date || '');
  const [contactId, setContactId] = useState<string>(p.doc?.contact_id || p.initialContactId || '');
  const [reference, setReference] = useState<string>(p.doc?.reference || '');
  const [notes, setNotes] = useState<string>(p.doc?.notes || '');
  const [headerDiscount, setHeaderDiscount] = useState<number>(0);
  const [rows, setRows] = useState<Row[]>(
    p.lines.length
      ? p.lines.map((l: any) => ({
          key: l.id,
          product_id: l.product_id || '',
          description: l.description || '',
          quantity: Number(l.quantity),
          unit: l.unit || '',
          unit_price: Number(l.unit_price),
          discount_pct: Number(l.discount_pct || 0),
          vat_treatment: l.vat_treatment,
          vat_rate: Number(l.vat_rate ?? 7),
          wht_code: l.wht_code || 'NONE',
          wht_rate: Number(l.wht_rate || 0),
          account_id: l.account_id || '',
        }))
      : [emptyRow()]
  );

  const totals = useMemo(() => calcDocument(rows as any, headerDiscount), [rows, headerDiscount]);

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function onPickProduct(i: number, productId: string) {
    const prod = p.products.find((x) => x.id === productId);
    update(i, {
      product_id: productId,
      description: prod?.label || rows[i].description,
      unit_price: prod?.price ?? rows[i].unit_price,
      unit: prod?.unit || rows[i].unit,
    });
  }

  function onPickWht(i: number, code: string) {
    const preset = WHT_PRESETS.find((w) => w.code === code);
    update(i, { wht_code: code, wht_rate: preset?.rate ?? 0 });
  }

  function submit(thenApprove = false) {
    setMsg(null);
    start(async () => {
      const res = await saveDocument({
        id: p.doc?.id || null,
        kind: p.kind,
        doc_date: docDate,
        due_date: dueDate || null,
        contact_id: contactId || null,
        reference,
        notes,
        discount_amount: headerDiscount,
        lines: rows.map((r) => ({
          product_id: r.product_id || null,
          description: r.description,
          quantity: Number(r.quantity) || 0,
          unit: r.unit,
          unit_price: Number(r.unit_price) || 0,
          discount_pct: Number(r.discount_pct) || 0,
          vat_treatment: r.vat_treatment,
          vat_rate: Number(r.vat_rate) || 0,
          wht_code: r.wht_code === 'NONE' ? null : r.wht_code,
          wht_rate: Number(r.wht_rate) || 0,
          account_id: r.account_id || null,
        })),
      });
      if (!res.ok) { setMsg({ type: 'err', text: res.error || '' }); return; }
      if (thenApprove) {
        const ap = await approveDocument(res.id as string);
        if (!ap.ok) { setMsg({ type: 'err', text: ap.error || '' }); return; }
      }
      router.push(`/${p.section}/${p.slug}/${res.id}`);
      router.refresh();
    });
  }

  function doApprove() {
    start(async () => {
      const res = await approveDocument(p.doc.id);
      if (!res.ok) setMsg({ type: 'err', text: res.error || '' });
      else router.refresh();
    });
  }

  function doVoid() {
    const reason = window.prompt(p.labels.voidReason || 'ระบุเหตุผลการยกเลิก');
    if (reason === null) return;
    start(async () => {
      const res = await voidDocument(p.doc.id, reason);
      if (!res.ok) setMsg({ type: 'err', text: res.error || '' });
      else router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {msg && (
        <div className={msg.type === 'ok'
          ? 'rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-200'
          : 'rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200'}>
          {msg.text}
        </div>
      )}
      {frozen && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
          <Lock className="h-4 w-4" /> {p.labels.frozen}
        </div>
      )}

      {/* ---------- ส่วนหัวเอกสาร ---------- */}
      <div className="card card-pad">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="label">{p.labels.contact}</label>
            <select className="input" value={contactId} disabled={readOnly}
                    onChange={(e) => setContactId(e.target.value)}>
              <option value="">— {p.labels.select} —</option>
              {p.contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.label}{c.sub ? ` (${c.sub})` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{p.labels.docDate}</label>
            <input type="date" className="input" value={docDate} disabled={readOnly}
                   onChange={(e) => setDocDate(e.target.value)} />
          </div>
          <div>
            <label className="label">{p.labels.dueDate}</label>
            <input type="date" className="input" value={dueDate} disabled={readOnly}
                   onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="label">{p.labels.reference}</label>
            <input className="input" value={reference} disabled={readOnly}
                   onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="label">{p.labels.notes}</label>
            <input className="input" value={notes} disabled={readOnly}
                   onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
      </div>

      {/* ---------- รายการ ---------- */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-ink-200">
            <thead className="bg-ink-50">
              <tr>
                <th className="th-cell w-8">#</th>
                <th className="th-cell min-w-[16rem]">{p.labels.product}</th>
                <th className="th-cell w-24 text-right">{p.labels.quantity}</th>
                <th className="th-cell w-32 text-right">{p.labels.unitPrice}</th>
                <th className="th-cell w-20 text-right">{p.labels.discount} %</th>
                <th className="th-cell w-28">{p.labels.vatType}</th>
                <th className="th-cell w-44">{p.labels.whtType}</th>
                <th className="th-cell w-32 text-right">{p.labels.subtotal}</th>
                <th className="th-cell w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 bg-white">
              {rows.map((r, i) => {
                const calc = calcLine(r as any);
                return (
                  <tr key={r.key} className="align-top">
                    <td className="td-cell text-ink-400">{i + 1}</td>
                    <td className="td-cell">
                      <select className="input mb-1.5 text-xs" value={r.product_id} disabled={readOnly}
                              onChange={(e) => onPickProduct(i, e.target.value)}>
                        <option value="">— {p.labels.freeText} —</option>
                        {p.products.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                      </select>
                      <input className="input" placeholder={p.labels.description} value={r.description}
                             disabled={readOnly} onChange={(e) => update(i, { description: e.target.value })} />
                      <select className="input mt-1.5 text-xs" value={r.account_id} disabled={readOnly}
                              onChange={(e) => update(i, { account_id: e.target.value })}>
                        <option value="">— {p.labels.account} ({p.labels.auto}) —</option>
                        {p.accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                      </select>
                    </td>
                    <td className="td-cell">
                      <input type="number" step="0.0001" className="input num" value={r.quantity} disabled={readOnly}
                             onChange={(e) => update(i, { quantity: Number(e.target.value) })} />
                      <input className="input mt-1.5 text-xs" placeholder={p.labels.unit} value={r.unit}
                             disabled={readOnly} onChange={(e) => update(i, { unit: e.target.value })} />
                    </td>
                    <td className="td-cell">
                      <input type="number" step="0.0001" className="input num" value={r.unit_price} disabled={readOnly}
                             onChange={(e) => update(i, { unit_price: Number(e.target.value) })} />
                    </td>
                    <td className="td-cell">
                      <input type="number" step="0.01" className="input num" value={r.discount_pct} disabled={readOnly}
                             onChange={(e) => update(i, { discount_pct: Number(e.target.value) })} />
                    </td>
                    <td className="td-cell">
                      <select className="input text-xs" value={r.vat_treatment} disabled={readOnly}
                              onChange={(e) => update(i, { vat_treatment: e.target.value as VatTreatment })}>
                        <option value="exclusive">{p.labels.exclusive}</option>
                        <option value="inclusive">{p.labels.inclusive}</option>
                        <option value="zero_rated">{p.labels.zeroRated}</option>
                        <option value="exempt">{p.labels.exempt}</option>
                        <option value="none">{p.labels.none}</option>
                      </select>
                    </td>
                    <td className="td-cell">
                      <select className="input text-xs" value={r.wht_code} disabled={readOnly}
                              onChange={(e) => onPickWht(i, e.target.value)}>
                        {WHT_PRESETS.map((w) => (
                          <option key={w.code} value={w.code}>{w.label}{w.rate ? ` ${w.rate}%` : ''}</option>
                        ))}
                      </select>
                    </td>
                    <td className="td-cell num align-middle">
                      <div className="font-medium">{money(calc.line_amount)}</div>
                      {calc.vat_amount > 0 && <div className="text-xxs text-ink-400">VAT {money(calc.vat_amount)}</div>}
                      {calc.wht_amount > 0 && <div className="text-xxs text-amber-600">WHT {money(calc.wht_amount)}</div>}
                    </td>
                    <td className="td-cell">
                      {!readOnly && rows.length > 1 && (
                        <button type="button" onClick={() => setRows(rows.filter((_, x) => x !== i))}
                                className="rounded p-1 text-ink-400 hover:bg-rose-50 hover:text-rose-600">
                          <Trash2 className="h-4 w-4" strokeWidth={1.8} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!readOnly && (
          <div className="border-t border-ink-200 px-4 py-3">
            <button type="button" onClick={() => setRows([...rows, emptyRow()])} className="btn-ghost text-brand-700">
              <Plus className="h-4 w-4" /> {p.labels.addLine}
            </button>
          </div>
        )}
      </div>

      {/* ---------- สรุปยอด ---------- */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="card card-pad lg:col-span-2">
          <p className="section-title mb-2">{p.labels.amountInWords}</p>
          <p className="text-sm text-ink-700">{bahtTextSafe(totals.net_payable)}</p>
        </div>
        <div className="card card-pad">
          <dl className="space-y-2 text-sm">
            <Row2 label={p.labels.subtotal} value={money(totals.subtotal)} />
            <Row2 label={p.labels.discount} value={money(totals.discount_amount)} />
            <Row2 label={p.labels.vatBase} value={money(totals.vat_base)} />
            <Row2 label={p.labels.vat} value={money(totals.vat_amount)} />
            <div className="border-t border-ink-200 pt-2">
              <Row2 label={p.labels.grandTotal} value={money(totals.grand_total)} bold />
            </div>
            {totals.wht_amount > 0 && (
              <>
                <Row2 label={p.labels.wht} value={'-' + money(totals.wht_amount)} tone="amber" />
                <div className="border-t border-ink-200 pt-2">
                  <Row2 label={p.labels.netPayable} value={money(totals.net_payable)} bold />
                </div>
              </>
            )}
          </dl>
        </div>
      </div>

      {/* ---------- ปุ่มดำเนินการ ---------- */}
      <div className="no-print flex flex-wrap items-center gap-2">
        {!readOnly && (
          <>
            <button type="button" disabled={pending} onClick={() => submit(false)} className="btn-primary">
              {pending ? <ShdSpinner size={16} /> : <Save className="h-4 w-4" />}
              {p.labels.save}
            </button>
            {p.perms.approve && (
              <button type="button" disabled={pending} onClick={() => submit(true)} className="btn-secondary">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> {p.labels.saveAndApprove}
              </button>
            )}
          </>
        )}
        {p.doc && p.doc.status === 'draft' && p.perms.approve && (
          <button type="button" disabled={pending} onClick={doApprove} className="btn-primary">
            <CheckCircle2 className="h-4 w-4" /> {p.labels.approve}
          </button>
        )}
        {p.doc && p.doc.status !== 'void' && p.perms.void && (
          <button type="button" disabled={pending} onClick={doVoid} className="btn-danger">
            <XCircle className="h-4 w-4" /> {p.labels.void}
          </button>
        )}
      </div>
    </div>
  );
}

function Row2({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={bold ? 'font-medium text-ink-800' : 'text-ink-500'}>{label}</dt>
      <dd className={
        'tabular-nums ' +
        (bold ? 'text-base font-semibold text-ink-900 ' : 'text-ink-800 ') +
        (tone === 'amber' ? 'text-amber-600' : '')
      }>{value}</dd>
    </div>
  );
}
