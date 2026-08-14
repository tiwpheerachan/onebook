'use client';
import { Printer } from 'lucide-react';

export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn-secondary no-print">
      <Printer className="h-4 w-4 text-ink-400" strokeWidth={1.8} /> {label}
    </button>
  );
}
