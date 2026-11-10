'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Search } from 'lucide-react';

const TYPES: [string, string][] = [
  ['all', 'ทุกประเภท'],
  ['invoice', 'ใบแจ้งหนี้'],
  ['receipt', 'ใบเสร็จรับเงิน'],
  ['expense', 'ค่าใช้จ่าย'],
  ['credit_note', 'ใบลดหนี้ (ขาย)'],
  ['billing_note', 'ใบวางบิล'],
  ['quotation', 'ใบเสนอราคา'],
  ['credit_note_expense', 'ใบลดหนี้ซื้อ'],
  ['billing_note_expense', 'ใบวางบิลซื้อ'],
  ['purchase_order', 'ใบสั่งซื้อ'],
];
const MONTHS: [string, string][] = [
  ['all', 'ทุกเดือน'],
  ['202608', 'ส.ค. 2026'],
  ['202609', 'ก.ย. 2026'],
  ['202610', 'ต.ค. 2026'],
  ['202611', 'พ.ย. 2026'],
];

export function PeakDocsFilter({ type, month, q }: { type: string; month: string; q: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [text, setText] = useState(q);

  const push = (patch: Record<string, string>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v || v === 'all') p.delete(k); else p.set(k, v);
    }
    p.delete('page');
    router.push(`/peak/documents?${p.toString()}`);
  };

  const sel = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none';
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <select className={sel} value={type} onChange={(e) => push({ type: e.target.value })}>
        {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <select className={sel} value={month} onChange={(e) => push({ month: e.target.value })}>
        {MONTHS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <form onSubmit={(e) => { e.preventDefault(); push({ q: text }); }} className="flex items-center gap-1.5">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="ค้นเลขที่ / รหัสคู่ค้า"
            className="rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm text-slate-700 focus:border-brand-400 focus:outline-none" />
        </div>
        <button type="submit" className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">ค้นหา</button>
      </form>
    </div>
  );
}
