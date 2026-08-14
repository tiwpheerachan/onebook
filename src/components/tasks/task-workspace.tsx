'use client';
import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronLeft, ChevronRight, Plus, Search, CalendarDays, List, AlertTriangle, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { AvatarStack, KindDot, timeLabel, dayKey, type Member } from './task-bits';
import { TaskPanel, type TaskDetail } from './task-panel';
import { TaskCreate } from './task-create';
import { TaskRail } from './task-rail';
import {
  TASK_KIND, TASK_STATUS, kindMeta, statusMeta, priorityMeta, isOverdue, OPEN_STATUSES,
} from '@/lib/task-meta';

export interface TaskRow {
  id: string;
  code: string | null;
  title: string;
  description: string | null;
  kind: string;
  status: string;
  priority: string;
  start_at: string | null;
  due_at: string | null;
  progress: number;
  assignees: { id: string; name: string }[];
  comment_count: number;
  checklist_total: number;
  checklist_done: number;
  attachment_count: number;
}

type View = 'day' | 'week' | 'month' | 'list';

const TH_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const TH_DOW = ['อา','จ','อ','พ','พฤ','ศ','ส'];
const HOUR_FROM = 8;
const HOUR_TO = 20;
const HOUR_PX = 52;

const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeek = (d: Date) => addDays(d, -d.getDay());
const sameDay = (a: Date, b: Date) => dayKey(a) === dayKey(b);
const beYear = (d: Date) => d.getFullYear() + 543;

/** วันที่ใช้จัดวางงานบนปฏิทิน : ใช้วันเริ่ม ถ้าไม่มีก็ใช้วันครบกำหนด */
const anchorOf = (t: TaskRow) => t.start_at || t.due_at;

