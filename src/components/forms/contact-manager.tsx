'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { saveContact } from '@/actions/master';
import { isValidThaiTaxId } from '@/lib/format';

const blank = {
  id: null as string | null, code: '', kind: 'customer', name: '', name_en: '', tax_id: '',
  branch_code: '00000', branch_name: 'สำนักงานใหญ่', is_juristic: true,
  address: '', district: '', province: '', postcode: '', phone: '', email: '',
  contact_person: '', credit_days: 30, credit_limit: 0, is_active: true,
};

export function ContactManager({
  canCreate, canEdit, editRow, labels,
}: { canCreate: boolean; canEdit: boolean; editRow?: any; labels: Record<string, string> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(blank);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  function openNew() { setForm({ ...blank }); setErr(''); setOpen(true); }
  function openEdit() { setForm({ ...blank, ...editRow }); setErr(''); setOpen(true); }

  function set(k: string, v: any) { setForm((f: any) => ({ ...f, [k]: v })); }

  function submit() {
    setErr('');
    if (!form.code || !form.name) { setErr(labels.required); return; }
    if (form.tax_id && !isValidThaiTaxId(form.tax_id)) { setErr('เลขประจำตัวผู้เสียภาษีไม่ถูกต้อง (13 หลัก)'); return; }
    start(async () => {
      const res = await saveContact(form);
      if (!res.ok) { setErr(res.error || ''); return; }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      {editRow ? (
        canEdit && (
          <button onClick={openEdit} className="rounded p-1 text-ink-400 hover:bg-brand-50 hover:text-brand-600">
            <Pencil className="h-4 w-4" strokeWidth={1.8} />
          </button>
        )
      ) : (
        canCreate && (
          <button onClick={openNew} className="btn-primary">
            <Plus className="h-4 w-4" /> {labels.create}
          </button>
        )
      )}

      <SlidePanel
        open={open} onClose={() => setOpen(false)}
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
          <Field label="รหัส *"><input className="input" value={form.code} onChange={(e) => set('code', e.target.value)} /></Field>
          <Field label="ประเภท">
            <select className="input" value={form.kind} onChange={(e) => set('kind', e.target.value)}>
              <option value="customer">ลูกค้า</option>
              <option value="vendor">ผู้ขาย</option>
              <option value="both">ทั้งลูกค้าและผู้ขาย</option>
            </select>
          </Field>
          <Field label="ชื่อ (ไทย) *" span><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="ชื่อ (อังกฤษ)" span><input className="input" value={form.name_en || ''} onChange={(e) => set('name_en', e.target.value)} /></Field>
          <Field label="เลขประจำตัวผู้เสียภาษี">
            <input className="input" maxLength={13} value={form.tax_id || ''} onChange={(e) => set('tax_id', e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field label="รูปแบบ">
            <select className="input" value={form.is_juristic ? '1' : '0'} onChange={(e) => set('is_juristic', e.target.value === '1')}>
              <option value="1">นิติบุคคล (ภ.ง.ด.53)</option>
              <option value="0">บุคคลธรรมดา (ภ.ง.ด.3)</option>
            </select>
          </Field>
          <Field label="รหัสสาขา"><input className="input" value={form.branch_code || ''} onChange={(e) => set('branch_code', e.target.value)} /></Field>
          <Field label="ชื่อสาขา"><input className="input" value={form.branch_name || ''} onChange={(e) => set('branch_name', e.target.value)} /></Field>
          <Field label="ที่อยู่" span><textarea rows={2} className="input" value={form.address || ''} onChange={(e) => set('address', e.target.value)} /></Field>
          <Field label="อำเภอ/เขต"><input className="input" value={form.district || ''} onChange={(e) => set('district', e.target.value)} /></Field>
          <Field label="จังหวัด"><input className="input" value={form.province || ''} onChange={(e) => set('province', e.target.value)} /></Field>
          <Field label="รหัสไปรษณีย์"><input className="input" value={form.postcode || ''} onChange={(e) => set('postcode', e.target.value)} /></Field>
          <Field label="โทรศัพท์"><input className="input" value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="อีเมล" span><input className="input" value={form.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="เครดิต (วัน)"><input type="number" className="input" value={form.credit_days} onChange={(e) => set('credit_days', e.target.value)} /></Field>
          <Field label={labels.creditLimit}>
            <input type="number" className="input" value={form.credit_limit}
                   onChange={(e) => set('credit_limit', e.target.value)} />
            {/* 0 = ไม่จำกัด ต้องบอกให้ชัด ไม่งั้นคนตั้ง 0 โดยเข้าใจว่าห้ามขายเชื่อ */}
            <p className="mt-1 text-xxs leading-relaxed text-ink-400">{labels.creditHint}</p>
          </Field>
        </div>
      </SlidePanel>
    </>
  );
}

function Field({ label, children, span }: { label: string; children: React.ReactNode; span?: boolean }) {
  return (
    <div className={span ? 'col-span-2' : ''}>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
