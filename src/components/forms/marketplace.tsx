'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, FileDown, BookCheck } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { saveMarketplaceAccount, saveSettlement, postSettlement } from '@/actions/marketplace';

type Opt = { id: string; label: string };

const PLATFORMS = [
  { v: 'shopee', l: 'Shopee' },
  { v: 'lazada', l: 'Lazada' },
  { v: 'tiktok', l: 'TikTok Shop' },
  { v: 'line_myshop', l: 'LINE MyShop' },
  { v: 'woocommerce', l: 'WooCommerce' },
  { v: 'other', l: 'Other' },
];

const blank = {
  id: null as string | null, kind: 'shopee', shop_name: '', shop_ref: '',
  channel_id: '', income_account_id: '', fee_account_id: '',
};

export function MarketplaceManager({
  canCreate, editRow, options, labels,
}: {
  canCreate: boolean;
  editRow?: any;
  options: { channels: Opt[]; accounts: Opt[]; shops: Opt[] };
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(blank);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  function submit() {
    setErr('');
    start(async () => {
      const res = await saveMarketplaceAccount(form);
      if (!res.ok) { setErr(res.error || ''); return; }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      {editRow ? (
        <button
          onClick={() => { setForm({ ...blank, ...editRow }); setOpen(true); }}
          className="rounded p-1 text-ink-400 hover:bg-brand-50 hover:text-brand-600"
        >
          <Pencil className="h-4 w-4" strokeWidth={1.8} />
        </button>
      ) : (
        canCreate && (
          <button className="btn-primary" onClick={() => { setForm({ ...blank }); setOpen(true); }}>
            <Plus className="h-4 w-4" /> {labels.create}
          </button>
        )
      )}

      <SlidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={form.id ? labels.edit : labels.create}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setOpen(false)}>{labels.cancel}</button>
            <button className="btn-primary" disabled={pending} onClick={submit}>
              {pending && <ShdSpinner size={16} />} {labels.save}
            </button>
          </div>
        }
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">{labels.platform}</label>
            <select className="input" value={form.kind} onChange={(e) => set('kind', e.target.value)}>
              {PLATFORMS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{labels.shopRef}</label>
            <input className="input" value={form.shop_ref || ''} onChange={(e) => set('shop_ref', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="label">{labels.shopName} *</label>
            <input className="input" value={form.shop_name} onChange={(e) => set('shop_name', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="label">{labels.channel}</label>
            <select className="input" value={form.channel_id || ''} onChange={(e) => set('channel_id', e.target.value)}>
              <option value="">— {labels.auto} —</option>
              {options.channels.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">{labels.incomeAccount}</label>
            <select className="input" value={form.income_account_id || ''} onChange={(e) => set('income_account_id', e.target.value)}>
              <option value="">— {labels.auto} —</option>
              {options.accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">{labels.feeAccount}</label>
            <select className="input" value={form.fee_account_id || ''} onChange={(e) => set('fee_account_id', e.target.value)}>
              <option value="">— {labels.auto} —</option>
              {options.accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>
        </div>
      </SlidePanel>
    </>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

export function SettlementImport({ shops, labels }: { shops: Opt[]; labels: Record<string, string> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({
    account_id: '', settlement_ref: '', period_from: '', period_to: '', paid_date: today(),
    gross_amount: 0, fee_amount: 0, adjustment: 0, net_amount: '', order_count: 0,
  });
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const net =
    form.net_amount === '' || form.net_amount == null
      ? Number(form.gross_amount || 0) - Number(form.fee_amount || 0) + Number(form.adjustment || 0)
      : Number(form.net_amount);

  function submit() {
    setErr('');
    start(async () => {
      const res = await saveSettlement(form);
      if (!res.ok) { setErr(res.error || ''); return; }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button className="btn-secondary" onClick={() => setOpen(true)}>
        <FileDown className="h-4 w-4" strokeWidth={1.8} /> {labels.importSettlement}
      </button>

      <SlidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={labels.importSettlement}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setOpen(false)}>{labels.cancel}</button>
            <button className="btn-primary" disabled={pending} onClick={submit}>
              {pending && <ShdSpinner size={16} />} {labels.save}
            </button>
          </div>
        }
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">{labels.shop} *</label>
            <select className="input" value={form.account_id} onChange={(e) => set('account_id', e.target.value)}>
              <option value="">—</option>
              {shops.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div><label className="label">{labels.settlementRef}</label>
            <input className="input" value={form.settlement_ref} onChange={(e) => set('settlement_ref', e.target.value)} /></div>
          <div><label className="label">{labels.paidDate}</label>
            <input type="date" className="input" value={form.paid_date} onChange={(e) => set('paid_date', e.target.value)} /></div>
          <div><label className="label">{labels.periodFrom}</label>
            <input type="date" className="input" value={form.period_from} onChange={(e) => set('period_from', e.target.value)} /></div>
          <div><label className="label">{labels.periodTo}</label>
            <input type="date" className="input" value={form.period_to} onChange={(e) => set('period_to', e.target.value)} /></div>
          <div><label className="label">{labels.gross}</label>
            <input type="number" step="0.01" className="input num" value={form.gross_amount} onChange={(e) => set('gross_amount', e.target.value)} /></div>
          <div><label className="label">{labels.fee}</label>
            <input type="number" step="0.01" className="input num" value={form.fee_amount} onChange={(e) => set('fee_amount', e.target.value)} /></div>
          <div><label className="label">{labels.adjustment}</label>
            <input type="number" step="0.01" className="input num" value={form.adjustment} onChange={(e) => set('adjustment', e.target.value)} /></div>
          <div><label className="label">{labels.orderCount}</label>
            <input type="number" className="input num" value={form.order_count} onChange={(e) => set('order_count', e.target.value)} /></div>
        </div>

        <p className="mt-4 flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2.5 text-sm text-brand-800">
          <span>{labels.net}</span>
          <b className="tabular-nums">{net.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
        </p>
      </SlidePanel>
    </>
  );
}

export function SettlementPost({ settlementId, labels }: { settlementId: string; labels: Record<string, string> }) {
  const router = useRouter();
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col items-start gap-1">
      {err && <span className="max-w-[14rem] text-xxs text-rose-600">{err}</span>}
      <button
        className="btn-secondary h-7 px-2 py-1 text-xs"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await postSettlement(settlementId);
            if (!res.ok) { setErr(res.error || ''); return; }
            router.refresh();
          })
        }
      >
        {pending ? <ShdSpinner size={14} /> : <BookCheck className="h-3.5 w-3.5" strokeWidth={1.8} />}
        {labels.post}
      </button>
    </div>
  );
}
