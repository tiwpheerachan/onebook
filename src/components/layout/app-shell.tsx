'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Search, Sparkles, CalendarCheck, ClipboardCheck, ScanLine,
  TrendingUp, Wallet, Layers,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Sidebar } from './sidebar';
import { CommandPalette, type PageEntry } from './command-palette';
import { AiPanel } from './ai-panel';
import type { NavGroup } from './nav-config';

const ACTION_ICONS: Record<string, any> = {
  CalendarCheck, ClipboardCheck, ScanLine, TrendingUp, Wallet, Layers,
};

export interface QuickAction { href: string; label: string; hint: string; icon: string }

/**
 * โครงหน้าจอทั้งแอป
 *
 * รวม state ที่ต้องใช้ร่วมกันไว้ที่เดียว (แถบเมนู · ช่องค้นหา · ผู้ช่วย AI)
 * ส่วนที่เป็น server component เช่น header กับเนื้อหา ส่งเข้ามาเป็น ReactNode
 * จึงยังคง render ฝั่งเซิร์ฟเวอร์ได้ตามเดิม ไม่ถูกดึงมาเป็น client ทั้งก้อน
 */
export function AppShell({
  groups, appName, pages, actions, header, footer, children,
}: {
  groups: NavGroup[];
  appName: string;
  pages: PageEntry[];
  actions: QuickAction[];
  header: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiSeed, setAiSeed] = useState<string | undefined>();

  const openPalette = useCallback(() => setPaletteOpen(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);

      // ⌘K / Ctrl+K เปิดช่องค้นหา
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      // ⌘J / Ctrl+J เรียกผู้ช่วย AI
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setAiSeed(undefined);
        setAiOpen((o) => !o);
        return;
      }
      // กด / เดี่ยว ๆ เปิดค้นหา แต่ต้องไม่ได้อยู่ในช่องพิมพ์
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex min-h-screen">
      <Sidebar groups={groups} appName={appName} onOpenSearch={openPalette} />

      <div className="flex min-w-0 flex-1 flex-col">
        {header}

        {/* ---------- แถบนวัตกรรม ---------- */}
        <div className="no-print sticky top-14 z-20 border-b border-ink-200 bg-white/85 backdrop-blur">
          <div className="flex items-center gap-1.5 overflow-x-auto px-4 py-2 sm:px-6">
            <button
              type="button"
              onClick={openPalette}
              className="group flex shrink-0 items-center gap-2 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[13px] text-ink-600 transition hover:border-brand-300 hover:text-brand-700"
            >
              <Search className="h-3.5 w-3.5 text-ink-400 group-hover:text-brand-500" strokeWidth={1.8} />
              ค้นหาทุกอย่าง
              <kbd className="rounded border border-ink-200 bg-ink-50 px-1 font-mono text-xxs text-ink-400">⌘K</kbd>
            </button>

            <button
              type="button"
              onClick={() => { setAiSeed(undefined); setAiOpen(true); }}
              className="flex shrink-0 items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-[13px] font-medium text-brand-700 transition hover:bg-brand-100"
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={1.8} />
              ถาม AI
              <kbd className="rounded border border-brand-200 bg-white/70 px-1 font-mono text-xxs text-brand-500">⌘J</kbd>
            </button>

            {actions.length > 0 && <span className="mx-1 h-5 w-px shrink-0 bg-ink-200" />}

            {actions.map((a) => {
              const Icon = ACTION_ICONS[a.icon] || Layers;
              return (
                <Link
                  key={a.href}
                  href={a.href}
                  title={a.hint}
                  className={cn(
                    'flex shrink-0 items-center gap-2 rounded-full border border-transparent px-3 py-1.5',
                    'text-[13px] text-ink-600 transition hover:border-ink-200 hover:bg-ink-50 hover:text-ink-900'
                  )}
                >
                  <Icon className="h-3.5 w-3.5 text-ink-400" strokeWidth={1.8} />
                  {a.label}
                </Link>
              );
            })}
          </div>
        </div>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        {footer}
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        pages={pages}
        onAskAi={(q) => { setAiSeed(q); setAiOpen(true); }}
      />
      <AiPanel open={aiOpen} onClose={() => setAiOpen(false)} initialQuestion={aiSeed} />
    </div>
  );
}
