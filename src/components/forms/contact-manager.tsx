'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { saveContact, getContact } from '@/actions/master';
import { isValidThaiTaxId } from '@/lib/format';

const blank = {
  id: null as string | null, code: '', kind: 'customer', name: '', name_en: '', tax_id: '',
  branch_code: '00000', branch_name: '', is_juristic: true,
  address: '', district: '', province: '', postcode: '', phone: '', email: '',
  contact_person: '', credit_days: 30, credit_limit: 0, is_active: true,
  sales_rep_id: '', sales_zone_id: '',
  linked_company_id: '', intercompany_markup_pct: '',
  is_kol: false, kol_platform: '', kol_handle: '', kol_brands: '', kol_note: '',
  bank_name: '', bank_account_name: '', bank_account_no: '',
  doc_id_card: false, doc_bank_book: false, default_wht_code: '', default_wht_rate: '',
};

const KOL_PLATFORMS = ['TikTok', 'Instagram', 'Facebook', 'YouTube', 'Lemon8', 'X (Twitter)', 'อื่น ๆ'];

export function ContactManager({
  canCreate, canEdit, editRow, labels, reps = [], zones = [], companies = [],
}: {
  canCreate: boolean; canEdit: boolean; editRow?: any;
  labels: Record<string, string>;
  /** ตัวเลือกพนักงานขายและเขต — ว่างได้ถ้าบริษัทยังไม่ได้ตั้ง */
  reps?: { id: string; label: string }[];
  zones?: { id: string; label: string }[];
  /** บริษัทอื่นในเครือ (ไม่รวมบริษัทปัจจุบัน) — ใช้ผูกขายข้ามบริษัท */
  companies?: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(blank);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  function openNew() { setForm({ ...blank }); setErr(''); setOpen(true); }
  function openEdit() {
    setForm({ ...blank, ...editRow }); setErr(''); setOpen(true);
    // โหลดข้อมูลเต็ม (ตารางส่งมาแค่บางฟิลด์) กันฟิลด์อื่นถูกล้างตอนบันทึก
    if (editRow?.id) {
      getContact(editRow.id).then((res) => {
        if (res.ok && res.data) setForm((f: any) => ({ ...blank, ...res.data }));
      });
    }
  }

  function set(k: string, v: any) { setForm((f: any) => ({ ...f, [k]: v })); }

  function submit() {
    setErr('');
    if (!form.code || !form.name) { setErr(labels.required); return; }
    if (form.tax_id && !isValidThaiTaxId(form.tax_id)) { setErr(labels.badTaxId); return; }
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
          <Field label={`${labels.code} *`}><input className="input" value={form.code} onChange={(e) => set('code', e.target.value)} /></Field>
          <Field label={labels.kind}>
            <select className="input" value={form.kind} onChange={(e) => set('kind', e.target.value)}>
              <option value="customer">{labels.kindCustomer}</option>
              <option value="vendor">{labels.kindVendor}</option>
              <option value="both">{labels.kindBoth}</option>
            </select>
          </Field>
          <Field label={`${labels.nameTh} *`} span><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label={labels.nameEn} span><input className="input" value={form.name_en || ''} onChange={(e) => set('name_en', e.target.value)} /></Field>
          <Field label={labels.taxId}>
            <input className="input" maxLength={13} value={form.tax_id || ''} onChange={(e) => set('tax_id', e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field label={labels.entityType}>
            <select className="input" value={form.is_juristic ? '1' : '0'} onChange={(e) => set('is_juristic', e.target.value === '1')}>
              <option value="1">{labels.juristic}</option>
              <option value="0">{labels.individual}</option>
            </select>
          </Field>
          <Field label={labels.branchCode}><input className="input" value={form.branch_code || ''} onChange={(e) => set('branch_code', e.target.value)} /></Field>
          <Field label={labels.branchName}><input className="input" value={form.branch_name || ''} onChange={(e) => set('branch_name', e.target.value)} /></Field>
          <Field label={labels.address} span><textarea rows={2} className="input" value={form.address || ''} onChange={(e) => set('address', e.target.value)} /></Field>
          <Field label={labels.district}><input className="input" value={form.district || ''} onChange={(e) => set('district', e.target.value)} /></Field>
          <Field label={labels.province}><input className="input" value={form.province || ''} onChange={(e) => set('province', e.target.value)} /></Field>
          <Field label={labels.postcode}><input className="input" value={form.postcode || ''} onChange={(e) => set('postcode', e.target.value)} /></Field>
          <Field label={labels.phone}><input className="input" value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label={labels.email} span><input className="input" value={form.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label={labels.creditDays}><input type="number" className="input" value={form.credit_days} onChange={(e) => set('credit_days', e.target.value)} /></Field>
          {/* ผู้ดูแลลูกค้ารายนี้ — เอกสารใหม่จะรับค่านี้ไปแล้วตรึงไว้
              เปลี่ยนผู้ดูแลภายหลังจึงไม่ทำให้ยอดขายย้อนหลังย้ายตาม */}
          {reps.length > 0 && (
            <Field label={labels.salesRep}>
              <select className="input" value={form.sales_rep_id || ''}
                      onChange={(e) => set('sales_rep_id', e.target.value)}>
                <option value="">— {labels.unassigned} —</option>
                {reps.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </Field>
          )}
          {zones.length > 0 && (
            <Field label={labels.salesZone}>
              <select className="input" value={form.sales_zone_id || ''}
                      onChange={(e) => set('sales_zone_id', e.target.value)}>
                <option value="">— {labels.unassigned} —</option>
                {zones.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
              </select>
            </Field>
          )}
          <Field label={labels.creditLimit}>
            <input type="number" className="input" value={form.credit_limit}
                   onChange={(e) => set('credit_limit', e.target.value)} />
            {/* 0 = ไม่จำกัด ต้องบอกให้ชัด ไม่งั้นคนตั้ง 0 โดยเข้าใจว่าห้ามขายเชื่อ */}
            <p className="mt-1 text-xxs leading-relaxed text-ink-400">{labels.creditHint}</p>
          </Field>

          {/* ===== ขายข้ามบริษัท (inter-company) ===== */}
          {companies.length > 0 && form.kind !== 'customer' && (
            <>
              <div className="col-span-2 mt-2 border-t border-ink-100 pt-3">
                <p className="text-xs font-semibold text-ink-700">ขายข้ามบริษัทอัตโนมัติ</p>
                <p className="mt-0.5 text-xxs leading-relaxed text-ink-400">
                  ถ้าผู้ขายรายนี้คือบริษัทในเครือ เมื่ออนุมัติใบซื้อ/ค่าใช้จ่ายจากรายนี้
                  ระบบจะออก “ใบกำกับภาษีขาย” (ฉบับร่าง) ให้บริษัทนั้นโดยอัตโนมัติ พร้อมบวกราคาตามที่ตั้ง
                </p>
              </div>
              <Field label="เป็นบริษัทในเครือ">
                <select className="input" value={form.linked_company_id || ''}
                        onChange={(e) => set('linked_company_id', e.target.value)}>
                  <option value="">— ไม่ใช่ (ผู้ขายภายนอก) —</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </Field>
              {form.linked_company_id && (
                <Field label="บวกราคาขาย (%)">
                  <input type="number" step="0.01" className="input"
                         placeholder="5"
                         value={form.intercompany_markup_pct ?? ''}
                         onChange={(e) => set('intercompany_markup_pct', e.target.value)} />
                  <p className="mt-1 text-xxs leading-relaxed text-ink-400">ว่าง = ใช้ค่าเริ่มต้น 5%</p>
                </Field>
              )}
            </>
          )}

          {/* ===== KOL / Influencer ===== */}
          {form.kind !== 'customer' && (
            <div className="col-span-2 mt-2 border-t border-ink-100 pt-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-ink-700">
                <input type="checkbox" className="h-4 w-4 rounded border-ink-300"
                       checked={!!form.is_kol} onChange={(e) => set('is_kol', e.target.checked)} />
                เป็น KOL / Influencer (ผู้รับงานรีวิว)
              </label>
              {form.is_kol && (
                <p className="mt-1 text-xxs leading-relaxed text-amber-700">
                  ⚠️ เป็นบุคคลธรรมดา — ระบบตั้งหัก ณ ที่จ่าย <b>3% (ค่าบริการ · ภ.ง.ด.3)</b> ให้อัตโนมัติ และควรกรอกเลขบัตร ปชช. 13 หลักในช่องเลขผู้เสียภาษี
                </p>
              )}
            </div>
          )}
          {form.is_kol && form.kind !== 'customer' && (
            <>
              <Field label="แพลตฟอร์มหลัก">
                <select className="input" value={form.kol_platform || ''}
                        onChange={(e) => set('kol_platform', e.target.value)}>
                  <option value="">— เลือก —</option>
                  {KOL_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="ชื่อ/ลิงก์ช่อง (@handle)">
                <input className="input" value={form.kol_handle || ''} onChange={(e) => set('kol_handle', e.target.value)} />
              </Field>
              <Field label="แบรนด์ที่เคยรับงาน" span>
                <input className="input" value={form.kol_brands || ''} onChange={(e) => set('kol_brands', e.target.value)}
                       placeholder="เช่น แบรนด์ A, แบรนด์ B" />
              </Field>
              <Field label="หมายเหตุ/เรตราคา" span>
                <textarea rows={2} className="input" value={form.kol_note || ''} onChange={(e) => set('kol_note', e.target.value)} />
              </Field>
              <Field label="หัก ณ ที่จ่าย (%)">
                <input type="number" step="0.01" className="input"
                       placeholder="3" value={form.default_wht_rate ?? ''}
                       onChange={(e) => set('default_wht_rate', e.target.value)} />
                <p className="mt-1 text-xxs leading-relaxed text-ink-400">ว่าง = 3% (ค่าบริการ)</p>
              </Field>
              <div className="col-span-2 grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 text-xs text-ink-600">
                  <input type="checkbox" className="h-4 w-4 rounded border-ink-300"
                         checked={!!form.doc_id_card} onChange={(e) => set('doc_id_card', e.target.checked)} />
                  เก็บสำเนาบัตรประชาชนแล้ว
                </label>
                <label className="flex items-center gap-2 text-xs text-ink-600">
                  <input type="checkbox" className="h-4 w-4 rounded border-ink-300"
                         checked={!!form.doc_bank_book} onChange={(e) => set('doc_bank_book', e.target.checked)} />
                  เก็บสำเนาบุ๊คธนาคารแล้ว
                </label>
              </div>
            </>
          )}

          {/* ข้อมูลบัญชีธนาคาร (ใช้กับ KOL/ผู้ขายที่ต้องโอนจ่าย) */}
          {form.kind !== 'customer' && (
            <>
              <Field label="ธนาคาร">
                <input className="input" value={form.bank_name || ''} onChange={(e) => set('bank_name', e.target.value)} />
              </Field>
              <Field label="เลขบัญชี">
                <input className="input" value={form.bank_account_no || ''}
                       onChange={(e) => set('bank_account_no', e.target.value.replace(/[^\d-]/g, ''))} />
              </Field>
              <Field label="ชื่อบัญชี" span>
                <input className="input" value={form.bank_account_name || ''} onChange={(e) => set('bank_account_name', e.target.value)} />
              </Field>
            </>
          )}
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
