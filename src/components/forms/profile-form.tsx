'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { LOCALE_LABEL, LOCALES } from '@/i18n/config';
import { updateMyProfile } from '@/actions/profile';

export function ProfileForm({
  fullName, phone, locale,
}: {
  fullName: string;
  phone: string | null;
  locale: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState({ full_name: fullName, phone: phone || '', locale });
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const set = (k: string, v: string) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false); };

  function submit() {
    setErr('');
    start(async () => {
      const res = await updateMyProfile(form);
      if (!res.ok) { setErr(res.error || 'บันทึกไม่สำเร็จ'); return; }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-ink-900">ข้อมูลของฉัน</h2>
      <p className="mt-0.5 text-xs text-ink-500">แก้ได้เฉพาะข้อมูลส่วนตัว ส่วนสิทธิ์และบริษัทต้องให้ผู้ดูแลเป็นคนกำหนด</p>

      {err && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">ชื่อ-นามสกุล *</label>
          <input className="input" value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
        </div>
        <div>
          <label className="label">เบอร์โทร</label>
          <input className="input" placeholder="081-234-5678" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </div>
        <div>
          <label className="label">ภาษาที่ใช้แสดงผล</label>
          <select className="input" value={form.locale} onChange={(e) => set('locale', e.target.value)}>
            {LOCALES.map((l) => <option key={l} value={l}>{LOCALE_LABEL[l]}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button className="btn-primary" disabled={pending} onClick={submit}>
          {pending && <ShdSpinner size={16} />} บันทึก
        </button>
        {saved && !pending && (
          <span className="flex items-center gap-1 text-xs text-emerald-600">
            <Check className="h-3.5 w-3.5" strokeWidth={2.2} /> บันทึกแล้ว
          </span>
        )}
      </div>
    </div>
  );
}
