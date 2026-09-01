'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  X, Trash2, Plus, Send, Paperclip, ExternalLink, CalendarClock, Link2, CheckSquare, Square,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useI18n } from '@/i18n/provider';
import { dayMonth } from '@/lib/format';
import type { Dictionary } from '@/i18n';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { Avatar, type Member } from './task-bits';
import { TASK_STATUS, TASK_PRIORITY, TASK_KIND, statusMeta, kindMeta } from '@/lib/task-meta';
import {
  saveTask, deleteTask, addComment, deleteComment,
  addChecklistItem, toggleChecklistItem, deleteChecklistItem,
} from '@/actions/tasks';
import { uploadAttachment, attachmentUrl, deleteAttachment } from '@/actions/attachments';

export interface TaskDetail {
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
  document_id: string | null;
  contact_id: string | null;
  assignees: { id: string; name: string }[];
  comments: { id: string; body: string; created_by: string | null; author: string; created_at: string }[];
  checklist: { id: string; title: string; is_done: boolean }[];
  attachments: { id: string; file_name: string; size_bytes: number | null }[];
  doc?: { id: string; doc_number: string; kind: string } | null;
  contact?: { id: string; name: string } | null;
}

/** แปลง ISO เป็นค่าใส่ใน input[type=datetime-local] ตามเวลาท้องถิ่น */
function toLocalInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : '');

const relTime = (iso: string, d: Dictionary, locale: string) => {
  const L = d.ui.task;
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const n = (tpl: string, v: number) => tpl.replace('{n}', String(Math.floor(v)));
  if (diff < 60) return L.justNow;
  if (diff < 3600) return n(L.minsAgo, diff / 60);
  if (diff < 86400) return n(L.hoursAgo, diff / 3600);
  if (diff < 604800) return n(L.daysAgo, diff / 86400);
  return dayMonth(iso, locale);
};

