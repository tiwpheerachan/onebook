'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Search } from 'lucide-react';

export function OaDocsFilter({ form, q, forms }: { form: string; q: string; forms: { code: string; label: string }[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [text, setText] = useState(q);

  const push = (patch: Record<string, string>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (!v || v === 'all') p.delete(k); else p.set(k, v); }
    p.delete('page');
    router.push(`/oa?${p.toString()}`);
  };

  const sel = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none max-w-[22rem]';
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <select className={sel} value={form} onChange={(e) => push({ form: e.target.value })}>
        <option value="all">ทุกฟอร์ม</option>
        {forms.map((f) => <option key={f.code} value={f.code}>{f.label}</option>)}
      </select>
      <form onSubmit={(e) => { e.preventDefault(); push({ q: text }); }} className="flex items-center gap-1.5">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="ค้นเลขที่ / ผู้ยื่น / ผู้ขาย"
            className="rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm text-slate-700 focus:border-brand-400 focus:outline-none" />
        </div>
        <button type="submit" className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">ค้นหา</button>
      </form>
    </div>
  );
}
