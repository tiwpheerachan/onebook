'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { saveAssetLocation, deleteAssetLocation } from '@/actions/asset-locations';

const blank = { id: null as string | null, code: '', name: '', building: '', floor: '', room: '', is_active: true };

export function LocationManager({
  canCreate, canEdit, canDelete, editRow, labels,
}: {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  editRow?: any;
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(blank);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  function submit() {
    setErr('');
    start(async () => {
      const res = await saveAssetLocation(form);
      if (!res.ok) { setErr(res.error || ''); return; }
      setOpen(false);
      router.refresh();
    });
  }
  function remove() {
    if (!form.id || !window.confirm(labels.confirmDelete)) return;
    start(async () => {
      const res = await deleteAssetLocation(form.id);
      if (!res.ok) { setErr(res.error || ''); return; }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      {editRow ? (
        canEdit && (
          <button onClick={() => { setForm({ ...blank, ...editRow }); setOpen(true); }} className="rounded p-1 text-ink-400 hover:bg-brand-50 hover:text-brand-600">
            <Pencil className="h-4 w-4" strokeWidth={1.8} />
          </button>
        )
      ) : (
        canCreate && (
          <button onClick={() => { setForm({ ...blank }); setOpen(true); }} className="btn-primary">
            <Plus className="h-4 w-4" /> {labels.create}
          </button>
        )
      )}

      <SlidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={form.id ? labels.edit : labels.create}
        footer={
          <div className="flex items-center justify-between gap-2">
            <div>{form.id && canDelete && <button className="btn-secondary text-rose-600" disabled={pending} onClick={remove}>{labels.delete}</button>}</div>
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={() => setOpen(false)}>{labels.cancel}</button>
              <button className="btn-primary" disabled={pending} onClick={submit}>{pending && <ShdSpinner size={16} />} {labels.save}</button>
            </div>
          </div>
        }
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}
        <div className="grid grid-cols-2 gap-4">
          <F label={`${labels.code} *`}><input className="input" value={form.code} onChange={(e) => set('code', e.target.value)} /></F>
          <F label={`${labels.name} *`}><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></F>
          <F label={labels.building}><input className="input" value={form.building || ''} onChange={(e) => set('building', e.target.value)} /></F>
          <F label={labels.floor}><input className="input" value={form.floor || ''} onChange={(e) => set('floor', e.target.value)} /></F>
          <F label={labels.room}><input className="input" value={form.room || ''} onChange={(e) => set('room', e.target.value)} /></F>
          <F label={labels.active}>
            <select className="input" value={form.is_active ? '1' : '0'} onChange={(e) => set('is_active', e.target.value === '1')}>
              <option value="1">{labels.yes}</option>
              <option value="0">{labels.no}</option>
            </select>
          </F>
        </div>
      </SlidePanel>
    </>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}</div>;
}
