'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export function SlidePanel({
  open, onClose, title, children, footer,
}: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  // ต้องรอให้ถึงฝั่งเบราว์เซอร์ก่อนถึงจะมี document ให้ยิง portal ลงไปได้
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!open || !mounted) return null;

  // ย้ายไปแขวนที่ body เพราะแผงส่วนใหญ่ถูกเปิดจากปุ่มในช่องตาราง
  // ซึ่ง .td-cell ตั้ง whitespace-nowrap ไว้ ข้อความไทยยาว ๆ ในแผงจึงไม่ยอมตัดบรรทัด
  // แล้วล้นออกนอกกรอบ อีกทั้ง text-right ของช่องก็ตกทอดมาด้วย
  // อยู่ที่ body ยังกัน ancestor ที่มี transform ทำให้ position:fixed เพี้ยนได้อีกชั้น
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end whitespace-normal break-words text-left">
      <div className="absolute inset-0 bg-ink-900/20" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-pop">
        <div className="flex items-center justify-between gap-3 border-b border-ink-200 px-5 py-3.5">
          <h2 className="min-w-0 truncate text-sm font-semibold text-ink-900">{title}</h2>
          <button onClick={onClose} className="shrink-0 rounded p-1 text-ink-400 hover:bg-ink-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="border-t border-ink-200 px-5 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
