'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Paperclip, Trash2, ExternalLink, Upload } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { uploadAttachment, attachmentUrl, deleteAttachment } from '@/actions/attachments';

export interface AttachmentRow {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

const fileSize = (b: number | null) => {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
};

/**
 * ไฟล์แนบของเอกสาร เช่น สลิปโอนเงิน ใบเสร็จตัวจริง สัญญา
 * เก็บไว้ให้ผู้สอบบัญชีตรวจย้อนหลังได้โดยไม่ต้องรื้อแฟ้มกระดาษ
 */
export function AttachmentPanel({
  documentId, rows, canEdit, canDelete, label,
}: {
  documentId: string;
  rows: AttachmentRow[];
  canEdit: boolean;
  canDelete: boolean;
  label: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState('');
  const [pending, start] = useTransition();

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr('');
    const fd = new FormData();
    fd.set('document_id', documentId);
    fd.set('file', file);
    start(async () => {
      const res = await uploadAttachment(fd);
      if (inputRef.current) inputRef.current.value = '';
      if (!res.ok) { setErr(res.error || ''); return; }
      router.refresh();
    });
  }

  async function open(id: string) {
    setErr(''); setBusyId(id);
    const res = await attachmentUrl(id);
    setBusyId('');
    if (!res.ok || !res.url) { setErr(res.error || 'เปิดไฟล์ไม่สำเร็จ'); return; }
    window.open(res.url, '_blank', 'noopener');
  }

  function remove(id: string) {
    setErr(''); setBusyId(id);
    start(async () => {
      const res = await deleteAttachment(id);
      setBusyId('');
      if (!res.ok) { setErr(res.error || ''); return; }
      router.refresh();
    });
  }

  return (
    <div className="card mt-5 no-print">
      <div className="flex items-center justify-between gap-3 border-b border-ink-200 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-ink-400" strokeWidth={1.8} />
          <h2 className="text-sm font-semibold text-ink-900">{label}</h2>
          {rows.length > 0 && <span className="text-xs text-ink-400">({rows.length})</span>}
        </div>
        {canEdit && (
          <>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.csv,.xls,.xlsx"
              onChange={pick}
            />
            <button className="btn-secondary" disabled={pending} onClick={() => inputRef.current?.click()}>
              {pending ? <ShdSpinner size={16} /> : <Upload className="h-4 w-4 text-ink-400" strokeWidth={1.8} />}
              แนบไฟล์
            </button>
          </>
        )}
      </div>

      {err && (
        <p className="mx-5 mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>
      )}

      {rows.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-ink-400">
          ยังไม่มีไฟล์แนบ — แนบสลิปโอนเงินหรือใบเสร็จตัวจริงไว้เพื่อใช้ตรวจสอบย้อนหลัง
        </p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-5 py-2.5">
              <button
                onClick={() => open(r.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm text-ink-800 hover:text-brand-700"
              >
                {busyId === r.id ? <ShdSpinner size={14} /> : <ExternalLink className="h-3.5 w-3.5 shrink-0 text-ink-400" strokeWidth={1.8} />}
                <span className="truncate">{r.file_name}</span>
              </button>
              <span className="shrink-0 text-xxs tabular-nums text-ink-400">{fileSize(r.size_bytes)}</span>
              {canDelete && (
                <button
                  onClick={() => remove(r.id)}
                  disabled={pending}
                  title="ลบไฟล์แนบ"
                  className="shrink-0 rounded p-1 text-ink-400 hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