export function TaskWorkspace({
  tasks, undated, members, anchorDate, currentUserId, perms, detail, aiPanel,
}: {
  tasks: TaskRow[];
  /** งานที่ยังไม่ได้กำหนดวัน แสดงแยกไว้ไม่ให้ตกหล่น */
  undated: TaskRow[];
  members: Member[];
  anchorDate: string;
  currentUserId: string;
  perms: { create: boolean; edit: boolean; delete: boolean };
  detail: TaskDetail | null;
  /** แถบผู้ช่วยฝั่งขวา ส่งมาจากฝั่งเซิร์ฟเวอร์เพราะต้องเรียก AI */
  aiPanel: React.ReactNode;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const [view, setView] = useState<View>((params.get('view') as View) || 'week');
  const [q, setQ] = useState(params.get('q') || '');
  const [kinds, setKinds] = useState<string[]>(TASK_KIND.map((k) => k.key));
  const [assignee, setAssignee] = useState(params.get('u') || '');
  const [hideDone, setHideDone] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);
  const [navBusy, setNavBusy] = useState(false);

  const anchor = useMemo(() => new Date(anchorDate + 'T00:00:00'), [anchorDate]);

  function goDate(d: Date) {
    setNavBusy(true);
    const p = new URLSearchParams(params.toString());
    p.set('d', dayKey(d));
    router.push(`/tasks?${p.toString()}`, { scroll: false });
  }
  function openTask(id: string) {
    const p = new URLSearchParams(params.toString());
    p.set('t', id);
    router.push(`/tasks?${p.toString()}`, { scroll: false });
  }
  function closeTask() {
    const p = new URLSearchParams(params.toString());
    p.delete('t');
    router.push(`/tasks?${p.toString()}`, { scroll: false });
  }

  /* ───────── กรองงานตามตัวกรองบนหน้าจอ (ทำฝั่งผู้ใช้ ไม่ต้องรอเซิร์ฟเวอร์) ───────── */
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tasks.filter((t) => {
      if (!kinds.includes(t.kind)) return false;
      if (hideDone && (t.status === 'done' || t.status === 'cancelled')) return false;
      if (assignee && !t.assignees.some((a) => a.id === assignee)) return false;
      if (needle) {
        const hay = `${t.title} ${t.code || ''} ${t.description || ''} ${t.assignees.map((a) => a.name).join(' ')}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [tasks, kinds, assignee, q, hideDone]);

  const visibleUndated = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return undated.filter((t) => {
      if (!kinds.includes(t.kind)) return false;
      if (assignee && !t.assignees.some((a) => a.id === assignee)) return false;
      if (needle && !`${t.title} ${t.code || ''}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [undated, kinds, assignee, q]);

  const byDay = useMemo(() => {
    const m = new Map<string, TaskRow[]>();
    for (const t of visible) {
      const a = anchorOf(t);
      if (!a) continue;
      const k = dayKey(new Date(a));
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(t);
    }
    for (const list of m.values()) {
      list.sort((x, y) => {
        const ax = anchorOf(x)!; const ay = anchorOf(y)!;
        return new Date(ax).getTime() - new Date(ay).getTime();
      });
    }
    return m;
  }, [visible]);

  const overdueList = useMemo(
    () => visible.filter(isOverdue).sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime()),
    [visible]
  );

  const days = useMemo(() => {
    if (view === 'day') return [anchor];
    if (view === 'week') return Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));
    return [];
  }, [view, anchor]);

  const headTitle =
    view === 'month'
      ? `${TH_MONTHS[anchor.getMonth()]} ${beYear(anchor)}`
      : view === 'day'
        ? anchor.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' }) + ` ${beYear(anchor)}`
        : `${days[0]?.getDate()} – ${days[6]?.getDate()} ${TH_MONTHS[days[6]?.getMonth() ?? 0]} ${beYear(anchor)}`;

  const step = view === 'month' ? 'month' : view === 'day' ? 1 : 7;
  const shift = (dir: number) => {
    if (step === 'month') { const d = new Date(anchor); d.setMonth(d.getMonth() + dir); goDate(d); }
    else goDate(addDays(anchor, (step as number) * dir));
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[16rem_minmax(0,1fr)] 2xl:grid-cols-[16rem_minmax(0,1fr)_21rem]">
      <TaskRail
        anchor={anchor}
        byDay={byDay}
        overdue={overdueList}
        undated={visibleUndated}
        members={members}
        kinds={kinds}
        setKinds={setKinds}
        assignee={assignee}
        setAssignee={setAssignee}
        hideDone={hideDone}
        setHideDone={setHideDone}
        onPickDate={goDate}
        onOpenTask={openTask}
        currentUserId={currentUserId}
      />

      {/* ───────────────────────── ส่วนหลัก ───────────────────────── */}
      <section className="min-w-0 space-y-4">
        <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-1">
            <button onClick={() => shift(-1)} className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100">
              <ChevronLeft className="h-4 w-4" strokeWidth={2} />
            </button>
            <h2 className="min-w-[13rem] text-center text-base font-semibold text-ink-900">{headTitle}</h2>
            <button onClick={() => shift(1)} className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100">
              <ChevronRight className="h-4 w-4" strokeWidth={2} />
            </button>
            <button onClick={() => goDate(new Date())} className="ml-1 rounded-lg px-2.5 py-1 text-xs font-medium text-ink-600 hover:bg-ink-100">
              วันนี้
            </button>
            {navBusy && <ShdSpinner size={14} />}
          </div>

          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" strokeWidth={2} />
            <input
              className="input w-52 py-1.5 pl-8 text-sm"
              placeholder="ค้นหางาน / ผู้รับผิดชอบ"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className="flex rounded-lg bg-ink-100 p-0.5">
            {([['day','วัน'],['week','สัปดาห์'],['month','เดือน'],['list','รายการ']] as [View,string][]).map(([v, l]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition',
                  view === v ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'
                )}
              >
                {l}
              </button>
            ))}
          </div>

          {perms.create && (
            <button className="btn-primary" onClick={() => setCreating(dayKey(anchor))}>
              <Plus className="h-4 w-4" strokeWidth={2} /> สร้างงาน
            </button>
          )}
        </div>

        {view === 'month' ? (
          <MonthGrid anchor={anchor} byDay={byDay} onOpen={openTask} onAdd={perms.create ? setCreating : undefined} />
        ) : view === 'list' ? (
          <ListView rows={[...visible, ...visibleUndated]} onOpen={openTask} />
        ) : (
          <TimeGrid days={days} byDay={byDay} onOpen={openTask} onAdd={perms.create ? setCreating : undefined} />
        )}
      </section>

      <div className="xl:col-span-2 2xl:contents">{aiPanel}</div>

      <TaskPanel
        task={detail}
        members={members}
        currentUserId={currentUserId}
        canEdit={perms.edit}
        canDelete={perms.delete}
        onClose={closeTask}
      />

      {creating && (
        <TaskCreate
          defaultDate={creating}
          members={members}
          onClose={() => setCreating(null)}
        />
      )}
    </div>
  );
}

