'use client';
import { useState, useTransition } from 'react';
import { ExternalLink } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { attachmentUrl } from '@/actions/attachments';

/**
 * เปิดไฟล์แนบ
 *
 * ไม่ฝัง URL ไว้ในหน้า แต่ขอลิงก์ตอนกด เพราะลิงก์มีอายุ 5 นาที
 * ถ้าใส่ไว้ตั้งแต่ render หน้าที่เปิดค้างไว้นาน ๆ จะกดแล้วลิงก์หมดอายุพอดี
 */
export function FileOpenButton({ id, label }: { id: string; label: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');

  return (
    <>
      <button
        type="button"
        disabled={pending}
        title={label}
        onClick={() =>
          start(async () => {
            setErr('');
            const res = await attachmentUrl(id);
            if (!res.ok || !res.url) { setErr(res.error || '—'); return; }
            window.open(res.url, '_blank', 'noopener,noreferrer');
          })
        }
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ink-500 hover:bg-brand-50 hover:text-brand-700"
      >
        {pending ? <ShdSpinner size={14} /> : <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.8} />}
        {label}
      </button>
      {err && <span className="ml-1 text-xxs text-rose-600">{err}</span>}
    </>
  );
}
