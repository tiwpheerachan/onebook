'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileCheck2, Printer, Ban } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { issueWhtCertificate, cancelWhtCertificate } from '@/actions/wht';

/** ออกหนังสือรับรองหัก ณ ที่จ่ายจากเอกสาร แล้วเปิดหน้าพิมพ์ให้ทันที */
export function IssueWhtButton({ documentId, canIssue }: { documentId: string; canIssue: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  if (!canIssue) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      {err && <span className="max-w-[16rem] text-right text-xxs text-rose-600">{err}</span>}
      <button
        className="btn-secondary h-7 px-2 py-1 text-xs"
        disabled={pending}
        title="ออกหนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)"
        onClick={() =>
          start(async () => {
            setErr('');
            const res = await issueWhtCertificate(documentId);
            if (!res.ok) { setErr(res.error || ''); return; }
            router.refresh();
            window.open(`/wht/${res.id}`, '_blank', 'noopener');
          })
        }
      >
        {pending ? <ShdSpinner size={14} /> : <FileCheck2 className="h-3.5 w-3.5" strokeWidth={1.8} />}
        ออก 50 ทวิ
      </button>
    </div>
  );
}

export function WhtCertActions({
  certId, status, canEdit,
}: {
  certId: string;
  status: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  return (
    <div className="flex items-center justify-end gap-1">
      {err && <span className="mr-1 max-w-[12rem] text-xxs text-rose-600">{err}</span>}
      <a
        href={`/wht/${certId}`}
        target="_blank"
        rel="noopener"
        title="พิมพ์ 50 ทวิ"
        className="rounded p-1 text-ink-400 hover:bg-brand-50 hover:text-brand-600"
      >
        <Printer className="h-4 w-4" strokeWidth={1.8} />
      </a>
      {canEdit && status === 'issued' && (
        <button
          title="ยกเลิกหนังสือรับรอง"
          disabled={pending}
          className="rounded p-1 text-ink-400 hover:bg-rose-50 hover:text-rose-600"
          onClick={() =>
            start(async () => {
              setErr('');
              const res = await cancelWhtCertificate(certId);
              if (!res.ok) { setErr(res.error || ''); return; }
              router.refresh();
            })
          }
        >
          {pending ? <ShdSpinner size={14} /> : <Ban className="h-4 w-4" strokeWidth={1.8} />}
        </button>
      )}
    </div>
  );
}
