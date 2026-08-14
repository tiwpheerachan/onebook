'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

/** แท็บย่อยของหมวดการเงิน — รายการที่ยังไม่มีจะขึ้นเป็นสีจางและกดไม่ได้ */
const TABS: { label: string; href?: string; match?: string }[] = [
  { label: 'ภาพรวม', href: '/finance', match: '/finance' },
  { label: 'เงินสด/ธนาคาร/e-Wallet', href: '/finance/channels', match: '/finance/channels' },
  { label: 'รับ-จ่ายเงิน', href: '/finance/payments', match: '/finance/payments' },
  { label: 'กระทบยอดธนาคาร', href: '/finance/reconcile', match: '/finance/reconcile' },
  { label: 'ภาษีหัก ณ ที่จ่าย', href: '/tax/wht', match: '/tax/wht' },
  { label: 'เช็ครับ' },
  { label: 'เช็คจ่าย' },
  { label: 'สำรองรับจ่าย' },
];

export function FinanceTabs() {
  const path = usePathname();

  return (
    <nav className="mb-5 flex flex-wrap items-center gap-x-1 gap-y-1 border-b border-ink-200">
      {TABS.map((tb) => {
        const active = tb.match === path;
        if (!tb.href) {
          return (
            <span
              key={tb.label}
              title="ยังไม่มีในระบบ"
              className="cursor-not-allowed border-b-2 border-transparent px-3 py-2 text-sm text-ink-300"
            >
              {tb.label}
            </span>
          );
        }
        return (
          <Link
            key={tb.label}
            href={tb.href}
            className={cn(
              'border-b-2 px-3 py-2 text-sm transition',
              active
                ? 'border-brand-600 font-medium text-brand-700'
                : 'border-transparent text-ink-600 hover:border-ink-300 hover:text-ink-900'
            )}
          >
            {tb.label}
          </Link>
        );
      })}
    </nav>
  );
}
