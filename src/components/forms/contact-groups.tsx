'use client';
import { useState, useTransition } from 'react';
import { useI18n } from '@/i18n/provider';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Pencil, Trash2, Check, X, FolderPlus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { saveContactGroup, deleteContactGroup, assignContactGroup } from '@/actions/master';

export interface GroupRow {
  id: string;
  name: string;
  color: string;
  member_count: number;
}

/** สีให้เลือกตอนสร้างกลุ่ม ใช้โทนเดียวกับที่ระบบใช้อยู่ */
export const GROUP_COLORS: Record<string, string> = {
  brand: 'bg-brand-500', sky: 'bg-sky-500', violet: 'bg-violet-500',
  amber: 'bg-amber-500', rose: 'bg-rose-500', emerald: 'bg-emerald-500',
  slate: 'bg-slate-500', pink: 'bg-pink-500',
};

/** กลุ่มมาตรฐาน — โครงสร้างและสี ส่วนชื่ออยู่ในพจนานุกรม (ui.contactGroup) */
const STANDARD = [
  { key: '', labelKey: 'all' as const, dot: 'bg-ink-400' },
  { key: 'customer', labelKey: 'customer' as const, dot: 'bg-emerald-500' },
  { key: 'vendor', labelKey: 'vendor' as const, dot: 'bg-amber-500' },
  { key: 'inactive', labelKey: 'inactive' as const, dot: 'bg-ink-300' },
];

/** แถบกลุ่มผู้ติดต่อฝั่งซ้าย : กลุ่มมาตรฐาน + กลุ่มที่ตั้งเอง */
export function ContactGroupRail({
  groups, canEdit, counts,
}: {
  groups: GroupRow[];
  canEdit: boolean;
  counts: Record<string, number>;
}) {
  const { dict: d } = useI18n();
  const L = d.ui.contactGroup;
  const router = useRouter();
  const params = useSearchParams();
  const activeStd = params.get('t') || '';
  const activeGroup = params.get('g') || '';

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<GroupRow | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('brand');
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  function go(next: Record<string, string>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v); else p.delete(k);
    }
    router.push(`/contacts?${p.toString()}`, { scroll: false });
  }

  function submit() {
    setErr('');
    start(async () => {
      const res = await saveContactGroup({ id: editing?.id, name, color });
      if (!res.ok) { setErr(res.error || ''); return; }
      setAdding(false); setEditing(null); setName(''); setColor('brand');
      router.refresh();
    });
  }

  const form = (
    <div className="rounded-lg border border-ink-200 bg-ink-50 p-2.5">
      {err && <p className="mb-2 text-xxs text-rose-600">{err}</p>}
      <input
        autoFocus
        className="input py-1.5 text-sm"
        placeholder={L.namePh}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setAdding(false); setEditing(null); } }}
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {Object.entries(GROUP_COLORS).map(([k, cls]) => (
          <button
            key={k}
            onClick={() => setColor(k)}
            className={cn('h-5 w-5 rounded-full ring-offset-1 transition', cls, color === k && 'ring-2 ring-ink-500')}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-end gap-1.5">
        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => { setAdding(false); setEditing(null); }}>
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
        <button className="btn-primary px-2 py-1 text-xs" disabled={pending || !name.trim()} onClick={submit}>
          {pending ? <ShdSpinner size={14} /> : <Check className="h-3.5 w-3.5" strokeWidth={2} />}
        </button>
      </div>
    </div>
  );

  return (
    <nav className="card sticky top-20 divide-y divide-ink-100 overflow-hidden">
      <div className="px-4 py-3">
        <p className="section-title mb-2">{L.standard}</p>
        <ul className="-mx-2 space-y-0.5">
          {STANDARD.map((s) => (
            <li key={s.key}>
              <button
                onClick={() => go({ t: s.key, g: '' })}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition',
                  !activeGroup && activeStd === s.key ? 'bg-brand-50 font-medium text-brand-800' : 'text-ink-700 hover:bg-ink-50'
                )}
              >
                <span className={cn('h-2 w-2 shrink-0 rounded-full', s.dot)} />
                <span className="flex-1 truncate">{L[s.labelKey]}</span>
                <span className="shrink-0 text-xxs tabular-nums text-ink-400">{counts[s.key || 'all'] ?? ''}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="section-title">{L.custom}</p>
          {canEdit && !adding && (
            <button
              onClick={() => { setAdding(true); setEditing(null); setName(''); setColor('brand'); setErr(''); }}
              className="flex items-center gap-0.5 text-xxs font-medium text-brand-600 hover:text-brand-700"
            >
              <Plus className="h-3 w-3" strokeWidth={2.5} /> เพิ่ม
            </button>
          )}
        </div>

        {adding && <div className="mb-2">{form}</div>}

        {groups.length === 0 && !adding && (
          <p className="text-xxs leading-relaxed text-ink-400">
            ยังไม่มีกลุ่ม — สร้างกลุ่มเพื่อแยกลูกค้าตามช่องทางขาย แบรนด์ หรือบริษัทในเครือ
          </p>
        )}

        <ul className="-mx-2 space-y-0.5">
          {groups.map((g) =>
            editing?.id === g.id ? (
              <li key={g.id} className="px-2 py-1">{form}</li>
            ) : (
              <li key={g.id} className="group">
                <div
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-2 py-1.5 transition',
                    activeGroup === g.id ? 'bg-brand-50' : 'hover:bg-ink-50'
                  )}
                >
                  <button onClick={() => go({ g: g.id, t: '' })} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', GROUP_COLORS[g.color] || GROUP_COLORS.brand)} />
                    <span className={cn('flex-1 truncate text-sm', activeGroup === g.id ? 'font-medium text-brand-800' : 'text-ink-700')}>
                      {g.name}
                    </span>
                    <span className="shrink-0 text-xxs tabular-nums text-ink-400">{g.member_count}</span>
                  </button>
                  {canEdit && (
                    <span className="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
                      <button
                        onClick={() => { setEditing(g); setAdding(false); setName(g.name); setColor(g.color); setErr(''); }}
                        className="rounded p-0.5 text-ink-400 hover:text-brand-600"
                      >
                        <Pencil className="h-3 w-3" strokeWidth={1.8} />
                      </button>
                      <button
                        onClick={() => start(async () => {
                          const res = await deleteContactGroup(g.id);
                          if (!res.ok) { setErr(res.error || ''); return; }
                          if (activeGroup === g.id) go({ g: '' });
                          router.refresh();
                        })}
                        className="rounded p-0.5 text-ink-400 hover:text-rose-600"
                      >
                        <Trash2 className="h-3 w-3" strokeWidth={1.8} />
                      </button>
                    </span>
                  )}
                </div>
              </li>
            )
          )}
        </ul>
      </div>
    </nav>
  );
}

