'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  LayoutDashboard, TrendingUp, ShoppingCart, Users, Wallet,
  BookOpen, BarChart3, Receipt, Settings, ChevronDown,
  PanelLeftClose, PanelLeftOpen, Search,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import type { NavGroup } from './nav-config';

const ICONS: Record<string, any> = {
  LayoutDashboard, TrendingUp, ShoppingCart, Users, Wallet, BookOpen, BarChart3, Receipt, Settings,
};

const W_KEY = 'ob_nav_width';
const C_KEY = 'ob_nav_collapsed';
const MIN_W = 190;
const MAX_W = 380;
const RAIL_W = 60;

export function Sidebar({
  groups, appName, onOpenSearch,
}: {
  groups: NavGroup[];
  appName: string;
  onOpenSearch?: () => void;
}) {
  const pathname = usePathname();
  const activeGroup = groups.find((g) => g.items.some((i) => pathname.startsWith(i.href)))?.id;
  const [open, setOpen] = useState<string[]>([activeGroup || 'overview']);
  const [width, setWidth] = useState(240);
  const [collapsed, setCollapsed] = useState(false);
  const [dragging, setDragging] = useState(false);
  // เมนูย่อยตอนพับ ต้องวาดนอก <aside> ผ่าน portal
  // เพราะ nav มี overflow ซึ่งจะตัดกล่องที่ยื่นออกไปทางขวาจนมองไม่เห็น
  const [flyout, setFlyout] = useState<{ id: string; top: number; left: number } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // กันภาพกระพริบ : ก่อนอ่านค่าที่จำไว้เสร็จ ยังไม่ต้องวาดความกว้าง
  const [ready, setReady] = useState(false);
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const w = Number(localStorage.getItem(W_KEY));
    if (w >= MIN_W && w <= MAX_W) setWidth(w);
    setCollapsed(localStorage.getItem(C_KEY) === '1');
    setReady(true);
  }, []);

  // เปิดหมวดที่ตรงกับหน้าปัจจุบันให้อัตโนมัติเวลาเปลี่ยนหน้า
  useEffect(() => {
    if (activeGroup) setOpen((prev) => (prev.includes(activeGroup) ? prev : [...prev, activeGroup]));
  }, [activeGroup]);

  const toggleGroup = (id: string) =>
    setOpen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const setCollapse = useCallback((v: boolean) => {
    setCollapsed(v);
    setFlyout(null);
    localStorage.setItem(C_KEY, v ? '1' : '0');
  }, []);

  /* ---------------- เมนูย่อยแบบชี้แล้วกาง (โหมดพับ) ---------------- */
  const holdOpen = () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  // หน่วงก่อนปิด เพื่อให้ลากเมาส์จากไอคอนเข้าไปในกล่องได้ทัน
  const scheduleClose = () => {
    holdOpen();
    closeTimer.current = setTimeout(() => setFlyout(null), 160);
  };

  const openFlyout = (id: string, el: HTMLElement, itemCount: number) => {
    holdOpen();
    const r = el.getBoundingClientRect();
    const estH = 34 + itemCount * 30;                     // ความสูงโดยประมาณของกล่อง
    const top = Math.min(Math.max(8, r.top - 6), window.innerHeight - estH - 8);
    setFlyout({ id, top, left: r.right });
  };

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  // เลื่อนหน้าหรือเปลี่ยนหน้าแล้วให้ปิดกล่องทิ้ง ไม่งั้นมันจะค้างผิดตำแหน่ง
  useEffect(() => { setFlyout(null); }, [pathname]);
  useEffect(() => {
    if (!flyout) return;
    const close = () => setFlyout(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [flyout]);

  /* ---------------- ลากขอบเพื่อปรับความกว้าง ---------------- */
  const startDrag = (e: React.MouseEvent) => {
    if (collapsed) return;
    e.preventDefault();
    setDragging(true);
    const startX = e.clientX;
    const startW = width;

    const move = (ev: MouseEvent) => {
      const next = Math.min(MAX_W, Math.max(MIN_W, startW + ev.clientX - startX));
      setWidth(next);
      // ลากเข้าไปจนสุดแล้วยังลากต่อ ให้พับเก็บไปเลย เป็นท่าที่คนคุ้นจาก editor
      if (startW + ev.clientX - startX < MIN_W - 40) {
        setCollapse(true);
        end();
      }
    };
    const end = () => {
      setDragging(false);
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', end);
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
      setWidth((w) => { localStorage.setItem(W_KEY, String(w)); return w; });
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', end);
  };

  // ดับเบิลคลิกที่ขอบ = คืนความกว้างมาตรฐาน
  const resetWidth = () => { setWidth(240); localStorage.setItem(W_KEY, '240'); };

  /* ---------------- ปุ่มลัด ---------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Cmd/Ctrl + B พับ–กางแถบเมนู (เหมือน editor ทั่วไป)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setCollapse(!collapsed);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [collapsed, setCollapse]);

  const w = collapsed ? RAIL_W : width;

  return (
    <aside
      ref={asideRef}
      style={{ width: ready ? w : undefined }}
      className={cn(
        'no-print relative hidden shrink-0 border-r border-ink-200 bg-white lg:block',
        !dragging && 'transition-[width] duration-150',
        !ready && 'w-60'
      )}
    >
      {/* ---------- หัวแถบ ---------- */}
      <div className={cn('flex h-14 items-center border-b border-ink-200', collapsed ? 'justify-center px-2' : 'gap-2.5 px-4')}>
        <img
          src="/brand/onebook-mark.png"
          alt=""
          width={28}
          height={28}
          className="h-7 w-7 shrink-0 rounded-md object-cover ring-1 ring-sea-900/10"
        />
        {!collapsed && (
          <>
            <span className="flex-1 truncate text-sm font-semibold tracking-tight text-ink-900">{appName}</span>
            <button
              type="button"
              onClick={() => setCollapse(true)}
              title="พับแถบเมนู (⌘B)"
              className="rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
            >
              <PanelLeftClose className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </>
        )}
      </div>

      {collapsed && (
        <button
          type="button"
          onClick={() => setCollapse(false)}
          title="กางแถบเมนู (⌘B)"
          className="mx-auto mt-2 flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700"
        >
          <PanelLeftOpen className="h-4 w-4" strokeWidth={1.8} />
        </button>
      )}

      {/* ---------- ปุ่มค้นหา ---------- */}
      {onOpenSearch && (
        <div className={cn('border-b border-ink-100 pb-3 pt-3', collapsed ? 'px-2' : 'px-3')}>
          <button
            type="button"
            onClick={onOpenSearch}
            title="ค้นหาทุกอย่าง (⌘K)"
            className={cn(
              'flex w-full items-center rounded-lg border border-ink-200 bg-ink-50/60 text-ink-500 transition hover:border-brand-300 hover:bg-white hover:text-ink-700',
              collapsed ? 'justify-center p-2' : 'gap-2 px-2.5 py-1.5'
            )}
          >
            <Search className="h-4 w-4 shrink-0" strokeWidth={1.8} />
            {!collapsed && (
              <>
                <span className="flex-1 truncate text-left text-[13px]">ค้นหาทุกอย่าง</span>
                <kbd className="rounded border border-ink-200 bg-white px-1 py-0.5 font-mono text-xxs text-ink-400">⌘K</kbd>
              </>
            )}
          </button>
        </div>
      )}

      {/* ---------- รายการเมนู ---------- */}
      <nav className={cn('overflow-y-auto overflow-x-hidden py-3', collapsed ? 'px-2' : 'px-3')}
           style={{ height: `calc(100vh - ${onOpenSearch ? '7.75rem' : '3.5rem'})` }}>
        {groups.map((g) => {
          const Icon = ICONS[g.icon] || LayoutDashboard;
          const isOpen = open.includes(g.id);
          const hasActive = g.items.some((i) => pathname === i.href || pathname.startsWith(i.href + '/'));

          /* ----- โหมดพับ : แสดงเฉพาะไอคอน กางเมนูย่อยตอนชี้ ----- */
          if (collapsed) {
            const shown = flyout?.id === g.id;
            return (
              <div key={g.id} className="mb-1">
                <Link
                  href={g.items[0].href}
                  aria-label={g.label}
                  onMouseEnter={(e) => openFlyout(g.id, e.currentTarget, g.items.length)}
                  onFocus={(e) => openFlyout(g.id, e.currentTarget, g.items.length)}
                  onMouseLeave={scheduleClose}
                  onBlur={scheduleClose}
                  className={cn(
                    'flex h-9 w-full items-center justify-center rounded-lg transition',
                    hasActive || shown
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-ink-500 hover:bg-ink-100 hover:text-ink-800'
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                </Link>
              </div>
            );
          }

          /* ----- โหมดปกติ ----- */
          return (
            <div key={g.id} className="mb-1">
              <button
                type="button"
                onClick={() => toggleGroup(g.id)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition',
                  hasActive ? 'text-brand-700' : 'text-ink-600 hover:bg-ink-50'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                <span className="flex-1 truncate text-left">{g.label}</span>
                <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', isOpen && 'rotate-180')} />
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

      {/* ---------- เมนูย่อยตอนพับ (วาดที่ body เพื่อไม่ให้ถูก overflow ตัด) ---------- */}
      {collapsed && flyout && typeof document !== 'undefined' && createPortal(
        (() => {
          const g = groups.find((x) => x.id === flyout.id);
          if (!g) return null;
          return (
            <div
              onMouseEnter={holdOpen}
              onMouseLeave={scheduleClose}
              style={{ top: flyout.top, left: flyout.left }}
              className="fixed z-[60] pl-2"
            >
              <div className="w-60 rounded-xl border border-ink-200 bg-white py-1.5 shadow-pop">
                <p className="px-3 pb-1.5 pt-1 text-xxs font-semibold uppercase tracking-wide text-ink-400">
                  {g.label}
                </p>
                {g.items.map((i) => {
                  const active = pathname === i.href || pathname.startsWith(i.href + '/');
                  return (
                    <Link
                      key={i.href}
                      href={i.href}
                      onClick={() => setFlyout(null)}
                      className={cn(
                        'block truncate px-3 py-1.5 text-[13px]',
                        active ? 'bg-brand-50 font-medium text-brand-700' : 'text-ink-600 hover:bg-ink-50'
                      )}
                    >
                      {i.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })(),
        document.body
      )}

      {/* ---------- ขอบสำหรับลากปรับความกว้าง ---------- */}
      {!collapsed && (
        <div
          onMouseDown={startDrag}
          onDoubleClick={resetWidth}
          title="ลากเพื่อปรับความกว้าง · ดับเบิลคลิกเพื่อคืนค่าเดิม"
          className={cn(
            'absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize',
            'after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent',
            'hover:after:bg-brand-400',
            dragging && 'after:bg-brand-500'
          )}
        />
      )}
    </aside>
  );
}
