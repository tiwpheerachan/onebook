import { cn } from '@/lib/cn';

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('min-w-full divide-y divide-ink-200', className)}>{children}</table>
    </div>
  );
}
export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-ink-50">{children}</thead>;
}
export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-ink-100 bg-white">{children}</tbody>;
}
export function TR({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tr className={cn('hover:bg-brand-50/40 transition-colors', className)}>{children}</tr>;
}
export function TH({ children, align = 'left', className, colSpan }: { children?: React.ReactNode; align?: 'left' | 'right' | 'center'; className?: string; colSpan?: number }) {
  return <th colSpan={colSpan} className={cn('th-cell', align === 'right' && 'text-right', align === 'center' && 'text-center', className)}>{children}</th>;
}
export function TD({ children, align = 'left', className, colSpan }: { children?: React.ReactNode; align?: 'left' | 'right' | 'center'; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={cn('td-cell', align === 'right' && 'num', align === 'center' && 'text-center', className)}>{children}</td>;
}
export function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-12 text-center text-sm text-ink-400">{label}</td>
    </tr>
  );
}
