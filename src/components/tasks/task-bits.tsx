'use client';
import { cn } from '@/lib/cn';
import { initials, avatarTone, statusMeta, priorityMeta, kindMeta } from '@/lib/task-meta';

export interface Member {
  id: string;
  name: string;
  email?: string | null;
}

export function Avatar({ name, size = 24, title }: { name?: string | null; size?: number; title?: string }) {
  return (
    <span
      title={title || name || ''}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-white',
        avatarTone(name)
      )}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.4) }}
    >
      {initials(name)}
    </span>
  );
}

/** วงกลมรูปโปรไฟล์ซ้อนกัน แสดงได้สูงสุด max คน ที่เหลือรวบเป็น +N */
export function AvatarStack({
  people, max = 4, size = 24,
}: {
  people: { id: string; name: string }[];
  max?: number;
  size?: number;
}) {
  if (!people.length) return null;
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="flex items-center -space-x-1.5">
      {shown.map((p) => <Avatar key={p.id} name={p.name} size={size} />)}
      {rest > 0 && (
        <span
          className="inline-flex shrink-0 items-center justify-center rounded-full bg-ink-100 font-semibold text-ink-600 ring-2 ring-white"
          style={{ width: size, height: size, fontSize: Math.max(9, size * 0.36) }}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}

export function StatusChip({ status }: { status: string }) {
  const m = statusMeta(status);
  return <span className={cn('chip', m.chip)}>{m.label}</span>;
}

export function PriorityChip({ priority }: { priority: string }) {
  const m = priorityMeta(priority);
  if (priority === 'normal') return null;
  return <span className={cn('chip', m.chip)}>{m.label}</span>;
}

export function KindDot({ kind }: { kind: string }) {
  return <span className={cn('inline-block h-2 w-2 shrink-0 rounded-full', kindMeta(kind).bar)} />;
}

/** เวลาแบบสั้นสำหรับบล็อกบนปฏิทิน */
export function timeLabel(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function dayKey(d: Date): string {
  // ใช้เวลาท้องถิ่น ไม่ใช่ UTC ไม่งั้นงานตอนดึกจะข้ามไปอยู่วันถัดไป
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
