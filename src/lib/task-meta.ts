/** ค่าคงที่ของงาน : ชื่อภาษาไทย สี และลำดับความสำคัญ ใช้ร่วมกันทั้งฝั่งเซิร์ฟเวอร์และหน้าจอ */

export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'review' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TaskKind = 'task' | 'meeting' | 'deadline' | 'milestone' | 'personal';

export const TASK_STATUS: { key: TaskStatus; label: string; chip: string; dot: string }[] = [
  { key: 'todo',        label: 'ยังไม่เริ่ม',  chip: 'bg-ink-100 text-ink-700 ring-ink-200',          dot: 'bg-ink-400' },
  { key: 'in_progress', label: 'กำลังทำ',      chip: 'bg-sky-50 text-sky-700 ring-sky-200',          dot: 'bg-sky-500' },
  { key: 'blocked',     label: 'ติดปัญหา',     chip: 'bg-rose-50 text-rose-700 ring-rose-200',       dot: 'bg-rose-500' },
  { key: 'review',      label: 'รอตรวจ',       chip: 'bg-violet-50 text-violet-700 ring-violet-200', dot: 'bg-violet-500' },
  { key: 'done',        label: 'เสร็จแล้ว',    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  { key: 'cancelled',   label: 'ยกเลิก',       chip: 'bg-ink-100 text-ink-400 ring-ink-200',         dot: 'bg-ink-300' },
];

export const TASK_PRIORITY: { key: TaskPriority; label: string; chip: string; rank: number }[] = [
  { key: 'urgent', label: 'ด่วนมาก', chip: 'bg-rose-100 text-rose-700 ring-rose-200',   rank: 0 },
  { key: 'high',   label: 'สำคัญ',   chip: 'bg-amber-100 text-amber-800 ring-amber-200', rank: 1 },
  { key: 'normal', label: 'ปกติ',    chip: 'bg-ink-100 text-ink-600 ring-ink-200',      rank: 2 },
  { key: 'low',    label: 'ไม่เร่ง', chip: 'bg-ink-50 text-ink-400 ring-ink-200',       rank: 3 },
];

/** สีบล็อกงานบนปฏิทิน — โทนพาสเทลอ่านง่ายบนพื้นขาว */
export const TASK_KIND: {
  key: TaskKind; label: string; block: string; bar: string; swatch: string;
}[] = [
  { key: 'task',      label: 'งานทั่วไป',   block: 'bg-sky-50 text-sky-900 border-sky-200',          bar: 'bg-sky-400',    swatch: 'bg-sky-300' },
  { key: 'meeting',   label: 'ประชุม',      block: 'bg-brand-50 text-brand-900 border-brand-200',    bar: 'bg-brand-500',  swatch: 'bg-brand-300' },
  { key: 'deadline',  label: 'กำหนดส่ง',    block: 'bg-rose-50 text-rose-900 border-rose-200',       bar: 'bg-rose-400',   swatch: 'bg-rose-300' },
  { key: 'milestone', label: 'หมุดหมาย',    block: 'bg-violet-50 text-violet-900 border-violet-200', bar: 'bg-violet-400', swatch: 'bg-violet-300' },
  { key: 'personal',  label: 'ส่วนตัว',     block: 'bg-amber-50 text-amber-900 border-amber-200',    bar: 'bg-amber-400',  swatch: 'bg-amber-300' },
];

export const statusMeta = (k: string) => TASK_STATUS.find((s) => s.key === k) || TASK_STATUS[0];
export const priorityMeta = (k: string) => TASK_PRIORITY.find((p) => p.key === k) || TASK_PRIORITY[2];
export const kindMeta = (k: string) => TASK_KIND.find((x) => x.key === k) || TASK_KIND[0];

export const OPEN_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'review'];

/** งานตกหล่น : เลยกำหนดแล้วแต่ยังไม่ปิด */
export function isOverdue(t: { due_at?: string | null; status: string }): boolean {
  if (!t.due_at) return false;
  if (!OPEN_STATUSES.includes(t.status as TaskStatus)) return false;
  return new Date(t.due_at).getTime() < Date.now();
}

/** ย่อชื่อเป็นตัวอักษรสำหรับวงกลมรูปโปรไฟล์ */
export function initials(name?: string | null): string {
  const s = (name || '').trim();
  if (!s) return '?';
  const parts = s.split(/[\s@.]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** สีพื้นวงกลมรูปโปรไฟล์ กระจายตามตัวอักษรของชื่อ ให้คนเดิมได้สีเดิมเสมอ */
const AVATAR_TONES = [
  'bg-brand-100 text-brand-700', 'bg-sky-100 text-sky-700', 'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-800', 'bg-rose-100 text-rose-700', 'bg-emerald-100 text-emerald-700',
];
export function avatarTone(seed?: string | null): string {
  const s = seed || '';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 997;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}
