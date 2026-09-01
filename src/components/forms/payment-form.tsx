'use client';
import { useState, useTransition, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { recordPayment, voidPayment } from '@/actions/payments';
import { money, localeDate } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { Dictionary } from '@/i18n';

interface Option { id: string; label: string }
interface OpenDoc {
  id: string; doc_number: string; doc_date: string; due_date: string | null;
  description: string | null; outstanding: number; overdue: boolean;
}

export function PaymentForm({
  direction, contacts, channels, d, canCreate,
}: {
  direction: 'receive' | 'pay';
  contacts: Option[];
  channels: Option[];
  d: Dictionary;
  canCreate: boolean;
}) {
  const L = d.ui.payment;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');

  const [docNumber, setDocNumber] = useState('');
  const [docDate, setDocDate] = useState(new Date().toISOString().slice(0, 10));
  const [contactId, setContactId] = useState('');
  const [channelId, setChannelId] = useState(channels[0]?.id || '');
  const [wht, setWht] = useState<number | string>(0);
  const [fee, setFee] = useState<number | string>(0);
  const [note, setNote] = useState('');

  const [docs, setDocs] = useState<OpenDoc[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  // ดึงเอกสารค้างชำระของคู่ค้าที่เลือก ผ่าน API ฝั่งเซิร์ฟเวอร์เพื่อให้ RLS ทำงาน
  useEffect(() => {
    if (!open || !contactId) { setDocs([]); return; }
    let alive = true;
    setLoadingDocs(true);
    fetch(`/api/open-documents?contact=${contactId}&side=${direction}`)
      .then((r) => (r.ok ? r.json() : { rows: [] }))
      .then((j) => { if (alive) setDocs(j.rows || []); })
      .catch(() => { if (alive) setDocs([]); })
      .finally(() => { if (alive) setLoadingDocs(false); });
    return () => { alive = false; };
  }, [open, contactId, direction]);

  const totalPay = useMemo(
    () => Object.values(amounts).reduce((a, v) => a + (Number(v) || 0), 0),
    [amounts]
  );
  // เงินสดที่เข้าหรือออกจริง ต่างจากยอดที่ตัดเมื่อมีภาษีหักหรือค่าธรรมเนียม
  const netCash = direction === 'receive'
    ? totalPay - (Number(wht) || 0) - (Number(fee) || 0)
    : totalPay - (Number(wht) || 0) + (Number(fee) || 0);

  if (!canCreate) return null;
  const title = direction === 'receive' ? L.newReceive : L.newPay;

  const reset = () => {
    setDocNumber(''); setContactId(''); setWht(0); setFee(0); setNote('');
    setDocs([]); setAmounts({}); setErr('');
  };

  const submit = () => {
    setErr('');
    start(async () => {
      const res = await recordPayment({
        direction, doc_number: docNumber, doc_date: docDate,
        contact_id: contactId, channel_id: channelId,
        allocations: docs.map((x) => ({ document_id: x.id, amount: Number(amounts[x.id]) || 0 })),
        wht: Number(wht) || 0, fee: Number(fee) || 0, note: note || null,
      });
      if (!res.ok) { setErr(res.error || ''); return; }
      setOpen(false); reset(); router.refresh();
    });
  };

  return (
    <>
      <button type="button" className="btn-primary"
              onClick={() => { reset(); setOpen(true); }}>
        <Plus className="h-4 w-4" strokeWidth={2} /> {title}
      </button>

      <SlidePanel
        open={open} onClose={() => setOpen(false)} title={title}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-ink-600">
              {L.netCash} <b className="tabular-nums text-ink-900">{money(netCash)}</b>
            </span>
            <span className="flex gap-2">
              <button className="btn-secondary" onClick={() => setOpen(false)}>{d.common.cancel}</button>
              <button className="btn-primary" disabled={pending || !docNumber || !contactId || totalPay <= 0}
                      onClick={submit}>
                {pending && <ShdSpinner size={16} />} {d.common.save}
              </button>
            </span>
          </div>
        }
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">{L.docNumber} *</label>
            <input className="input font-mono" value={docNumber} onChange={(e) => setDocNumber(e.target.value)} />
          </div>
          <div>
            <label className="label">{L.docDate} *</label>
            <input type="date" className="input" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
          </div>
          <div>
            <label className="label">{L.contact} *</label>
            <select className="input" value={contactId} onChange={(e) => { setContactId(e.target.value); setAmounts({}); }}>
              <option value="">— {d.common.search} —</option>
              {contacts.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{L.channel} *</label>
            <select className="input" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              {channels.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{L.wht}</label>
            <input type="number" step="0.01" className="input num" value={wht} onChange={(e) => setWht(e.target.value)} />
          </div>
          <div>
            <label className="label">{L.fee}</label>
            <input type="number" step="0.01" className="input num" value={fee} onChange={(e) => setFee(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">{L.note}</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <div className="mt-5">
          <p className="section-title mb-2">{L.pickDocs}</p>

          {!contactId && <p className="rounded-lg bg-ink-50 px-3 py-3 text-xs text-ink-500">{L.selectContact}</p>}
          {contactId && loadingDocs && <p className="py-3 text-xs text-ink-400"><ShdSpinner size={14} /></p>}
          {contactId && !loadingDocs && docs.length === 0 && (
            <p className="rounded-lg bg-ink-50 px-3 py-3 text-xs text-ink-500">{L.noOpen}</p>
          )}

          <ul className="flex flex-col divide-y divide-ink-100">
            {docs.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-baseline gap-2">
                    <b className="font-mono text-xs text-ink-800">{x.doc_number}</b>
                    {x.due_date && (
                      <span className={cn('text-xxs', x.overdue ? 'text-rose-600' : 'text-ink-400')}>
                        {localeDate(x.due_date, 'th')}
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xxs text-ink-500">{x.description || '—'}</span>
                  <span className="text-xxs text-ink-500">
                    {L.outstanding} <b className="tabular-nums">{money(x.outstanding)}</b>
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  <input
                    type="number" step="0.01" min={0} max={x.outstanding}
                    className="input num w-32 py-1.5 text-sm"
                    placeholder="0.00"
                    value={amounts[x.id] ?? ''}
                    onChange={(e) => setAmounts((a) => ({ ...a, [x.id]: e.target.value }))}
                  />
                  {/* ตัดเต็มจำนวนในคลิกเดียว เพราะเป็นกรณีที่พบบ่อยที่สุด */}
                  <button type="button" title={L.fillAll}
                          onClick={() => setAmounts((a) => ({ ...a, [x.id]: String(x.outstanding) }))}
                          className="rounded px-2 py-1 text-xxs text-brand-700 hover:bg-brand-50">
                    {L.fillAll}
                  </button>
                </span>
              </li>
            ))}
          </ul>

          {totalPay > 0 && (
            <p className="mt-3 flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
              <span>{L.totalPay}</span>
              <b className="tabular-nums">{money(totalPay)}</b>
            </p>
          )}
        </div>
      </SlidePanel>
    </>
  );
}

export function VoidPaymentButton({ paymentId, d, canVoid }: { paymentId: string; d: Dictionary; canVoid: boolean }) {
  const L = d.ui.payment;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  if (!canVoid) return null;

  return (
    <>
      <button type="button" aria-label={L.void}
              onClick={() => { setErr(''); setOpen(true); }}
              className="rounded p-1 text-ink-400 hover:bg-rose-50 hover:text-rose-600">
        <X className="h-4 w-4" strokeWidth={2} />
      </button>

      <SlidePanel
        open={open} onClose={() => setOpen(false)} title={L.void}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setOpen(false)}>{d.common.cancel}</button>
            <button className="btn-danger" disabled={pending || !reason.trim()}
                    onClick={() => start(async () => {
                      const res = await voidPayment(paymentId, reason.trim());
                      if (!res.ok) { setErr(res.error || ''); return; }
                      setOpen(false); router.refresh();
                    })}>
              {pending && <ShdSpinner size={16} />} {L.void}
            </button>
          </div>
        }
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}
        <label className="label">{L.voidReason} *</label>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
      </SlidePanel>
    </>
  );
}
