'use client';
import { X } from 'lucide-react';

export function SlidePanel({
  open, onClose, title, children, footer,
}: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink-900/20 backdrop-blur-[1px]" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-pop">
        <div className="flex items-center justify-between border-b border-ink-200 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-ink-400 hover:bg-ink-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="border-t border-ink-200 px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}
