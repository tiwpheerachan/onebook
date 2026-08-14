import { cn } from '@/lib/cn';
import { STATUS_STYLE } from '@/lib/constants';

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span className={cn('chip', STATUS_STYLE[status] || 'bg-ink-100 text-ink-600 ring-ink-200')}>
      {label || status}
    </span>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'brand' | 'success' | 'warn' | 'danger' }) {
  const tones = {
    neutral: 'bg-ink-100 text-ink-600 ring-ink-200',
    brand: 'bg-brand-50 text-brand-700 ring-brand-200',
    success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    warn: 'bg-amber-50 text-amber-700 ring-amber-200',
    danger: 'bg-rose-50 text-rose-700 ring-rose-200',
  };
  return <span className={cn('chip', tones[tone])}>{children}</span>;
}
