import Link from 'next/link';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { money } from '@/lib/format';

/**
 * การ์ดตัวเลขบนหน้าแรก
 *
 * รองรับสามอย่างที่ของเดิมไม่มี
 *   href      กดแล้วไปหน้ารายงานที่มาของตัวเลข — ตัวเลขบนแดชบอร์ดควรเจาะลงไปได้
 *   delta     ทิศทางเทียบงวดก่อน ตัวเลขเดี่ยว ๆ ไม่บอกว่าดีขึ้นหรือแย่ลง
 *   size      ให้ลำดับความสำคัญต่างกันได้ ไม่ใช่ทุกใบเท่ากันหมด
 */
export function StatCard({
  label, value, suffix, tone = 'neutral', hint, isCurrency = true,
  href, delta, deltaLabel, size = 'md',
}: {
  label: string;
  value: number | string;
  suffix?: string;
  tone?: 'neutral' | 'positive' | 'negative' | 'brand';
  hint?: string;
  isCurrency?: boolean;
  href?: string;
  /** สัดส่วนการเปลี่ยนแปลงเทียบงวดก่อน เช่น 0.12 = +12% */
  delta?: number | null;
  deltaLabel?: string;
  size?: 'md' | 'lg';
}) {
  const toneCls = {
    neutral: 'text-ink-900',
    positive: 'text-emerald-600',
    negative: 'text-rose-600',
    brand: 'text-brand-700',
  }[tone];

  const D = delta == null ? null : delta > 0.001 ? TrendingUp : delta < -0.001 ? TrendingDown : Minus;
  const deltaTone = delta == null ? ''
    : delta > 0.001 ? 'text-emerald-600'
    : delta < -0.001 ? 'text-rose-600' : 'text-ink-400';

  const body = (
    <>
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p className={cn('mt-2 font-semibold tabular-nums tracking-tight',
        size === 'lg' ? 'text-3xl' : 'text-2xl', toneCls)}>
        {isCurrency && typeof value === 'number' ? money(value) : value}
        {suffix && <span className="ml-1 text-sm font-normal text-ink-400">{suffix}</span>}
      </p>
      {D && (
        <p className={cn('mt-1 flex items-center gap-1 text-xxs tabular-nums', deltaTone)}>
          <D className="h-3 w-3" strokeWidth={2} />
          {delta! > 0 ? '+' : ''}{(delta! * 100).toFixed(1)}%
          {deltaLabel && <span className="text-ink-400">{deltaLabel}</span>}
        </p>
      )}
      {hint && <p className="mt-1 text-xxs text-ink-400">{hint}</p>}
    </>
  );

  // ที่กดได้ต้องดูเหมือนกดได้ จึงมี hover ชัดเจนและลูกศรเล็ก ๆ
  return href ? (
    <Link href={href}
          className="card card-pad group transition hover:border-brand-200 hover:shadow-card">
      {body}
      <span className="mt-1 block text-xxs text-ink-300 transition group-hover:text-brand-600">→</span>
    </Link>
  ) : (
    <div className="card card-pad">{body}</div>
  );
}
