'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from '@/components/forms/slide-panel';
import { Avatar, type Member } from './task-bits';
import { TASK_KIND, TASK_PRIORITY } from '@/lib/task-meta';
import { saveTask } from '@/actions/tasks';

/** กล่องสร้างงานใหม่ — กรอกเท่าที่จำเป็น ที่เหลือไปเพิ่มในแผงรายละเอียดได้ */
export function TaskCreate({
  defaultDate, members, onClose,
}: {
  /** วันที่ตั้งต้น รูปแบบ YYYY-MM-DD */
  defaultDate: string;
  members: Member[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<any>({
    title: '',
    kind: 'task',
    priority: 'normal',
    description: '',
    due_date: defaultDate,
    due_time: '17:00',
    all_day: true,
  });
  const [assignees, setAssignees] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  function submit() {
    setErr('');
    if (!form.title.trim()) { setErr('กรุณาระบุชื่องาน'); return; }

    const time = form.all_day ? '17:00' : form.due_time || '17:00';
    const due = form.due_date ? new Date(`${form.due_date}T${time}`).toISOString() : '';

    start(async () => {
      const res = await saveTask(
        {
          title: form.title,
          description: form.description,
          kind: form.kind,
          priority: form.priority,
          status: 'todo',
          all_day: form.all_day,
          due_at: due,
        },
        assignees
      );
      if (!res.ok) { setErr(res.error || ''); return; }
      onClose();
      router.refresh();
    });
  }

  return (
    <SlidePanel
      open
      onClose={onClose}
      title="สร้างงานใหม่"
      footer={
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" disabled={pending} onClick={submit}>
            {pending && <ShdSpinner size={16} />} สร้างงาน
          </button>
        </div>
      }
    >
      {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}

      <div className="space-y-4">
        <div>
          <label className="label">ชื่องาน *</label>
          <input
            autoFocus
            className="input"
            placeholder="เช่น ตามเก็บเงินลูกค้า / เตรียมเอกสารยื่นภาษี"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
        </div>

        <div>
          <label className="label">ประเภทงาน</label>
          <div className="flex flex-wrap gap-1.5">
            {TASK_KIND.map((k) => (
              <button
                key={k.key}
                onClick={() => set('kind', k.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition',
                  form.kind === k.key ? k.block + ' font-medium' : 'border-ink-200 text-ink-500 hover:bg-ink-50'
                )}
              >
                <span className={cn('h-2 w-2 rounded-full', k.bar)} />
                {k.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">ความสำคัญ</label>
          <div className="flex flex-wrap gap-1.5">
            {TASK_PRIORITY.map((p) => (
              <button
                key={p.key}
                onClick={() => set('priority', p.key)}
                className={cn(
                  'rounded-lg px-2.5 py-1.5 text-xs ring-1 ring-inset transition',
                  form.priority === p.key ? p.chip + ' font-medium' : 'bg-white text-ink-500 ring-ink-200 hover:bg-ink-50'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">ครบกำหนด</label>
            <input type="date" className="input" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} />
          </div>
          <div>
            <label className="label">เวลา</label>
            <input
              type="time"
              className="input"
              disabled={form.all_day}
              value={form.due_time}
              onChange={(e) => set('due_time', e.target.value)}
            />
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-300"
            checked={form.all_day}
            onChange={(e) => set('all_day', e.target.checked)}
          />
          ทั้งวัน (ไม่ระบุเวลา)
        </label>

        <div>
          <label className="label">มอบหมายให้</label>
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => {
              const on = assignees.includes(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => setAssignees((a) => (on ? a.filter((x) => x !== m.id) : [...a, m.id]))}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-xs ring-1 ring-inset transition',
                    on ? 'bg-brand-50 text-brand-800 ring-brand-300' : 'bg-white text-ink-500 ring-ink-200 hover:bg-ink-50'
                  )}
                >
                  <Avatar name={m.name} size={20} />
                  {m.name}
                </button>
              );
            })}
          </div>
          {members.length === 0 && (
            <p className="text-xxs text-ink-400">ยังไม่มีผู้ใช้อื่นในบริษัทนี้ เพิ่มได้ที่ ตั้งค่า → ผู้ใช้งาน</p>
          )}
        </div>

        <div>
          <label className="label">รายละเอียด</label>
          <textarea
            className="input min-h-[4.5rem]"
            placeholder="สิ่งที่ต้องทำ ข้อมูลที่ต้องใช้ หรือผลลัพธ์ที่คาดหวัง"
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
          />
        </div>
      </div>
    </SlidePanel>
  );
}
