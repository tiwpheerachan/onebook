'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, FileSpreadsheet, Users2, FileText } from 'lucide-react';
import { cn } from '@/lib/cn';

const TABS = [
  { href: '/peak', label: 'ภาพรวม', icon: LayoutDashboard },
  { href: '/peak/statements', label: 'งบการเงิน', icon: FileSpreadsheet },
  { href: '/peak/ar-ap', label: 'ลูกหนี้ / เจ้าหนี้', icon: Users2 },
  { href: '/peak/documents', label: 'เอกสาร', icon: FileText },
];

export function PeakTabs() {
  const path = usePathname();
  return (
    <div className="mb-5 flex flex-wrap gap-1 rounded-xl border border-slate-100 bg-white p-1 shadow-sm">
      {TABS.map((t) => {
        const active = path === t.href;
        const Icon = t.icon;
        return (
          <Link key={t.href} href={t.href}
            className={cn('flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition',
              active ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50')}>
            <Icon size={15} />{t.label}
          </Link>
        );
      })}
    </div>
  );
}