/** แถบเครื่องมือที่โผล่เมื่อเลือกผู้ติดต่อไว้ ใช้ใส่/เอาออกจากกลุ่มทีเดียวหลายราย */
export function BulkGroupBar({
  selected, groups, currentGroup, onDone,
}: {
  selected: string[];
  groups: GroupRow[];
  /** กลุ่มที่กำลังเปิดดูอยู่ ใช้แสดงปุ่ม "เอาออกจากกลุ่มนี้" */
  currentGroup?: string;
  onDone: () => void;
}) {
  const { dict: d } = useI18n();
  const L = d.ui.contactGroup;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  if (selected.length === 0) return null;

  function run(groupId: string, attach: boolean) {
    setErr(''); setMsg(''); setOpen(false);
    start(async () => {
      const res = await assignContactGroup(groupId, selected, attach);
      if (!res.ok) { setErr(res.error || ''); return; }
      setMsg((attach ? L.added : L.removed).replace('{n}', String(res.count)));
      onDone();
      router.refresh();
    });
  }

  return (
    <div className="sticky top-16 z-20 mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5">
      <span className="text-sm font-medium text-brand-800">{L.selected.replace('{n}', String(selected.length))}</span>

      <div className="relative">
        <button className="btn-secondary" disabled={pending || groups.length === 0} onClick={() => setOpen((v) => !v)}>
          {pending ? <ShdSpinner size={16} /> : <FolderPlus className="h-4 w-4 text-ink-400" strokeWidth={1.8} />}
          เพิ่มเข้ากลุ่ม
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute left-0 z-20 mt-1 max-h-64 min-w-[13rem] overflow-auto rounded-xl border border-ink-200 bg-white py-1 shadow-card">
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => run(g.id, true)}
                  className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm text-ink-700 hover:bg-brand-50"
                >
                  <span className={cn('h-2 w-2 rounded-full', GROUP_COLORS[g.color] || GROUP_COLORS.brand)} />
                  {g.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {currentGroup && (
        <button className="btn-secondary" disabled={pending} onClick={() => run(currentGroup, false)}>
          เอาออกจากกลุ่มนี้
        </button>
      )}

      <button className="btn-ghost text-xs" onClick={onDone}>{L.clearSelection}</button>

      {msg && <span className="text-xs text-emerald-700">{msg}</span>}
      {err && <span className="text-xs text-rose-600">{err}</span>}
    </div>
  );
}
