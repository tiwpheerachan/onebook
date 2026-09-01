'use client';
import Link from 'next/link';
import { useI18n } from '@/i18n/provider';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

/** แท็บย่อยของหมวดการเงิน — รายการที่ยังไม่มีจะขึ้นเป็นสีจางและกดไม่ได้ */
const TABS: { key: 'overview'|'channels'|'payments'|'reconcile'|'wht'|'chequeIn'|'chequeOut'|'petty'; href?: string; match?: string }[] = [
  { key: 'overview' as const, href: '/finance', match: '/finance' },
  { key: 'channels' as const, href: '/finance/channels', match: '/finance/channels' },
  { key: 'payments' as const, href: '/finance/payments', match: '/finance/payments' },
  { key: 'reconcile' as const, href: '/finance/reconcile', match: '/finance/reconcile' },
  { key: 'wht' as const, href: '/tax/wht', match: '/tax/wht' },
  { key: 'chequeIn' as const },
  { key: 'chequeOut' as const },
  { key: 'petty' as const },
];

export function FinanceTabs() {
  const { dict: d } = useI18n();
  const L = d.ui.financeTab;
  const path = usePathname();

  return (
    <nav className="mb-5 flex flex-wrap items-center gap-x-1 gap-y-1 border-b border-ink-200">
      {TABS.map((tb) => {
        const active = tb.match === path;
        if (!tb.href) {
          return (
            <span
              key={tb.key}
              title={L.notYet}
              className="cursor-not-allowed border-b-2 border-transparent px-3 py-2 text-sm text-ink-300"
            >
              {L[tb.key]}
            </span>
          );
        }
        return (
          <Link
            key={tb.key}
            href={tb.href}
            className={cn(
              'border-b-2 px-3 py-2 text-sm transition',
              active
                ? 'border-brand-600 font-medium text-brand-700'
                : 'border-transparent text-ink-600 hover:border-ink-300 hover:text-ink-900'
            )}
          >
            {L[tb.key]}
          </Link>
        );
      })}
    </nav>
  );
}
