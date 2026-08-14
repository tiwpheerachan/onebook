'use client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useState } from 'react';

export function DateRangeFilter({
  from, to, labels, singleDate = false,
}: { from: string; to: string; labels: { from: string; to: string; apply: string }; singleDate?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [f, setF] = useState(from);
  const [t2, setT] = useState(to);

  function apply() {
    const p = new URLSearchParams(params.toString());
    p.set('from', f);
    p.set('to', t2);
    router.push(`${pathname}?${p.toString()}`);
  }

  return (
    <div className="no-print flex flex-wrap items-end gap-2">
      {!singleDate && (
        <div>
          <label className="label">{labels.from}</label>
          <input type="date" className="input w-40" value={f} onChange={(e) => setF(e.target.value)} />
        </div>
      )}
      <div>
        <label className="label">{singleDate ? labels.to : labels.to}</label>
        <input type="date" className="input w-40" value={t2} onChange={(e) => setT(e.target.value)} />
      </div>
      <button onClick={apply} className="btn-secondary">{labels.apply}</button>
    </div>
  );
}
