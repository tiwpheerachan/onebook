'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Trash2, IdCard, Mail } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { useI18n } from '@/i18n/provider';
import { inviteSsoUser, cancelSsoInvitation } from '@/actions/settings';

export interface Invitation {
  id: string;
  employee_code: string | null;
  email: string | null;
  role: string;
  note: string | null;
  can_view_subsidiaries: boolean;
  created_at: string;
}

/**
 * อนุญาตพนักงาน GoodHR เข้าใช้ระบบเป็นรายคน
 * ค่าเริ่มต้นของระบบคือ "เข้าไม่ได้" ต้องมีรายชื่อในนี้ก่อนจึงจะล็อกอินผ่าน
 */
export function SsoInvite({
  roles, canCreate,
}: {
  roles: { id: string; label: string }[];
  canCreate: boolean;
}) {
  const { dict } = useI18n();
  const L = dict.ui.sso;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({
    employee_code: '', email: '', role_id: '', can_view_subsidiaries: false, note: '',
  });
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  if (!canCreate) return null;

  function submit() {
    setErr('');
    start(async () => {
      const res = await inviteSsoUser(form);
      if (!res.ok) { setErr(res.error || ''); return; }
      setOpen(false);
      setForm({ employee_code: '', email: '', role_id: '', can_view_subsidiaries: false, note: '' });
      router.refresh();
    });
  }

  return (
    <>
      <button className="btn-secondary" onClick={() => { setErr(''); setOpen(true); }}>
        <UserPlus className="h-4 w-4 text-ink-400" strokeWidth={1.8} /> {L.inviteBtn}
      </button>

      <SlidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={L.inviteTitle}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setOpen(false)}>{dict.common.cancel}</button>
            <button className="btn-primary" disabled={pending} onClick={submit}>
              {pending && <ShdSpinner size={16} />} {L.inviteAllow}
            </button>
          </div>
        }
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}

        <p className="mb-4 rounded-lg bg-brand-50 px-3 py-2.5 text-xs leading-relaxed text-brand-800">
          {L.inviteHint}
        </p>

        <div className="space-y-4">
          <div>
            <label className="label">{L.empCode}</label>
            <input
              className="input font-mono"
              placeholder={L.empCodePh}
              value={form.employee_code}
              onChange={(e) => set('employee_code', e.target.value)}
            />
            <p className="mt-1 text-xxs text-ink-400">{L.empCodeHint}</p>
          </div>

          <div>
            <label className="label">{L.orEmailLabel}</label>
            <input
              className="input"
              placeholder="name@company.co.th"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
            />
            <p className="mt-1 text-xxs text-ink-400">{L.orEmailHint}</p>
          </div>

          <div>
            <label className="label">{L.roleLabel} *</label>
            <select className="input" value={form.role_id} onChange={(e) => set('role_id', e.target.value)}>
              <option value="">{L.rolePick}</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <p className="mt-1 text-xxs text-ink-400">
              {L.roleHint}
            </p>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-300"
              checked={form.can_view_subsidiaries}
              onChange={(e) => set('can_view_subsidiaries', e.target.checked)}
            />
            {L.subsidiaries}
          </label>

          <div>
            <label className="label">{L.note}</label>
            <input
              className="input"
              placeholder={L.notePh}
              value={form.note}
              onChange={(e) => set('note', e.target.value)}
            />
          </div>
        </div>
      </SlidePanel>
    </>
  );
}

/** รายการที่อนุญาตไว้แต่ยังไม่เคยล็อกอิน */
export function InvitationList({ rows, canEdit }: { rows: Invitation[]; canEdit: boolean }) {
  const L = useI18n().dict.ui.sso;
  const router = useRouter();
  const [pending, start] = useTransition();

  if (rows.length === 0) return null;

  return (
    <div className="card mt-5 overflow-hidden">
      <div className="border-b border-ink-200 px-5 py-3.5">
        <h2 className="text-sm font-semibold text-ink-900">{L.pendingTitle}</h2>
        <p className="mt-0.5 text-xs text-ink-500">{L.pendingHint.replace('{n}', String(rows.length))}</p>
      </div>
      <ul className="divide-y divide-ink-100">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <span className="flex items-center gap-1.5 text-sm text-ink-800">
              {r.employee_code ? (
                <><IdCard className="h-3.5 w-3.5 text-ink-400" strokeWidth={1.8} />
                  <span className="font-mono">{r.employee_code}</span></>
              ) : (
                <><Mail className="h-3.5 w-3.5 text-ink-400" strokeWidth={1.8} />{r.email}</>
              )}
            </span>
            {r.employee_code && r.email && <span className="text-xxs text-ink-400">{r.email}</span>}
            <span className="chip bg-brand-50 text-brand-700 ring-brand-200">{r.role}</span>
            {r.can_view_subsidiaries && (
              <span className="chip bg-ink-100 text-ink-600 ring-ink-200">{L.canSeeSubs}</span>
            )}
            {r.note && <span className="text-xxs text-ink-400">{r.note}</span>}
            {canEdit && (
              <button
                disabled={pending}
                onClick={() => start(async () => {
                  await cancelSsoInvitation(r.id);
                  router.refresh();
                })}
                className="ml-auto rounded p-1 text-ink-400 hover:bg-rose-50 hover:text-rose-600"
                title={L.cancelInvite}
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
