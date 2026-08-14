'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Sparkles, X, SendHorizonal, ShieldCheck, FileText, Users, Package, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ShdSpinner } from '@/components/ui/shd-loader';
import type { Dictionary } from '@/i18n';

interface Ref { id: string; type: string; label: string; sub?: string; href: string }
interface Turn { q: string; answer: string; refs: Ref[]; followups: string[]; note?: string }

const REF_ICON: Record<string, any> = {
  document: FileText, contact: Users, product: Package, task: CheckSquare,
};

/**
 * ผู้ช่วย AI แบบอ่านอย่างเดียว
 * ค้นและสรุปให้ได้ แต่แก้เอกสารไม่ได้ — ฝั่ง API ไม่มีทางเขียนข้อมูลเลย
 */
export function AiPanel({
  open, onClose, initialQuestion, d, locale,
}: {
  open: boolean;
  onClose: () => void;
  initialQuestion?: string;
  d: Dictionary;
  locale: string;
}) {
  const L = d.ui.assistant;
  const suggestions = [L.s1, L.s2, L.s3];
  const [q, setQ] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const askedRef = useRef<string>('');

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true);
    setQ('');
    try {
      const r = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: text, locale }),
      });
      const j = await r.json();
      setTurns((t) => [...t, {
        q: text,
        answer: j.answer || j.error || L.noAnswer,
        refs: j.refs || [], followups: j.followups || [], note: j.note,
      }]);
    } catch {
      setTurns((t) => [...t, { q: text, answer: L.failed, refs: [], followups: [] }]);
    } finally {
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  };

  // ถ้าถูกเปิดมาพร้อมคำถามจากช่องค้นหา ให้ถามให้เลย (ถามครั้งเดียวต่อคำถาม)
  useEffect(() => {
    if (open && initialQuestion && askedRef.current !== initialQuestion) {
      askedRef.current = initialQuestion;
      ask(initialQuestion);
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 20);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialQuestion]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, busy]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[65]" role="dialog" aria-modal="true" aria-label={L.title}>
      <div className="absolute inset-0 bg-ink-900/20" onClick={onClose} />

      <div className="absolute inset-y-0 right-0 flex w-[min(30rem,100vw)] flex-col border-l border-ink-200 bg-white shadow-2xl">
        {/* ---------- หัว ---------- */}
        <div className="flex items-center gap-2.5 border-b border-ink-200 px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50">
            <Sparkles className="h-4 w-4 text-brand-600" strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-900">{L.title}</p>
            <p className="flex items-center gap-1 text-xxs text-ink-500">
              <ShieldCheck className="h-3 w-3" strokeWidth={2} />
              {L.subtitle}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700">
            <X className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>

        {/* ---------- บทสนทนา ---------- */}
        <div ref={bodyRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {turns.length === 0 && !busy && (
            <div className="space-y-3">
              <p className="text-sm text-ink-600">
                {L.intro}
              </p>
              <div className="space-y-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => ask(s)}
                    className="block w-full rounded-lg border border-ink-200 px-3 py-2 text-left text-[13px] text-ink-700 hover:border-brand-300 hover:bg-brand-50/50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((t, i) => (
            <div key={i} className="space-y-2.5">
              <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-brand-600 px-3.5 py-2 text-sm text-white">
                {t.q}
              </p>

              <div className="w-fit max-w-[92%] rounded-2xl rounded-bl-sm bg-ink-50 px-3.5 py-2.5">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-800">{t.answer}</p>
                {t.note && <p className="mt-1.5 text-xxs text-amber-700">{t.note}</p>}
              </div>

              {t.refs.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xxs font-semibold uppercase tracking-wide text-ink-400">{L.refs}</p>
                  {t.refs.map((r) => {
                    const Icon = REF_ICON[r.type] || FileText;
                    return (
                      <Link
                        key={`${r.type}:${r.id}`}
                        href={r.href}
                        onClick={onClose}
                        className="flex items-center gap-2 rounded-lg border border-ink-200 px-2.5 py-1.5 hover:border-brand-300 hover:bg-brand-50/50"
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0 text-ink-400" strokeWidth={1.8} />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-800">{r.label}</span>
                        {r.sub && <span className="shrink-0 truncate text-xxs text-ink-400">{r.sub}</span>}
                      </Link>
                    );
                  })}
                </div>
              )}

              {t.followups.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {t.followups.map((f) => (
                    <button
                      key={f}
                      onClick={() => ask(f)}
                      className="rounded-full border border-ink-200 px-2.5 py-1 text-xxs text-ink-600 hover:border-brand-300 hover:bg-brand-50"
                    >
                      {f}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {busy && (
            <div className="flex items-center gap-2 text-sm text-ink-500">
              <ShdSpinner size={16} /> {L.thinking}
            </div>
          )}
        </div>

        {/* ---------- ช่องพิมพ์ ---------- */}
        <form
          onSubmit={(e) => { e.preventDefault(); ask(q); }}
          className="flex items-center gap-2 border-t border-ink-200 px-3 py-3"
        >
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={L.placeholder}
            className="input flex-1"
          />
          <button
            type="submit"
            disabled={busy || q.trim().length < 2}
            className={cn('btn-primary shrink-0 px-3', (busy || q.trim().length < 2) && 'opacity-40')}
          >
            <SendHorizonal className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </form>
      </div>
    </div>
  );
}
