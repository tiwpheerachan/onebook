'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Unlock } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { lockPeriod, releasePeriod } from '@/actions/settings';

export function PeriodLockManager({
  canLock, canUnlock, releaseId,
}: { canLock: boolean; canUnlock: boolean; releaseId?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ locked_through: '', scope: 'all', reason: '' });
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  if (releaseId) {
    if (!canUnlock) return null;
    return (
      <button
        disabled={pending}
        onClick={() => {
          if (!confirm('ยืนยันปลดล็อกงวดนี้? การกระทำนี้จะถูกบันทึกใน audit log')) return;
          start(async () => { await releasePeriod(releaseId); router.refresh(); });
        }}
        className="btn-ghost text-xs text-rose-600"
      >
        <Unlock className="h-3.5 w-3.5" /> ปลดล็อก
      </button>
    );
  }

  if (!canLock) return null;

  function submit() {
    setErr('');
    if (!form.locked_through) { setErr('กรุณาระบุวันที่ปิดงวด'); return; }
    start(async () => {
      const res = await lockPeriod(form);
      if (!res.ok) { setErr(res.error || ''); return; }
      setOpen(false); router.refresh();
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary"><Lock className="h-4 w-4" /> ปิดงวด (Freeze)</button>
      <SlidePanel open={open} onClose={() => setOpen(false)} title="ปิดงวดบัญชี (Freeze)"
        footer={<div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setOpen(false)}>ยกเลิก</button>
          <button className="btn-danger" disabled={pending} onClick={submit}>
            {pending && <ShdSpinner size={16} />} ยืนยันปิดงวด
          </button>
        </div>}
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}
        <div className="space-y-4">
          <div><label className="label">ปิดงวดถึงวันที่ *</label>
            <input type="date" className="input" value={form.locked_through}
                   onChange={(e) => setForm({ ...form, locked_through: e.target.value })} /></div>
          <div><label className="label">ขอบเขต</label>
            <select className="input" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
              <option value="all">ทุกโมดูล</option>
              <option value="sales">เฉพาะด้านรายรับ</option>
              <option value="purchase">เฉพาะด้านรายจ่าย</option>
              <option value="journal">เฉพาะสมุดรายวัน</option>
            </select></div>
          <div><label className="label">เหตุผล</label>
            <textarea rows={3} className="input" value={form.reason}
                      onChange={(e) => setForm({ ...form, reason: e.target.value })}
                      placeholder="เช่น ปิดงบประจำเดือน ส่งผู้สอบบัญชี" /></div>
          <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
            การปิดงวดบังคับใช้ที่ระดับฐานข้อมูล (trigger + RLS) หลังปิดงวดแล้ว
            ไม่สามารถสร้าง แก้ไข หรือลบเอกสารและสมุดรายวันที่มีวันที่ก่อนหรือเท่ากับวันที่กำหนดได้
            ยกเว้นผู้ที่มีสิทธิ์ &quot;ปลดล็อกงวด&quot; ทุกการกระทำจะถูกบันทึกไว้ในประวัติการใช้งาน
          </p>
        </div>
      </SlidePanel>
    </>
  );
}