export function TaskPanel({
  task, members, currentUserId, canEdit, canDelete, onClose,
}: {
  task: TaskDetail | null;
  members: Member[];
  currentUserId: string;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
}) {
  const { dict, locale } = useI18n();
  const L = dict.ui.task;
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<any>(task);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [check, setCheck] = useState('');
  const [err, setErr] = useState('');
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState('');

  useEffect(() => {
    setForm(task);
    setAssignees((task?.assignees || []).map((a) => a.id));
    setNote(''); setCheck(''); setErr(''); setDirty(false);
  }, [task]);

  // ปิดด้วยปุ่ม Esc เหมือนกล่องอื่นในระบบ
  useEffect(() => {
    if (!task) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [task, onClose]);

  if (!task || !form) return null;
  const set = (k: string, v: any) => { setForm((f: any) => ({ ...f, [k]: v })); setDirty(true); };

  function save() {
    setErr('');
    start(async () => {
      const res = await saveTask(
        {
          id: form.id, title: form.title, description: form.description,
          kind: form.kind, status: form.status, priority: form.priority,
          start_at: fromLocalInput(toLocalInput(form.start_at)),
          due_at: fromLocalInput(toLocalInput(form.due_at)),
          progress: form.progress,
        },
        assignees
      );
      if (!res.ok) { setErr(res.error || ''); return; }
      setDirty(false);
      router.refresh();
    });
  }

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setErr('');
    start(async () => {
      const res = await fn();
      if (!res.ok) { setErr(res.error || ''); return; }
      after?.();
      router.refresh();
    });
  }

  async function openFile(id: string) {
    setBusy(id);
    const res = await attachmentUrl(id);
    setBusy('');
    if (!res.ok || !res.url) { setErr(res.error || L.openFileFailed); return; }
    window.open(res.url, '_blank', 'noopener');
  }

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set('task_id', form.id);
    fd.set('file', file);
    setErr('');
    start(async () => {
      const res = await uploadAttachment(fd);
      if (fileRef.current) fileRef.current.value = '';
      if (!res.ok) { setErr(res.error || ''); return; }
      router.refresh();
    });
  }

  const doneCount = form.checklist.filter((c: any) => c.is_done).length;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink-900/20 backdrop-blur-[1px]" onClick={onClose} />

      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-white shadow-2xl">
        {/* หัวแผง */}
        <header className={cn('flex items-start gap-3 border-b border-ink-200 px-5 py-4', kindMeta(form.kind).block)}>
          <div className="min-w-0 flex-1">
            <p className="text-xxs font-medium uppercase tracking-wider opacity-70">
              {form.code} · {(dict.ui.taskKind as Record<string, string>)[kindMeta(form.kind).key]}
            </p>
            <textarea
              rows={1}
              className="mt-1 w-full resize-none bg-transparent text-lg font-semibold leading-snug outline-none"
              value={form.title}
              disabled={!canEdit}
              onChange={(e) => set('title', e.target.value)}
            />
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/50" title={L.closeEsc}>
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {err && (
            <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>
          )}

          {/* สถานะ / ความสำคัญ / ประเภท */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">{L.status}</label>
              <select className="input" value={form.status} disabled={!canEdit} onChange={(e) => set('status', e.target.value)}>
                {TASK_STATUS.map((s) => <option key={s.key} value={s.key}>{(dict.ui.taskStatus as Record<string, string>)[s.key]}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{L.priority}</label>
              <select className="input" value={form.priority} disabled={!canEdit} onChange={(e) => set('priority', e.target.value)}>
                {TASK_PRIORITY.map((p) => <option key={p.key} value={p.key}>{(dict.ui.taskPriority as Record<string, string>)[p.key]}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{L.kind}</label>
              <select className="input" value={form.kind} disabled={!canEdit} onChange={(e) => set('kind', e.target.value)}>
                {TASK_KIND.map((k) => <option key={k.key} value={k.key}>{(dict.ui.taskKind as Record<string, string>)[k.key]}</option>)}
              </select>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="label">{L.start}</label>
              <input type="datetime-local" className="input" disabled={!canEdit}
                value={toLocalInput(form.start_at)} onChange={(e) => set('start_at', fromLocalInput(e.target.value))} />
            </div>
            <div>
              <label className="label">{L.due}</label>
              <input type="datetime-local" className="input" disabled={!canEdit}
                value={toLocalInput(form.due_at)} onChange={(e) => set('due_at', fromLocalInput(e.target.value))} />
            </div>
          </div>

          {/* ผู้รับผิดชอบ */}
          <div className="mt-4">
            <label className="label">{L.assignee}</label>
            <div className="flex flex-wrap gap-1.5">
              {members.map((m) => {
                const on = assignees.includes(m.id);
                return (
                  <button
                    key={m.id}
                    disabled={!canEdit}
                    onClick={() => {
                      setAssignees((a) => (on ? a.filter((x) => x !== m.id) : [...a, m.id]));
                      setDirty(true);
                    }}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-xs ring-1 ring-inset transition',
                      on ? 'bg-brand-50 text-brand-800 ring-brand-300' : 'bg-white text-ink-500 ring-ink-200 hover:bg-ink-50'
                    )}
                  >
                    <Avatar name={m.name} size={20} />
                    {m.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* รายละเอียด */}
          <div className="mt-4">
            <label className="label">{L.description}</label>
            <textarea
              className="input min-h-[5rem]"
              disabled={!canEdit}
              value={form.description || ''}
              onChange={(e) => set('description', e.target.value)}
              placeholder={L.descPh}
            />
          </div>

          {/* งานที่เชื่อมกับเอกสารบัญชี */}
          {(form.doc || form.contact) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {form.doc && (
                <a href={`/sales/${form.doc.kind}/${form.doc.id}`} target="_blank" rel="noopener"
                   className="inline-flex items-center gap-1.5 rounded-lg bg-ink-50 px-2.5 py-1.5 text-xs text-ink-700 hover:bg-brand-50 hover:text-brand-700">
                  <Link2 className="h-3.5 w-3.5" strokeWidth={1.8} /> {form.doc.doc_number}
                </a>
              )}
              {form.contact && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-ink-50 px-2.5 py-1.5 text-xs text-ink-700">
                  {form.contact.name}
                </span>
              )}
            </div>
          )}

          {/* เช็กลิสต์ */}
          <section className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="section-title">{L.checklist}</h3>
              {form.checklist.length > 0 && (
                <span className="text-xxs tabular-nums text-ink-400">{doneCount}/{form.checklist.length}</span>
              )}
            </div>
            {form.checklist.length > 0 && (
              <div className="mb-2 h-1 overflow-hidden rounded-full bg-ink-100">
                <div className="h-full rounded-full bg-brand-500 transition-all"
                     style={{ width: `${(doneCount / form.checklist.length) * 100}%` }} />
              </div>
            )}
            <ul className="space-y-1">
              {form.checklist.map((c: any) => (
                <li key={c.id} className="group flex items-center gap-2">
                  <button
                    disabled={!canEdit || pending}
                    onClick={() => run(() => toggleChecklistItem(c.id, !c.is_done))}
                    className="text-ink-400 hover:text-brand-600"
                  >
                    {c.is_done
                      ? <CheckSquare className="h-4 w-4 text-brand-600" strokeWidth={1.8} />
                      : <Square className="h-4 w-4" strokeWidth={1.8} />}
                  </button>
                  <span className={cn('flex-1 text-sm', c.is_done && 'text-ink-400 line-through')}>{c.title}</span>
                  {canEdit && (
                    <button
                      onClick={() => run(() => deleteChecklistItem(c.id))}
                      className="opacity-0 transition group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-ink-400 hover:text-rose-600" strokeWidth={1.8} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {canEdit && (
              <form
                className="mt-2 flex gap-2"
                onSubmit={(e) => { e.preventDefault(); if (check.trim()) run(() => addChecklistItem(form.id, check), () => setCheck('')); }}
              >
                <input className="input py-1.5 text-sm" placeholder={L.addChecklistPh}
                       value={check} onChange={(e) => setCheck(e.target.value)} />
                <button className="btn-secondary px-2.5 py-1.5" disabled={pending || !check.trim()}>
                  <Plus className="h-4 w-4" strokeWidth={2} />
                </button>
              </form>
            )}
          </section>

          {/* ไฟล์แนบ */}
          <section className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="section-title">{L.attachments}</h3>
              {canEdit && (
                <>
                  <input ref={fileRef} type="file" className="hidden"
                         accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.csv,.xls,.xlsx" onChange={pickFile} />
                  <button className="btn-ghost px-2 py-1 text-xs" disabled={pending} onClick={() => fileRef.current?.click()}>
                    <Paperclip className="h-3.5 w-3.5" strokeWidth={1.8} /> {L.attach}
                  </button>
                </>
              )}
            </div>
            {form.attachments.length === 0 ? (
              <p className="text-xs text-ink-400">{L.noAttachments}</p>
            ) : (
              <ul className="space-y-1">
                {form.attachments.map((a: any) => (
                  <li key={a.id} className="group flex items-center gap-2">
                    <button onClick={() => openFile(a.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm text-ink-700 hover:text-brand-700">
                      {busy === a.id ? <ShdSpinner size={14} /> : <ExternalLink className="h-3.5 w-3.5 shrink-0 text-ink-400" strokeWidth={1.8} />}
                      <span className="truncate">{a.file_name}</span>
                    </button>
                    {canEdit && (
                      <button onClick={() => run(() => deleteAttachment(a.id))} className="opacity-0 transition group-hover:opacity-100">
                        <Trash2 className="h-3.5 w-3.5 text-ink-400 hover:text-rose-600" strokeWidth={1.8} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* โน้ต */}
          <section className="mt-6">
            <h3 className="section-title mb-2">{L.notes}</h3>
            <ul className="space-y-3">
              {form.comments.map((c: any) => (
                <li key={c.id} className="group flex gap-2.5">
                  <Avatar name={c.author} size={26} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-xxs text-ink-400">
                      <b className="font-medium text-ink-600">{c.author}</b>
                      {relTime(c.created_at, dict, locale)}
                      {(c.created_by === currentUserId || canDelete) && (
                        <button onClick={() => run(() => deleteComment(c.id))}
                                className="opacity-0 transition group-hover:opacity-100">
                          <Trash2 className="h-3 w-3 hover:text-rose-600" strokeWidth={1.8} />
                        </button>
                      )}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-ink-800">{c.body}</p>
                  </div>
                </li>
              ))}
              {form.comments.length === 0 && (
                <li className="text-xs text-ink-400">{L.noNotes}</li>
              )}
            </ul>

            {canEdit && (
              <form
                className="mt-3 flex gap-2"
                onSubmit={(e) => { e.preventDefault(); if (note.trim()) run(() => addComment(form.id, note), () => setNote('')); }}
              >
                <textarea
                  className="input min-h-[2.5rem] py-2 text-sm"
                  rows={1}
                  placeholder={L.notePh}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && note.trim()) {
                      e.preventDefault();
                      run(() => addComment(form.id, note), () => setNote(''));
                    }
                  }}
                />
                <button className="btn-primary self-end px-3 py-2" disabled={pending || !note.trim()}>
                  <Send className="h-4 w-4" strokeWidth={1.8} />
                </button>
              </form>
            )}
          </section>
        </div>

        {/* ท้ายแผง */}
        <footer className="flex items-center justify-between gap-2 border-t border-ink-200 bg-ink-50 px-5 py-3">
          {canDelete ? (
            <button
              className="btn-ghost text-rose-600 hover:bg-rose-50"
              disabled={pending}
              onClick={() => run(() => deleteTask(form.id), onClose)}
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.8} /> {L.deleteTask}
            </button>
          ) : <span />}

          <div className="flex items-center gap-2">
            {dirty && <span className="text-xxs text-amber-700">{L.unsaved}</span>}
            <button className="btn-secondary" onClick={onClose}>{dict.common.close}</button>
            {canEdit && (
              <button className="btn-primary" disabled={pending || !dirty} onClick={save}>
                {pending && <ShdSpinner size={16} />} {dict.common.save}
              </button>
            )}
          </div>
        </footer>
      </aside>
    </>
  );
}

/** ป้ายเวลาเล็ก ๆ ใช้ซ้ำในหลายที่ */
export function DueBadge({ due, overdue }: { due: string; overdue: boolean }) {
  const { locale } = useI18n();
  return (
    <span className={cn('inline-flex items-center gap-1 text-xxs', overdue ? 'font-medium text-rose-600' : 'text-ink-400')}>
      <CalendarClock className="h-3 w-3" strokeWidth={1.8} />
      {dayMonth(due, locale)}
    </span>
  );
}
