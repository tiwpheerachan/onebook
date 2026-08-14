'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  LayoutDashboard, TrendingUp, ShoppingCart, Users, Wallet,
  BookOpen, BarChart3, Receipt, Settings, ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import type { NavGroup } from './nav-config';

const ICONS: Record<string, any> = {
  LayoutDashboard, TrendingUp, ShoppingCart, Users, Wallet, BookOpen, BarChart3, Receipt, Settings,
};

export function Sidebar({ groups, appName }: { groups: NavGroup[]; appName: string }) {
  const pathname = usePathname();
  const activeGroup = groups.find((g) => g.items.some((i) => pathname.startsWith(i.href)))?.id;
  const [open, setOpen] = useState<string[]>([activeGroup || 'overview']);

  const toggle = (id: string) =>
    setOpen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <aside className="no-print hidden w-60 shrink-0 border-r border-ink-200 bg-white lg:block">
      <div className="flex h-14 items-center gap-2.5 border-b border-ink-200 px-5">
        <img
          src="/brand/onebook-mark.png"
          alt=""
          width={28}
          height={28}
          className="h-7 w-7 shrink-0 rounded-md object-cover ring-1 ring-sea-900/10"
        />
        <span className="text-sm font-semibold tracking-tight text-ink-900">{appName}</span>
      </div>

      <nav className="h-[calc(100vh-3.5rem)] overflow-y-auto px-3 py-4">
        {groups.map((g) => {
          const Icon = ICONS[g.icon] || LayoutDashboard;
          const isOpen = open.includes(g.id);
          const hasActive = g.items.some((i) => pathname === i.href || pathname.startsWith(i.href + '/'));
          return (
            <div key={g.id} className="mb-1">
              <button
                type="button"
                onClick={() => toggle(g.id)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition',
                  hasActive ? 'text-brand-700' : 'text-ink-600 hover:bg-ink-50'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                <span className="flex-1 truncate text-left">{g.label}</span>
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-180')} />
              </button>
              {isOpen && (
                <div className="ml-4 mt-0.5 space-y-0.5 border-l border-ink-200 pl-3">
                  {g.items.map((i) => {
                    const active = pathname === i.href || pathname.startsWith(i.href + '/');
                    return (
                      <Link
                        key={i.href}
                        href={i.href}
                        className={cn(
                          'block truncate rounded-md px-2.5 py-1.5 text-[13px] transition',
                          active
                            ? 'bg-brand-50 font-medium text-brand-700'
                            : 'text-ink-500 hover:bg-ink-50 hover:text-ink-800'
                        )}
                      >
                        {i.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
