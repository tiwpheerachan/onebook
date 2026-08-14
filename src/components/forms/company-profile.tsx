'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { updateCompanyProfile } from '@/actions/settings';

/**
 * แก้ไขข้อมูลบริษัทที่จะไปปรากฏบนหัวกระดาษของเอกสารที่ออกให้ลูกค้า
 * ข้อมูลชุดนี้กฎหมายบังคับให้แสดงบนใบกำกับภาษี จึงมีคำอธิบายกำกับไว้ทุกช่อง
 */
export function CompanyProfileEditor({ row, canEdit }: { row: any; canEdit: boolean }) {
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
        title="แก้ไขข้อมูลบนเอกสาร"
        onClick={() => { setForm(row); setErr(''); setOpen(true); }}
        className="rounded p-1 text-ink-400 hover:bg-brand-50 hover:text-brand-600"
      >
        <Pencil className="h-4 w-4" strokeWidth={1.8} />
      </button>

      <SlidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={`ข้อมูลบนเอกสาร · ${row.code}`}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setOpen(false)}>ยกเลิก</button>
            <button className="btn-primary" disabled={pending} onClick={submit}>
              {pending && <ShdSpinner size={16} />} บันทึก
            </button>
          </div>
        }
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}

        <p className="section-title mb-3">ข้อมูลที่กฎหมายบังคับให้แสดงบนใบกำกับภาษี</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">ชื่อบริษัท (ไทย) *</label>
            <input className="input" value={form.name_th || ''} onChange={(e) => set('name_th', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="label">ชื่อบริษัท (อังกฤษ)</label>
            <input className="input" value={form.name_en || ''} onChange={(e) => set('name_en', e.target.value)} />
          </div>
          <div>
            <label className="label">เลขประจำตัวผู้เสียภาษี</label>
            <input className="input font-mono" maxLength={13} value={form.tax_id || ''}
              onChange={(e) => set('tax_id', e.target.value.replace(/\D/g, ''))} />
            <p className="mt-1 text-xxs text-ink-400">13 หลัก ระบบตรวจหลักตรวจสอบให้</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">รหัสสาขา</label>
              <input className="input font-mono" maxLength={5} value={form.branch_code || ''}
                onChange={(e) => set('branch_code', e.target.value.replace(/\D/g, ''))} />
            </div>
            <div>
              <label className="label">ชื่อสาขา</label>
              <input className="input" value={form.branch_name || ''} onChange={(e) => set('branch_name', e.target.value)} />
            </div>
          </div>
          <div className="col-span-2">
            <label className="label">ที่อยู่ (ตามที่จดทะเบียนภาษีมูลค่าเพิ่ม)</label>
            <textarea className="input min-h-[4.5rem]" value={form.address_th || ''} onChange={(e) => set('address_th', e.target.value)} />
          </div>
          <div><label className="label">โทรศัพท์</label>
            <input className="input" value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} /></div>
          <div><label className="label">อีเมล</label>
            <input className="input" value={form.email || ''} onChange={(e) => set('email', e.target.value)} /></div>
          <div><label className="label">เว็บไซต์</label>
            <input className="input" value={form.website || ''} onChange={(e) => set('website', e.target.value)} /></div>
          <div><label className="label">โลโก้ (URL รูปภาพ)</label>
            <input className="input" placeholder="https://…" value={form.logo_url || ''} onChange={(e) => set('logo_url', e.target.value)} /></div>
        </div>

        <p className="section-title mb-3 mt-6">ช่องทางรับชำระเงิน (พิมพ์บนใบแจ้งหนี้/ใบวางบิล)</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">หมายเลขพร้อมเพย์</label>
            <input className="input font-mono" value={form.promptpay_id || ''}
              onChange={(e) => set('promptpay_id', e.target.value)} placeholder="0812345678 หรือ 0105561000000" />
            <p className="mt-1 text-xxs text-ink-400">
              กรอกแล้วระบบจะพิมพ์ QR พร้อมเพย์ระบุยอดค้างชำระให้ลูกค้าสแกนจ่ายได้ทันที
              — รองรับเบอร์โทร 10 หลัก เลขผู้เสียภาษี 13 หลัก และ e-Wallet 15 หลัก
            </p>
          </div>
          <div><label className="label">ธนาคาร</label>
            <input className="input" value={form.bank_name || ''} onChange={(e) => set('bank_name', e.target.value)} placeholder="กสิกรไทย" /></div>
          <div><label className="label">เลขที่บัญชี</label>
            <input className="input font-mono" value={form.bank_account_no || ''} onChange={(e) => set('bank_account_no', e.target.value)} /></div>
          <div className="col-span-2"><label className="label">ชื่อบัญชี</label>
            <input className="input" value={form.bank_account_name || ''} onChange={(e) => set('bank_account_name', e.target.value)} /></div>
        </div>

        <p className="section-title mb-3 mt-6">ท้ายเอกสาร</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><label className="label">ผู้มีอำนาจลงนาม</label>
            <input className="input" value={form.authorized_signer || ''} onChange={(e) => set('authorized_signer', e.target.value)}
              placeholder="ชื่อที่จะพิมพ์ใต้ช่องลงนาม" /></div>
          <div className="col-span-2"><label className="label">ข้อความท้ายกระดาษ</label>
            <input className="input" value={form.doc_footer_note || ''} onChange={(e) => set('doc_footer_note', e.target.value)}
              placeholder="เช่น เงื่อนไขการชำระเงิน หรือข้อความขอบคุณลูกค้า" /></div>
        </div>
      </SlidePanel>
    </>
  );
}
