'use client';
import { useState, useTransition } from 'react';
import { useI18n } from '@/i18n/provider';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { createCompany } from '@/actions/settings';

export function CompanyManager({
  isGroupAdmin, parents,
}: { isGroupAdmin: boolean; parents: { code: string; name: string }[] }) {
  const { dict: d } = useI18n();
  const L = d.ui.companyMgr;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ code: '', name_th: '', name_en: '', name_zh: '', tax_id: '', parent_code: '' });
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  if (!isGroupAdmin) return null;

  function submit() {
    setErr('');
    if (!form.code || !form.name_th) { setErr(L.needCodeName); return; }
    start(async () => {
      const res = await createCompany(form);
      if (!res.ok) { setErr(res.error || ''); return; }
      setOpen(false); router.refresh();
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary"><Plus className="h-4 w-4" /> {L.newCompany}</button>
      <SlidePanel open={open} onClose={() => setOpen(false)} title={L.newInGroup}
        footer={<div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setOpen(false)}>{d.common.cancel}</button>
          <button className="btn-primary" disabled={pending} onClick={submit}>
            {pending && <ShdSpinner size={16} />} สร้างบริษัท
          </button>
        </div>}
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">{L.code} *</label><input className="input" value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} /></div>
          <div><label className="label">{L.parent}</label>
            <select className="input" value={form.parent_code} onChange={(e) => set('parent_code', e.target.value)}>
              <option value="">{L.noParent}</option>
              {parents.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}
            </select>
          </div>
          <div className="col-span-2"><label className="label">{L.nameTh} *</label><input className="input" value={form.name_th} onChange={(e) => set('name_th', e.target.value)} /></div>
          <div><label className="label">{L.nameEn}</label><input className="input" value={form.name_en} onChange={(e) => set('name_en', e.target.value)} /></div>
          <div><label className="label">{L.nameZh}</label><input className="input" value={form.name_zh} onChange={(e) => set('name_zh', e.target.value)} /></div>
          <div className="col-span-2"><label className="label">{L.taxId}</label>
            <input className="input" maxLength={13} value={form.tax_id} onChange={(e) => set('tax_id', e.target.value.replace(/\D/g, ''))} /></div>
        </div>
        <p className="mt-4 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
          ระบบจะสร้างผังบัญชีมาตรฐานไทย บทบาทมาตรฐาน 7 บทบาท และรูปแบบเลขที่เอกสารให้อัตโนมัติ
        </p>
      </SlidePanel>
    </>
  );
}
