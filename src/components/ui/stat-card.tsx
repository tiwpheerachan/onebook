import { cn } from '@/lib/cn';
import { money } from '@/lib/format';

export function StatCard({
  label, value, suffix, tone = 'neutral', hint, isCurrency = true,
}: {
  label: string; value: number | string; suffix?: string;
  tone?: 'neutral' | 'positive' | 'negative' | 'brand'; hint?: string; isCurrency?: boolean;
}) {
  const toneCls = {
    neutral: 'text-ink-900',
    positive: 'text-emerald-600',
    negative: 'text-rose-600',
    brand: 'text-brand-700',
  }[tone];
  return (
    <div className="card card-pad">
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p className={cn('mt-2 text-2xl font-semibold tabular-nums tracking-tight', toneCls)}>
        {isCurrency && typeof value === 'number' ? money(value) : value}
        {suffix && <span className="ml-1 text-sm font-normal text-ink-400">{suffix}</span>}
      </p>
      {hint && <p className="mt-1 text-xxs text-ink-400">{hint}</p>}
    </div>
  );
}
