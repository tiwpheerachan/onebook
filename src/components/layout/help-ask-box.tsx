'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send, ArrowRight, Search } from 'lucide-react';

interface Link { label: string; href: string }

const STARTERS = ['ออกใบแจ้งหนี้ทำยังไง', 'บันทึกบิลซื้อทำยังไง', 'ดูงบกำไรขาดทุนที่ไหน'];

/** ช่องถามผู้ช่วย AI บนหน้า /help — เรียก /api/help/ask (วิธีใช้ + นำทาง + สถานะสด) */
export function HelpAskBox({ locale = 'th' }: { locale?: string }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [ans, setAns] = useState<{ answer: string; links: Link[]; followups: string[] } | null>(null);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setQ(text);
    setBusy(true);
    setAns(null);
    try {
      const res = await fetch('/api/help/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, path: '/help', lang: locale }),
      });
      const data = await res.json();
      setAns({ answer: data.answer || 'ยังตอบไม่ได้ ลองใหม่', links: data.links || [], followups: data.followups || [] });
    } catch {
      setAns({ answer: 'เชื่อมต่อผู้ช่วยไม่สำเร็จ ลองใหม่อีกครั้ง', links: [], followups: [] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mb-4 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-900">
        <img src="/ai-helper.png" alt="" className="h-6 w-6" /> ถามผู้ช่วย AI
      </div>
      <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="เช่น ออกใบกำกับภาษีทำยังไง / ตอนนี้มีเอกสารค้างอนุมัติกี่ใบ"
            className="h-10 w-full rounded-md border border-ink-200 bg-white pl-8 pr-3 text-[13.5px] text-ink-900 focus:border-brand-500 focus:outline-none"
          />
        </div>
        <button type="submit" disabled={busy || !q.trim()}
          className="flex h-10 items-center gap-1.5 rounded-md bg-brand-600 px-3.5 text-[13px] font-semibold text-white disabled:opacity-50">
          <Send size={15} /> {busy ? 'กำลังค้น…' : 'ถาม'}
        </button>
      </form>
      {!ans && !busy && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {STARTERS.map((s) => (
            <button key={s} onClick={() => ask(s)} className="rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[12px] text-ink-700 hover:border-brand-400 hover:text-brand-700">{s}</button>
          ))}
        </div>
      )}
      {ans && (
        <div className="mt-3 rounded-lg bg-ink-50 px-4 py-3 text-[13px] text-ink-900">
          <div className="whitespace-pre-wrap leading-relaxed">{ans.answer}</div>
          {ans.links.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {ans.links.map((l) => (
                <button key={l.href} onClick={() => router.push(l.href)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 py-1.5 text-[12.5px] font-medium text-brand-700 hover:border-brand-400 hover:bg-brand-50">
                  ไปที่ “{l.label}” <ArrowRight size={13} />
                </button>
              ))}
            </div>
          )}
          {ans.followups.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {ans.followups.map((fu) => (
                <button key={fu} onClick={() => ask(fu)} className="rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[11.5px] text-ink-700 hover:border-brand-400 hover:text-brand-700">{fu}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