/* ─────────────────────────── ปฏิทินย่อ ─────────────────────────── */

function MiniCalendar({
  anchor, byDay, onPick,
}: { anchor: Date; byDay: Map<string, TaskRow[]>; onPick: (d: Date) => void }) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const today = new Date();

  return (
    <div className="card card-pad">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-900">
          {TH_MONTHS[anchor.getMonth()]} {beYear(anchor)}
        </h2>
        <div className="flex gap-0.5">
          <button
            onClick={() => { const d = new Date(anchor); d.setMonth(d.getMonth() - 1); onPick(d); }}
            className="rounded p-1 text-ink-400 hover:bg-ink-100"
          >
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
          <button
            onClick={() => { const d = new Date(anchor); d.setMonth(d.getMonth() + 1); onPick(d); }}
            className="rounded p-1 text-ink-400 hover:bg-ink-100"
          >
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center">
        {TH_DOW.map((d) => <span key={d} className="text-xxs font-medium text-ink-400">{d}</span>)}
        {cells.map((d) => {
          const out = d.getMonth() !== anchor.getMonth();
          const on = sameDay(d, anchor);
          const isToday = sameDay(d, today);
          const has = (byDay.get(dayKey(d))?.length || 0) > 0;
          return (
            <button
              key={dayKey(d)}
              onClick={() => onPick(d)}
              className={cn(
                'relative mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs transition',
                out ? 'text-ink-300' : 'text-ink-700 hover:bg-ink-100',
                isToday && !on && 'font-semibold text-brand-700',
                on && 'bg-brand-600 font-semibold text-white hover:bg-brand-600'
              )}
            >
              {d.getDate()}
              {has && !on && <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-brand-500" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────── ปฏิทินแบบวัน / สัปดาห์ ───────────────────── */

function TimeGrid({
  days, byDay, onOpen, onAdd,
}: {
  days: Date[];
  byDay: Map<string, TaskRow[]>;
  onOpen: (id: string) => void;
  onAdd?: (day: string) => void;
}) {
  const hours = Array.from({ length: HOUR_TO - HOUR_FROM + 1 }, (_, i) => HOUR_FROM + i);
  const today = new Date();

  return (
    <div className="card overflow-hidden">
      {/* หัวคอลัมน์วัน */}
      <div className="grid border-b border-ink-200" style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0,1fr))` }}>
        <div className="border-r border-ink-100 px-2 py-2 text-xxs text-ink-400">GMT+7</div>
        {days.map((d) => {
          const isToday = sameDay(d, today);
          return (
            <div key={dayKey(d)} className={cn('px-2 py-2 text-center', isToday && 'bg-brand-50')}>
              <p className="text-xxs text-ink-400">{TH_DOW[d.getDay()]}</p>
              <p className={cn('text-lg font-semibold', isToday ? 'text-brand-700' : 'text-ink-800')}>{d.getDate()}</p>
            </div>
          );
        })}
      </div>

      {/* แถบงานทั้งวัน / งานที่ไม่ระบุเวลา */}
      <div className="grid border-b border-ink-200 bg-ink-50/60" style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0,1fr))` }}>
        <div className="border-r border-ink-100 px-2 py-1.5 text-xxs text-ink-400">ทั้งวัน</div>
        {days.map((d) => {
          const list = (byDay.get(dayKey(d)) || []).filter((t) => !hasTime(t));
          return (
            <div key={dayKey(d)} className="min-h-[2.25rem] space-y-1 border-l border-ink-100 p-1">
              {list.map((t) => <Chip key={t.id} t={t} onOpen={onOpen} />)}
            </div>
          );
        })}
      </div>

      {/* ตารางเวลา */}
      <div className="relative overflow-x-auto">
        <div className="grid" style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(7rem,1fr))` }}>
          {/* แกนชั่วโมง */}
          <div className="border-r border-ink-100">
            {hours.map((h) => (
              <div key={h} className="relative border-b border-ink-100" style={{ height: HOUR_PX }}>
                <span className="absolute -top-2 right-1.5 bg-white px-0.5 text-xxs text-ink-400">
                  {String(h).padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>

          {days.map((d) => {
            const list = (byDay.get(dayKey(d)) || []).filter(hasTime);
            return (
              <div key={dayKey(d)} className="relative border-l border-ink-100">
                {hours.map((h) => (
                  <div
                    key={h}
                    className="border-b border-ink-100 transition hover:bg-brand-50/40"
                    style={{ height: HOUR_PX }}
                    onDoubleClick={() => onAdd?.(dayKey(d))}
                  />
                ))}
                {list.map((t) => {
                  const pos = blockPos(t);
                  if (!pos) return null;
                  return (
                    <button
                      key={t.id}
                      onClick={() => onOpen(t.id)}
                      className={cn(
                        'absolute left-1 right-1 overflow-hidden rounded-lg border p-1.5 text-left transition hover:brightness-95',
                        kindMeta(t.kind).block,
                        t.status === 'done' && 'opacity-55'
                      )}
                      style={{ top: pos.top, height: pos.height }}
                    >
                      <p className={cn('truncate text-xs font-medium leading-tight', t.status === 'done' && 'line-through')}>
                        {t.title}
                      </p>
                      <p className="mt-0.5 truncate text-xxs opacity-75">
                        {timeLabel(t.start_at)}{t.due_at && t.start_at ? ` – ${timeLabel(t.due_at)}` : ''}
                      </p>
                      {t.assignees.length > 0 && (
                        <span className="mt-1 flex"><AvatarStack people={t.assignees} size={18} max={3} /></span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const hasTime = (t: TaskRow) => {
  const a = anchorOf(t);
  if (!a) return false;
  const d = new Date(a);
  // งานทั้งวันมักถูกบันทึกเวลาเที่ยงคืนหรือช่วงนอกเวลาทำงาน จึงให้ไปอยู่แถบ "ทั้งวัน"
  const h = d.getHours();
  return h >= HOUR_FROM && h <= HOUR_TO;
};

function blockPos(t: TaskRow): { top: number; height: number } | null {
  const a = anchorOf(t);
  if (!a) return null;
  const s = new Date(a);
  const startMin = (s.getHours() - HOUR_FROM) * 60 + s.getMinutes();
  let endMin = startMin + 45;
  if (t.start_at && t.due_at) {
    const e = new Date(t.due_at);
    const em = (e.getHours() - HOUR_FROM) * 60 + e.getMinutes();
    if (em > startMin) endMin = em;
  }
  const total = (HOUR_TO - HOUR_FROM + 1) * 60;
  const top = Math.max(0, (startMin / 60) * HOUR_PX);
  const height = Math.max(30, ((Math.min(endMin, total) - startMin) / 60) * HOUR_PX - 3);
  return { top, height };
}

function Chip({ t, onOpen }: { t: TaskRow; onOpen: (id: string) => void }) {
  const over = isOverdue(t);
  return (
    <button
      onClick={() => onOpen(t.id)}
      className={cn(
        'flex w-full items-center gap-1 truncate rounded-md border px-1.5 py-1 text-left text-xxs font-medium transition hover:brightness-95',
        kindMeta(t.kind).block,
        t.status === 'done' && 'opacity-55 line-through',
        over && 'ring-1 ring-rose-400'
      )}
    >
      <span className="truncate">{t.title}</span>
    </button>
  );
}

/* ───────────────────────── ปฏิทินรายเดือน ───────────────────────── */

function MonthGrid({
  anchor, byDay, onOpen, onAdd,
}: {
  anchor: Date;
  byDay: Map<string, TaskRow[]>;
  onOpen: (id: string) => void;
  onAdd?: (day: string) => void;
}) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const today = new Date();

  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-ink-200 bg-ink-50">
        {TH_DOW.map((d) => (
          <span key={d} className="px-2 py-2 text-center text-xxs font-medium text-ink-500">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const out = d.getMonth() !== anchor.getMonth();
          const isToday = sameDay(d, today);
          const list = byDay.get(dayKey(d)) || [];
          return (
            <div
              key={dayKey(d)}
              onDoubleClick={() => onAdd?.(dayKey(d))}
              className={cn(
                'min-h-[6.5rem] border-b border-r border-ink-100 p-1.5',
                i % 7 === 6 && 'border-r-0',
                out && 'bg-ink-50/50'
              )}
            >
              <span
                className={cn(
                  'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs',
                  out ? 'text-ink-300' : 'text-ink-600',
                  isToday && 'bg-brand-600 font-semibold text-white'
                )}
              >
                {d.getDate()}
              </span>
              <div className="mt-1 space-y-1">
                {list.slice(0, 3).map((t) => <Chip key={t.id} t={t} onOpen={onOpen} />)}
                {list.length > 3 && (
                  <p className="pl-1 text-xxs text-ink-400">+{list.length - 3} รายการ</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────── มุมมองรายการ ─────────────────────────── */

function ListView({ rows, onOpen }: { rows: TaskRow[]; onOpen: (id: string) => void }) {
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const ao = isOverdue(a) ? 0 : 1;
        const bo = isOverdue(b) ? 0 : 1;
        if (ao !== bo) return ao - bo;
        const pa = priorityMeta(a.priority).rank;
        const pb = priorityMeta(b.priority).rank;
        if (pa !== pb) return pa - pb;
        const da = a.due_at ? new Date(a.due_at).getTime() : Infinity;
        const db = b.due_at ? new Date(b.due_at).getTime() : Infinity;
        return da - db;
      }),
    [rows]
  );

  if (!sorted.length) {
    return (
      <div className="card card-pad text-center">
        <CalendarDays className="mx-auto h-8 w-8 text-ink-300" strokeWidth={1.5} />
        <p className="mt-2 text-sm text-ink-500">ไม่มีงานตามเงื่อนไขที่เลือก</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <ul className="divide-y divide-ink-100">
        {sorted.map((t) => {
          const over = isOverdue(t);
          return (
            <li key={t.id}>
              <button onClick={() => onOpen(t.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-ink-50">
                <KindDot kind={t.kind} />
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate text-sm font-medium text-ink-900', t.status === 'done' && 'text-ink-400 line-through')}>
                    {t.title}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xxs text-ink-400">
                    <span className="font-mono">{t.code}</span>
                    {t.due_at && (
                      <span className={cn(over && 'font-medium text-rose-600')}>
                        ครบกำหนด {new Date(t.due_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                        {over && ' (เลยกำหนด)'}
                      </span>
                    )}
                    {t.checklist_total > 0 && <span>เช็กลิสต์ {t.checklist_done}/{t.checklist_total}</span>}
                    {t.comment_count > 0 && <span>{t.comment_count} โน้ต</span>}
                    {t.attachment_count > 0 && <span>{t.attachment_count} ไฟล์</span>}
                  </p>
                </div>
                <span className={cn('chip', priorityMeta(t.priority).chip)}>{priorityMeta(t.priority).label}</span>
                <span className={cn('chip', statusMeta(t.status).chip)}>{statusMeta(t.status).label}</span>
                <AvatarStack people={t.assignees} size={22} max={3} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
