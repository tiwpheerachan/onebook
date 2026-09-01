'use client';
import { useState, useTransition } from 'react';
import type { Dictionary } from '@/i18n';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { updateCompanyProfile } from '@/actions/settings';

/**
 * แก้ไขข้อมูลบริษัทที่จะไปปรากฏบนหัวกระดาษของเอกสารที่ออกให้ลูกค้า
 * ข้อมูลชุดนี้กฎหมายบังคับให้แสดงบนใบกำกับภาษี จึงมีคำอธิบายกำกับไว้ทุกช่อง
 */
export function CompanyProfileEditor({
  row, canEdit, d,
}: { row: any; canEdit: boolean; d: Dictionary }) {
  const L = d.ui.master;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(row);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  if (!canEdit) return null;

  function submit() {
    setErr('');
    start(async () => {
      const res = await updateCompanyProfile(form);
      if (!res.ok) { setErr(res.error || ''); return; }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        title={L.docProfile}
        onClick={() => { setForm(row); setErr(''); setOpen(true); }}
        className="rounded p-1 text-ink-400 hover:bg-brand-50 hover:text-brand-600"
      >
        <Pencil className="h-4 w-4" strokeWidth={1.8} />
      </button>

      <SlidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={`${L.docProfileOf} · ${row.code}`}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setOpen(false)}>{d.common.cancel}</button>
            <button className="btn-primary" disabled={pending} onClick={submit}>
              {pending && <ShdSpinner size={16} />} บันทึก
            </button>
          </div>
        }
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}

        <p className="section-title mb-3">{L.legalNote}</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">{L.companyNameTh} *</label>
            <input className="input" value={form.name_th || ''} onChange={(e) => set('name_th', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="label">{L.companyNameEn}</label>
            <input className="input" value={form.name_en || ''} onChange={(e) => set('name_en', e.target.value)} />
          </div>
          <div>
            <label className="label">{L.taxId}</label>
            <input className="input font-mono" maxLength={13} value={form.tax_id || ''}
              onChange={(e) => set('tax_id', e.target.value.replace(/\D/g, ''))} />
            <p className="mt-1 text-xxs text-ink-400">{L.taxIdHint}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">{L.branchCode}</label>
              <input className="input font-mono" maxLength={5} value={form.branch_code || ''}
                onChange={(e) => set('branch_code', e.target.value.replace(/\D/g, ''))} />
            </div>
            <div>
              <label className="label">{L.branchName}</label>
              <input className="input" value={form.branch_name || ''} onChange={(e) => set('branch_name', e.target.value)} />
            </div>
          </div>
          <div className="col-span-2">
            <label className="label">{L.registeredAddress}</label>
            <textarea className="input min-h-[4.5rem]" value={form.address_th || ''} onChange={(e) => set('address_th', e.target.value)} />
          </div>
          <div><label className="label">{L.phone}</label>
            <input className="input" value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} /></div>
          <div><label className="label">{L.email}</label>
            <input className="input" value={form.email || ''} onChange={(e) => set('email', e.target.value)} /></div>
          <div><label className="label">{L.website}</label>
            <input className="input" value={form.website || ''} onChange={(e) => set('website', e.target.value)} /></div>
          <div><label className="label">{L.logoUrl}</label>
            <input className="input" placeholder="https://…" value={form.logo_url || ''} onChange={(e) => set('logo_url', e.target.value)} /></div>
        </div>

        <p className="section-title mb-3 mt-6">{L.payChannels}</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">{L.promptPay}</label>
            <input className="input font-mono" value={form.promptpay_id || ''}
              onChange={(e) => set('promptpay_id', e.target.value)} placeholder={L.phPromptPay} />
            <p className="mt-1 text-xxs text-ink-400">
              กรอกแล้วระบบจะพิมพ์ QR พร้อมเพย์ระบุยอดค้างชำระให้ลูกค้าสแกนจ่ายได้ทันที
              — รองรับเบอร์โทร 10 หลัก เลขผู้เสียภาษี 13 หลัก และ e-Wallet 15 หลัก
            </p>
          </div>
          <div><label className="label">{L.bank}</label>
            <input className="input" value={form.bank_name || ''} onChange={(e) => set('bank_name', e.target.value)} placeholder={L.phBank} /></div>
          <div><label className="label">{L.bankAccountNo}</label>
            <input className="input font-mono" value={form.bank_account_no || ''} onChange={(e) => set('bank_account_no', e.target.value)} /></div>
          <div className="col-span-2"><label className="label">{L.bankAccountName}</label>
            <input className="input" value={form.bank_account_name || ''} onChange={(e) => set('bank_account_name', e.target.value)} /></div>
        </div>

        <p className="section-title mb-3 mt-6">{L.footerSection}</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><label className="label">{L.signatory}</label>
            <input className="input" value={form.authorized_signer || ''} onChange={(e) => set('authorized_signer', e.target.value)}
              placeholder={L.phSignatory} /></div>
          <div className="col-span-2"><label className="label">{L.footerText}</label>
            <input className="input" value={form.doc_footer_note || ''} onChange={(e) => set('doc_footer_note', e.target.value)}
              placeholder={L.phFooter} /></div>
        </div>

        <p className="section-title mb-3 mt-6">{d.ui.match.settingsTitle}</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">{d.ui.match.enforce}</label>
            <select className="input" value={form.match_enforce || 'warn'}
                    onChange={(e) => set('match_enforce', e.target.value)}>
              <option value="off">{d.ui.match.enforceOff}</option>
              <option value="warn">{d.ui.match.enforceWarn}</option>
              <option value="block">{d.ui.match.enforceBlock}</option>
            </select>
            <p className="mt-1 text-xxs leading-relaxed text-ink-400">{d.ui.match.enforceHint}</p>
          </div>
          <div>
            <label className="label">{d.ui.match.qtyTol}</label>
            <input type="number" min={0} step="0.1" className="input num"
                   value={form.match_qty_tolerance_pct ?? 0}
                   onChange={(e) => set('match_qty_tolerance_pct', e.target.value)} />
          </div>
          <div>
            <label className="label">{d.ui.match.priceTol}</label>
            <input type="number" min={0} step="0.1" className="input num"
                   value={form.match_price_tolerance_pct ?? 0}
                   onChange={(e) => set('match_price_tolerance_pct', e.target.value)} />
          </div>
          <p className="col-span-2 -mt-2 text-xxs text-ink-400">{d.ui.match.tolHint}</p>
        </div>

        <p className="section-title mb-3 mt-6">{d.ui.budget.settingsTitle}</p>
        <div>
          <label className="label">{d.ui.budget.enforce}</label>
          <select className="input" value={form.budget_enforce || 'warn'}
                  onChange={(e) => set('budget_enforce', e.target.value)}>
            <option value="off">{d.ui.budget.enforceOff}</option>
            <option value="warn">{d.ui.budget.enforceWarn}</option>
            <option value="block">{d.ui.budget.enforceBlock}</option>
          </select>
          <p className="mt-1 text-xxs leading-relaxed text-ink-400">{d.ui.budget.enforceHint}</p>
        </div>
      </SlidePanel>
    </>
  );
}
