'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Filter, Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { setRowFilter } from '@/actions/settings';
import type { Dictionary } from '@/i18n';

/**
 * ตั้งเงื่อนไขว่าบทบาทนี้เห็นแถวไหนบ้าง
 *
 * เป็นตัวเลือกที่ปิดตาย ไม่ให้เขียนเงื่อนไขเอง
 * เพราะเงื่อนไขอิสระที่เอาไปต่อเป็น SQL จะกลายเป็นช่องโหว่
 */
export function RowFilterEditor({
  roleId, roleName, resource, current, groups, d, canEdit,
}: {
  roleId: string;
  roleName: string;
  resource: 'contacts' | 'documents';
  current: any;
  groups: { id: string; label: string }[];
  d: Dictionary;
  canEdit: boolean;
}) {
  const L = d.ui.rowFilter;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'none' | 'own' | 'contact_group'>(
    current?.mode === 'own' ? 'own' : current?.mode === 'contact_group' ? 'contact_group' : 'none'
  );
  const [ids, setIds] = useState<string[]>(current?.ids || []);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [pending, start] = useTransition();

  if (!canEdit) return null;

  const label = mode === 'own' ? L.own : mode === 'contact_group' ? L.group : L.none;

  const submit = () => {
    setErr(''); setMsg('');
    start(async () => {
      const res = await setRowFilter({ role_id: roleId, resource, mode, group_ids: ids });
      if (!res.ok) { setErr(res.error || ''); return; }
      setMsg(L.saved);
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setErr(''); setMsg(''); setOpen(true); }}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs',
          mode === 'none' ? 'text-ink-400 hover:bg-ink-100' : 'bg-brand-50 text-brand-700'
        )}
        title={L.title}
      >
        <Filter className="h-3.5 w-3.5" strokeWidth={1.8} /> {label}
      </button>

      <SlidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={`${L.title} · ${roleName}`}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setOpen(false)}>{d.common.close}</button>
            <button className="btn-primary" disabled={pending} onClick={submit}>
              {pending && <ShdSpinner size={16} />} {L.save}
            </button>
          </div>
        }
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}
        {msg && (
          <p className="mb-4 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 ring-1 ring-inset ring-emerald-200">
            <Check className="h-3.5 w-3.5" strokeWidth={2.2} /> {msg}
          </p>
        )}

        <p className="mb-4 rounded-lg bg-brand-50 px-3 py-2.5 text-xs leading-relaxed text-brand-800">{L.hint}</p>

        <div className="space-y-2">
          {([
            { v: 'none' as const, label: L.none },
            { v: 'own' as const, label: L.own },
            { v: 'contact_group' as const, label: L.group },
          ]).map((o) => (
            <button key={o.v} type="button" onClick={() => setMode(o.v)}
              className={cn('flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition',
                mode === o.v ? 'border-brand-400 bg-brand-50 text-brand-800' : 'border-ink-200 text-ink-700 hover:bg-ink-50')}>
              {o.label}
            </button>
          ))}
        </div>

        {mode === 'contact_group' && (
          <div className="mt-4">
            <label className="label">{L.pickGroups}</label>
            <div className="space-y-1.5">
              {groups.map((g) => (
                <label key={g.id} className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-300"
                    checked={ids.includes(g.id)}
                    onChange={(e) =>
                      setIds((cur) => e.target.checked ? [...cur, g.id] : cur.filter((x) => x !== g.id))
                    }
                  />
                  {g.label}
                </label>
              ))}
              {groups.length === 0 && <p className="text-xs text-ink-400">—</p>}
            </div>
          </div>
        )}

        <p className="mt-4 text-xxs text-ink-400">{L.appliesTo}</p>
      </SlidePanel>
    </>
  );
}
