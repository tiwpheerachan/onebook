'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { saveDimension, deleteDimension } from '@/actions/dimensions';
import type { Dictionary } from '@/i18n';

export interface DimensionRow {
  id: string;
  group_name: string;
  code: string;
  name: string;
  is_active: boolean;
  doc_count: number;
}

export function DimensionEditor({
  row, d, canEdit, defaultGroup,
}: {
  row?: DimensionRow;
  d: Dictionary;
  canEdit: boolean;
  defaultGroup: string;
}) {
  const L = d.ui.dimension;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    group_name: row?.group_name || defaultGroup,
    code: row?.code || '',
    name: row?.name || '',
    is_active: row?.is_active !== false,
  });
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  if (!canEdit) return null;

  const submit = () => {
    setErr('');
    start(async () => {
      const res = await saveDimension({ id: row?.id, ...form });
      if (!res.ok) { setErr(res.error || ''); return; }
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setErr(''); setOpen(true); }}
        className={row ? 'rounded p-1 text-ink-400 hover:bg-brand-50 hover:text-brand-700' : 'btn-primary'}
        aria-label={row ? L.edit : undefined}
      >
        {row
          ? <Pencil className="h-4 w-4" strokeWidth={1.8} />
          : <><Plus className="h-4 w-4" strokeWidth={2} /> {L.create}</>}
      </button>

      <SlidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={row ? L.edit : L.create}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setOpen(false)}>{d.common.cancel}</button>
            <button className="btn-primary" disabled={pending} onClick={submit}>
              {pending && <ShdSpinner size={16} />} {d.common.save}
            </button>
          </div>
        }
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">{L.groupName}</label>
            <input className="input" value={form.group_name} onChange={(e) => set('group_name', e.target.value)} />
          </div>
          <div>
            <label className="label">{L.code} *</label>
            <input className="input font-mono" value={form.code} onChange={(e) => set('code', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">{L.name} *</label>
            <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" className="h-4 w-4 rounded border-ink-300"
                 checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
          {L.active}
        </label>
      </SlidePanel>
    </>
  );
}

export function DimensionDelete({ row, d, canDelete }: { row: DimensionRow; d: Dictionary; canDelete: boolean }) {
  const L = d.ui.dimension;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');

  // แผนกที่มีเอกสารใช้อยู่ลบไม่ได้ ซ่อนปุ่มไปเลยดีกว่าให้กดแล้วเจอข้อความปฏิเสธ
  if (!canDelete || row.doc_count > 0) return null;

  return (
    <>
      <button
        type="button"
        aria-label={d.common.delete}
        disabled={pending}
        onClick={() => start(async () => {
          const res = await deleteDimension(row.id);
          if (!res.ok) { setErr(res.error || ''); return; }
          router.refresh();
        })}
        className="rounded p-1 text-ink-400 hover:bg-rose-50 hover:text-rose-600"
      >
        {pending ? <ShdSpinner size={16} /> : <Trash2 className="h-4 w-4" strokeWidth={1.8} />}
      </button>
      {err && <span className="ml-1 text-xxs text-rose-600">{err}</span>}
    </>
  );
}
