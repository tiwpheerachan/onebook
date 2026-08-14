'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, FileText, Users, Package, CheckSquare, CornerDownLeft,
  Sparkles, ArrowRight, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { money } from '@/lib/format';
import { STATUS_STYLE } from '@/lib/constants';
import {
  EMPTY_RESULT, docHref, countResults,
  docKindLabel, contactKindLabel, taskStatusLabel,
  type SearchResult,
} from '@/lib/search-meta';
import type { Dictionary } from '@/i18n';

export interface PageEntry { href: string; label: string; group: string }

interface Row {
  key: string;
  href: string;
  icon: any;
  title: string;
  sub?: string;
  right?: React.ReactNode;
  section: string;
}

/**
 * ช่องค้นหาทุกอย่าง (⌘K)
 *
 * ค้นได้ทั้งหน้าจอในระบบ · เอกสารทุกใบ · ผู้ติดต่อ · สินค้า · งาน
 * ผลลัพธ์ถูกกรองด้วย RLS ที่ฐานข้อมูลอยู่แล้ว จึงเห็นเฉพาะสิ่งที่ตัวเองมีสิทธิ์
 */
export function CommandPalette({
  open, onClose, pages, onAskAi, d,
}: {
  open: boolean;
  onClose: () => void;
  pages: PageEntry[];
  onAskAi?: (q: string) => void;
  d: Dictionary;
}) {
  const L = d.ui.search;
  const router = useRouter();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<SearchResult>(EMPTY_RESULT);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQ(''); setRes(EMPTY_RESULT); setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  // หน่วงไว้ก่อนยิง เพื่อไม่ให้พิมพ์ 1 ตัวยิง 1 ครั้ง
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) { setRes(EMPTY_RESULT); setLoading(false); return; }

    setLoading(true);
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        setRes(r.ok ? await r.json() : EMPTY_RESULT);
      } catch { /* ยกเลิกเพราะพิมพ์ต่อ ไม่ต้องทำอะไร */ }
      finally { setLoading(false); }
    }, 220);

    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [q, open]);

  /* ---------- รวมผลลัพธ์เป็นรายการเดียวเพื่อเลื่อนด้วยคีย์บอร์ด ---------- */
  const rows: Row[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    const out: Row[] = [];

    const matched = term
      ? pages.filter((p) => p.label.toLowerCase().includes(term) || p.group.toLowerCase().includes(term))
      : pages.slice(0, 8);
    for (const p of matched.slice(0, 6)) {
      out.push({ key: `p:${p.href}`, href: p.href, icon: ArrowRight, title: p.label, sub: p.group, section: L.pages });
    }

    for (const doc of res.documents) {
      out.push({
        key: `d:${doc.id}`, href: docHref(doc.kind, doc.id), icon: FileText,
        title: `${doc.doc_number} · ${docKindLabel(d, doc.kind)}`,
        sub: [doc.contact, doc.doc_date].filter(Boolean).join(' · '),
        right: (
          <span className="flex items-center gap-2">
            <span className="tabular-nums text-ink-700">{money(doc.grand_total)}</span>
            <span className={cn('chip', STATUS_STYLE[doc.status])}>{doc.status}</span>
          </span>
        ),
        section: L.documents,
      });
    }

    for (const c of res.contacts) {
      out.push({
        key: `c:${c.id}`, href: `/contacts?q=${encodeURIComponent(c.code)}`, icon: Users,
        title: c.name,
        sub: [c.code, contactKindLabel(d, c.kind), c.tax_id, c.phone].filter(Boolean).join(' · '),
        section: L.contacts,
      });
    }

    for (const p of res.products) {
      out.push({
        key: `pr:${p.id}`, href: `/products?q=${encodeURIComponent(p.sku)}`, icon: Package,
        title: p.name,
        sub: `${p.sku} · ${p.unit}${p.is_active ? '' : ` · ${L.inactive}`}`,
        right: <span className="tabular-nums text-ink-600">{money(p.sale_price)}</span>,
        section: L.products,
      });
    }

    for (const t of res.tasks) {
      out.push({
        key: `t:${t.id}`, href: `/tasks?q=${encodeURIComponent(t.title)}`, icon: CheckSquare,
        title: t.title,
        sub: [taskStatusLabel(d, t.status), t.due_at ? `${L.dueOn} ${t.due_at.slice(0, 10)}` : null]
          .filter(Boolean).join(' · '),
        section: L.tasks,
      });
    }

    return out;
  }, [res, pages, q, d, L]);

  const askRow = onAskAi && q.trim().length >= 2;
  const total = rows.length + (askRow ? 1 : 0);

  useEffect(() => { setCursor(0); }, [rows.length]);

  const go = (i: number) => {
    if (askRow && i === rows.length) { onAskAi!(q.trim()); onClose(); return; }
    const r = rows[i];
    if (!r) return;
    onClose();
    router.push(r.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => (total ? (c + 1) % total : 0)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => (total ? (c - 1 + total) % total : 0)); }
    if (e.key === 'Enter') { e.preventDefault(); go(cursor); }
  };

  // เลื่อนรายการที่เลือกให้อยู่ในสายตาเสมอ
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="1"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  if (!open) return null;

  let lastSection = '';
  const found = countResults(res);

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={L.title}>
      <div className="absolute inset-0 bg-ink-900/25 backdrop-blur-[2px]" onClick={onClose} />

      <div className="absolute left-1/2 top-[12vh] w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2">
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-2xl">
          {/* ---------- ช่องพิมพ์ ---------- */}
          <div className="flex items-center gap-3 border-b border-ink-100 px-4">
            {loading
              ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-500" strokeWidth={2} />
              : <Search className="h-4 w-4 shrink-0 text-ink-400" strokeWidth={1.8} />}
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={L.placeholder}
              className="h-12 flex-1 bg-transparent text-[15px] text-ink-900 outline-none placeholder:text-ink-400"
            />
            <kbd className="rounded border border-ink-200 px-1.5 py-0.5 font-mono text-xxs text-ink-400">esc</kbd>
          </div>

          {/* ---------- ผลลัพธ์ ---------- */}
          <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1.5">
            {rows.map((r, i) => {
              const header = r.section !== lastSection ? r.section : null;
              lastSection = r.section;
              const Icon = r.icon;
              const active = i === cursor;
              return (
                <div key={r.key}>
                  {header && (
                    <p className="px-4 pb-1 pt-2.5 text-xxs font-semibold uppercase tracking-wide text-ink-400">
                      {header}
                    </p>
                  )}
                  <button
                    type="button"
                    data-active={active ? '1' : '0'}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => go(i)}
                    className={cn(
                      'flex w-full items-center gap-3 px-4 py-2 text-left',
                      active ? 'bg-brand-50' : 'hover:bg-ink-50'
                    )}
                  >
                    <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-brand-600' : 'text-ink-400')} strokeWidth={1.8} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink-900">{r.title}</span>
                      {r.sub && <span className="block truncate text-xs text-ink-500">{r.sub}</span>}
                    </span>
                    {r.right && <span className="shrink-0 text-xs">{r.right}</span>}
                    {active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-brand-400" strokeWidth={1.8} />}
                  </button>
                </div>
              );
            })}

            {/* ---------- ถาม AI ---------- */}
            {askRow && (
              <button
                type="button"
                data-active={cursor === rows.length ? '1' : '0'}
                onMouseEnter={() => setCursor(rows.length)}
                onClick={() => go(rows.length)}
                className={cn(
                  'mt-1 flex w-full items-center gap-3 border-t border-ink-100 px-4 py-2.5 text-left',
                  cursor === rows.length ? 'bg-brand-50' : 'hover:bg-ink-50'
                )}
              >
                <Sparkles className="h-4 w-4 shrink-0 text-brand-500" strokeWidth={1.8} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink-900">{L.askAi} “{q.trim()}”</span>
                  <span className="block text-xs text-ink-500">{L.askAiHint}</span>
                </span>
              </button>
            )}

            {q.trim().length >= 2 && !loading && found === 0 && rows.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-ink-400">
                {L.noResults} “{q.trim()}”
              </p>
            )}
            {q.trim().length < 2 && (
              <p className="px-4 pb-3 pt-1 text-xs text-ink-400">
                {L.hint}
              </p>
            )}
          </div>

          <div className="flex items-center gap-4 border-t border-ink-100 bg-ink-50/60 px-4 py-2 text-xxs text-ink-400">
            <span><kbd className="font-mono">↑↓</kbd> {L.kbSelect}</span>
            <span><kbd className="font-mono">↵</kbd> {L.kbOpen}</span>
            <span><kbd className="font-mono">esc</kbd> {L.kbClose}</span>
            <span className="ml-auto">{L.scopeNote}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
