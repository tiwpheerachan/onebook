'use client';
import { useState } from 'react';
import {
  CalendarDays, AlertTriangle, Inbox, SlidersHorizontal, ChevronLeft, ChevronRight, ChevronDown, User,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { TASK_KIND } from '@/lib/task-meta';
import { KindDot, dayKey, type Member } from './task-bits';
import type { TaskRow } from './task-workspace';

const TH_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const TH_DOW = ['อา','จ','อ','พ','พฤ','ศ','ส'];

const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeek = (d: Date) => addDays(d, -d.getDay());
const sameDay = (a: Date, b: Date) => dayKey(a) === dayKey(b);

interface SectionProps {
  icon: React.ReactNode;
  label: string;
  badge?: number;
  badgeTone?: 'danger' | 'muted';
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/** หัวข้อในแถบซ้าย พับเก็บได้ทีละส่วน */
function Section({ icon, label, badge, badgeTone = 'muted', defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-ink-100 last:border-b-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition hover:bg-ink-50"
      >
        <span className="text-ink-400">{icon}</span>
        <span className="flex-1 text-sm font-medium text-ink-800">{label}</span>
        {badge != null && badge > 0 && (
          <span
            className={cn(
              'rounded-full px-1.5 text-xxs font-semibold tabular-nums',
              badgeTone === 'danger' ? 'bg-rose-600 text-white' : 'bg-ink-200 text-ink-700'
            )}
          >
            {badge}
          </span>
        )}
        <ChevronDown className={cn('h-3.5 w-3.5 text-ink-400 transition', !open && '-rotate-90')} strokeWidth={2} />
      </button>
      {open && <div className="px-4 pb-3.5">{children}</div>}
    </div>
  );
}

/**
 * แถบนำทางฝั่งซ้ายของหน้าตารางงาน
 * รวมปฏิทินเดือน งานตกหล่น งานที่ยังไม่กำหนดวัน และตัวกรองไว้ในที่เดียว
 */
export function TaskRail({
  anchor, byDay, overdue, undated, members,
  kinds, setKinds, assignee, setAssignee, hideDone, setHideDone,
  onPickDate, onOpenTask, currentUserId,
}: {
  anchor: Date;
  byDay: Map<string, TaskRow[]>;
  overdue: TaskRow[];
  undated: TaskRow[];
  members: Member[];
  kinds: string[];
  setKinds: (v: string[]) => void;
  assignee: string;
  setAssignee: (v: string) => void;
  hideDone: boolean;
  setHideDone: (v: boolean) => void;
  onPickDate: (d: Date) => void;
  onOpenTask: (id: string) => void;
  currentUserId: string;
}) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(startOfWeek(first), i));
  const today = new Date();

  return (
    <nav className="card sticky top-20 divide-y divide-ink-100 overflow-hidden">
      {/* ปุ่มลัด : งานของฉัน */}
      <div className="flex gap-1 p-2">
        <button
          onClick={() => setAssignee('')}
          className={cn(
            'flex-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition',
            assignee === '' ? 'bg-brand-600 text-white' : 'text-ink-600 hover:bg-ink-100'
          )}
        >
          ทั้งทีม
        </button>
        <button
          onClick={() => setAssignee(currentUserId)}
          className={cn(
            'flex-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition',
            assignee === currentUserId ? 'bg-brand-600 text-white' : 'text-ink-600 hover:bg-ink-100'
          )}
        >
          <User className="mr-1 inline h-3 w-3" strokeWidth={2} />
          งานของฉัน
        </button>
      </div>

      <Section icon={<CalendarDays className="h-4 w-4" strokeWidth={1.8} />} label={`${TH_MONTHS[anchor.getMonth()]} ${anchor.getFullYear() + 543}`}>
        <div className="mb-2 flex justify-end gap-0.5">
          <button
            onClick={() => { const d = new Date(anchor); d.setMonth(d.getMonth() - 1); onPickDate(d); }}
            className="rounded p-1 text-ink-400 hover:bg-ink-100"
          >
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
          <button onClick={() => onPickDate(new Date())} className="rounded px-1.5 text-xxs text-ink-500 hover:bg-ink-100">
            วันนี้
          </button>
          <button
            onClick={() => { const d = new Date(anchor); d.setMonth(d.getMonth() + 1); onPickDate(d); }}
            className="rounded p-1 text-ink-400 hover:bg-ink-100"
          >
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-y-1 text-center">
          {TH_DOW.map((d) => <span key={d} className="text-xxs font-medium text-ink-400">{d}</span>)}
          {cells.map((d) => {
            const out = d.getMonth() !== anchor.getMonth();
            const on = sameDay(d, anchor);
            const isToday = sameDay(d, today);
            const n = byDay.get(dayKey(d))?.length || 0;
            return (
              <button
                key={dayKey(d)}
                onClick={() => onPickDate(d)}
                title={n ? `${n} งาน` : undefined}
                className={cn(
                  'relative mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs transition',
                  out ? 'text-ink-300' : 'text-ink-700 hover:bg-ink-100',
                  isToday && !on && 'font-semibold text-brand-700',
                  on && 'bg-brand-600 font-semibold text-white hover:bg-brand-600'
                )}
              >
                {d.getDate()}
                {n > 0 && !on && <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-brand-500" />}
              </button>
            );
          })}
        </div>
      </Section>

      <Section
        icon={<AlertTriangle className={cn('h-4 w-4', overdue.length > 0 && 'text-rose-500')} strokeWidth={1.8} />}
        label="งานตกหล่น"
        badge={overdue.length}
        badgeTone="danger"
      >
        {overdue.length === 0 ? (
          <p className="text-xs text-ink-400">ไม่มีงานเลยกำหนด</p>
        ) : (
          <ul className="-mx-2 space-y-0.5">
            {overdue.slice(0, 8).map((t) => (
              <li key={t.id}>
                <button onClick={() => onOpenTask(t.id)} className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-rose-50">
                  <p className="truncate text-xs font-medium text-ink-800">{t.title}</p>
                  <p className="mt-0.5 text-xxs text-rose-600">
                    เลยมา {Math.max(1, Math.floor((Date.now() - new Date(t.due_at!).getTime()) / 86400000))} วัน
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        icon={<Inbox className="h-4 w-4" strokeWidth={1.8} />}
        label="ยังไม่กำหนดวัน"
        badge={undated.length}
        defaultOpen={false}
      >
        {undated.length === 0 ? (
          <p className="text-xs text-ink-400">ทุกงานมีกำหนดแล้ว</p>
        ) : (
          <ul className="-mx-2 space-y-0.5">
            {undated.slice(0, 8).map((t) => (
              <li key={t.id}>
                <button onClick={() => onOpenTask(t.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-ink-50">
                  <KindDot kind={t.kind} />
                  <span className="truncate text-xs text-ink-800">{t.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section icon={<SlidersHorizontal className="h-4 w-4" strokeWidth={1.8} />} label="ตัวกรอง">
        <p className="section-title mb-2">ประเภทงาน</p>
        <ul className="space-y-1.5">
          {TASK_KIND.map((k) => (
            <li key={k.key}>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-300"
                  checked={kinds.includes(k.key)}
                  onChange={(e) =>
                    setKinds(e.target.checked ? [...kinds, k.key] : kinds.filter((x) => x !== k.key))
                  }
                />
                <span className={cn('h-2.5 w-2.5 rounded-full', k.swatch)} />
                {k.label}
              </label>
            </li>
          ))}
        </ul>

        <p className="section-title mb-2 mt-4">ผู้รับผิดชอบ</p>
        <select className="input py-1.5 text-sm" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">ทุกคน</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>

        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-300"
            checked={hideDone}
            onChange={(e) => setHideDone(e.target.checked)}
          />
          ซ่อนงานที่เสร็จแล้ว
        </label>
      </Section>
    </nav>
  );
}
