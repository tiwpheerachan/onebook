'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { saveDocSequence } from '@/actions/settings';

const CYCLES = [
  { v: 'monthly', l: 'รีเซ็ตทุกเดือน' },
  { v: 'yearly', l: 'รีเซ็ตทุกปี' },
  { v: 'never', l: 'ไม่รีเซ็ต (นับต่อไปเรื่อย ๆ)' },
];

const PATTERNS = [
  '{PREFIX}{YY}{MM}-{SEQ:4}',
  '{PREFIX}{YYYY}{MM}{SEQ:4}',
  '{PREFIX}-{YYYY}-{SEQ:5}',
  '{PREFIX}{SEQ:5}',
];

/** แทนค่าตัวอย่างให้ผู้ใช้เห็นผลลัพธ์จริงก่อนบันทึก — ตรรกะเดียวกับ next_doc_number ในฐานข้อมูล */
export function renderPattern(pattern: string, prefix: string, seq: number, at = new Date()): string {
  const yyyy = String(at.getFullYear());
  const mm = String(at.getMonth() + 1).padStart(2, '0');
  return pattern
    .replace(/\{PREFIX\}/g, prefix)
    .replace(/\{YYYY\}/g, yyyy)
    .replace(/\{YY\}/g, yyyy.slice(2))
    .replace(/\{MM\}/g, mm)
    .replace(/\{SEQ:4\}/g, String(seq).padStart(4, '0'))
    .replace(/\{SEQ:5\}/g, String(seq).padStart(5, '0'));
}

export function NumberingEditor({
  row, kindLabel, canEdit,
}: {
  row: { doc_kind: string; prefix: string; pattern: string; next_number: number; reset_cycle: string };
  kindLabel: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(row);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  if (!canEdit) return null;

  function submit() {
    setErr('');
    start(async () => {
      const res = await saveDocSequence(form);
      if (!res.ok) { setErr(res.error || ''); return; }
      setOpen(false);
      router.refresh();
    });
  }

  const preview = renderPattern(form.pattern || '', form.prefix || '', Number(form.next_number) || 1);

  return (
    <>
      <button
        title="แก้ไขรูปแบบเลขที่"
        onClick={() => { setForm(row); setErr(''); setOpen(true); }}
        className="rounded p-1 text-ink-400 hover:bg-brand-50 hover:text-brand-600"
      >
        <Pencil className="h-4 w-4" strokeWidth={1.8} />
      </button>

      <SlidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={`เลขที่เอกสาร · ${kindLabel}`}
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

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">อักษรนำหน้า *</label>
            <input className="input font-mono uppercase" maxLength={8} value={form.prefix || ''}
              onChange={(e) => set('prefix', e.target.value.toUpperCase())} />
          </div>
          <div>
            <label className="label">เลขลำดับถัดไป</label>
            <input type="number" min={1} className="input num" value={form.next_number}
              onChange={(e) => set('next_number', e.target.value)} />
          </div>

          <div className="col-span-2">
            <label className="label">รูปแบบ</label>
            <input className="input font-mono" value={form.pattern || ''} onChange={(e) => set('pattern', e.target.value)} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PATTERNS.map((p) => (
                <button key={p} type="button" onClick={() => set('pattern', p)}
                  className="rounded-md bg-ink-100 px-2 py-1 font-mono text-xxs text-ink-600 hover:bg-brand-50 hover:text-brand-700">
                  {p}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xxs leading-relaxed text-ink-400">
              ตัวแปรที่ใช้ได้ : <b>{'{PREFIX}'}</b> อักษรนำหน้า · <b>{'{YYYY}'}</b> ปี ค.ศ. 4 หลัก ·
              <b> {'{YY}'}</b> ปี 2 หลัก · <b>{'{MM}'}</b> เดือน · <b>{'{SEQ:4}'}</b> เลขลำดับ 4 หลัก ·
              <b> {'{SEQ:5}'}</b> เลขลำดับ 5 หลัก
            </p>
          </div>

          <div className="col-span-2">
            <label className="label">รอบการรีเซ็ตเลขลำดับ</label>
            <select className="input" value={form.reset_cycle} onChange={(e) => set('reset_cycle', e.target.value)}>
              {CYCLES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
            </select>
          </div>
        </div>

        <p className="mt-5 flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2.5 text-sm text-brand-800">
          <span>ตัวอย่างเลขที่ถัดไป</span>
          <b className="font-mono">{preview}</b>
        </p>
        <p className="mt-2 text-xxs leading-relaxed text-ink-400">
          เลขที่เอกสารต้องไม่ซ้ำกันในบริษัทเดียวกัน หากย้อนเลขลำดับกลับไปทับของเดิม ระบบจะแจ้งเตือนตอนบันทึกเอกสาร
        </p>
      </SlidePanel>
    </>
  );
}
