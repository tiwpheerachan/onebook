'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { saveChannel } from '@/actions/master';

const blank = {
  id: null as string | null, code: '', name: '', kind: 'bank',
  bank_name: '', account_no: '', account_id: '', opening_balance: 0, is_active: true,
};

export function ChannelManager({
  canCreate, canEdit, editRow, accounts, labels,
}: { canCreate: boolean; canEdit: boolean; editRow?: any; accounts: { id: string; label: string }[]; labels: Record<string, string> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(blank);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  function submit() {
    setErr('');
    if (!form.code || !form.name) { setErr(labels.required); return; }
    start(async () => {
      const res = await saveChannel(form);
      if (!res.ok) { setErr(res.error || ''); return; }
      setOpen(false); router.refresh();
    });
  }

  return (
    <>
      {editRow ? (
        canEdit && (
          <button onClick={() => { setForm({ ...blank, ...editRow }); setOpen(true); }}
                  className="rounded p-1 text-ink-400 hover:bg-brand-50 hover:text-brand-600">
            <Pencil className="h-4 w-4" strokeWidth={1.8} />
          </button>
        )
      ) : (
        canCreate && (
          <button onClick={() => { setForm({ ...blank }); setOpen(true); }} className="btn-primary">
            <Plus className="h-4 w-4" /> {labels.create}
          </button>
        )
      )}
      <SlidePanel open={open} onClose={() => setOpen(false)} title={form.id ? labels.edit : labels.create}
        footer={<div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setOpen(false)}>{labels.cancel}</button>
          <button className="btn-primary" disabled={pending} onClick={submit}>
            {pending && <ShdSpinner size={16} />} {labels.save}
          </button>
        </div>}
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">รหัส *</label><input className="input" value={form.code} onChange={(e) => set('code', e.target.value)} /></div>
          <div><label className="label">ประเภท</label>
            <select className="input" value={form.kind} onChange={(e) => set('kind', e.target.value)}>
              <option value="cash">เงินสด</option><option value="bank">ธนาคาร</option>
              <option value="e_wallet">e-Wallet</option><option value="credit_card">บัตรเครดิต</option><option value="cheque">เช็ค</option>
            </select>
          </div>
          <div className="col-span-2"><label className="label">ชื่อ *</label><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
          <div><label className="label">ธนาคาร</label><input className="input" value={form.bank_name || ''} onChange={(e) => set('bank_name', e.target.value)} /></div>
          <div><label className="label">เลขที่บัญชี</label><input className="input" value={form.account_no || ''} onChange={(e) => set('account_no', e.target.value)} /></div>
          <div className="col-span-2"><label className="label">ผูกบัญชีแยกประเภท</label>
            <select className="input" value={form.account_id || ''} onChange={(e) => set('account_id', e.target.value)}>
              <option value="">— ไม่ระบุ —</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>
          <div><label className="label">ยอดยกมา</label><input type="number" step="0.01" className="input num" value={form.opening_balance} onChange={(e) => set('opening_balance', e.target.value)} /></div>
        </div>
      </SlidePanel>
    </>
  );
}
