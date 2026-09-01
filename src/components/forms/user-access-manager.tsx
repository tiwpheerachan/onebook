'use client';
import { useState, useTransition } from 'react';
import { useI18n } from '@/i18n/provider';
import { useRouter } from 'next/navigation';
import { UserPlus, Power } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { assignUser, setUserAccess } from '@/actions/settings';

export function UserAccessManager({
  canCreate, canEdit, roles, profiles, membership,
}: {
  canCreate: boolean; canEdit?: boolean;
  roles: { id: string; label: string }[];
  profiles: { id: string; label: string }[];
  membership?: { id: string; is_active: boolean };
}) {
  const { dict: d } = useI18n();
  const L = d.ui.userAccess;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ user_id: '', role_id: '', can_view_subsidiaries: false });
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  if (membership) {
    if (!canEdit) return null;
    return (
      <button
        disabled={pending}
        onClick={() => start(async () => {
          await setUserAccess({ id: membership.id, is_active: !membership.is_active });
          router.refresh();
        })}
        className={membership.is_active ? 'btn-ghost text-xs text-rose-600' : 'btn-ghost text-xs text-emerald-600'}
      >
        <Power className="h-3.5 w-3.5" /> {membership.is_active ? L.suspend : L.enable}
      </button>
    );
  }

  if (!canCreate) return null;

  function submit() {
    setErr('');
    if (!form.user_id || !form.role_id) { setErr(L.needUserRole); return; }
    start(async () => {
      const res = await assignUser(form);
      if (!res.ok) { setErr(res.error || ''); return; }
      setOpen(false); router.refresh();
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary"><UserPlus className="h-4 w-4" /> {L.grant}</button>
      <SlidePanel open={open} onClose={() => setOpen(false)} title={L.grantTitle}
        footer={<div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setOpen(false)}>{d.common.cancel}</button>
          <button className="btn-primary" disabled={pending} onClick={submit}>
            {pending && <ShdSpinner size={16} />} บันทึก
          </button>
        </div>}
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}
        <div className="space-y-4">
          <div><label className="label">{L.user} *</label>
            <select className="input" value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}>
              <option value="">{L.pickUser}</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select></div>
          <div><label className="label">{L.role} *</label>
            <select className="input" value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })}>
              <option value="">{L.pickRole}</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select></div>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" className="h-4 w-4 rounded border-ink-300"
                   checked={form.can_view_subsidiaries}
                   onChange={(e) => setForm({ ...form, can_view_subsidiaries: e.target.checked })} />
            อนุญาตให้มองเห็นข้อมูลของบริษัทลูก (อ่านอย่างเดียว)
          </label>
        </div>
      </SlidePanel>
    </>
  );
}
