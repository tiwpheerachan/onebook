'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PackageCheck, AlertTriangle } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { reserveSalesOrder, type Shortage } from '@/actions/sales-orders';

export function ReserveButton({
  documentId, labels,
}: {
  documentId: string;
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn' | 'err'; text: string; lines?: string[] } | null>(null);

  const run = () => {
    setMsg(null);
    start(async () => {
      const res = await reserveSalesOrder(documentId);
      if (!res.ok) { setMsg({ tone: 'err', text: res.error || '' }); return; }

      const short = res.shortages || [];
      const lines = short.map((s: Shortage) =>
        labels.shortLine
          .replace('{sku}', s.sku).replace('{name}', s.name)
          .replace('{want}', String(s.wanted)).replace('{have}', String(s.available)));

      if (!res.reserved && !short.length) {
        setMsg({ tone: 'warn', text: labels.nothingToReserve });
      } else if (short.length) {
        // จองได้บางส่วน ต้องบอกให้ครบว่าอะไรผ่านและอะไรไม่ผ่าน
        // ไม่งั้นผู้ใช้เข้าใจว่าจองครบแล้วทั้งที่ยังขาด
        setMsg({
          tone: 'warn',
          text: `${labels.reserved.replace('{n}', String(res.reserved))} · ${labels.shortTitle.replace('{n}', String(short.length))}`,
          lines,
        });
      } else {
        setMsg({ tone: 'ok', text: labels.reserved.replace('{n}', String(res.reserved)) });
      }
      router.refresh();
    });
  };

  const tone = msg?.tone === 'ok'
    ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
    : msg?.tone === 'warn'
      ? 'bg-amber-50 text-amber-900 ring-amber-200'
      : 'bg-rose-50 text-rose-700 ring-rose-200';

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={run} disabled={pending} className="btn-secondary">
        {pending ? <ShdSpinner size={16} /> : <PackageCheck className="h-4 w-4" strokeWidth={1.8} />}
        {labels.reserve}
      </button>

      {msg && (
        <div className={'rounded-lg px-3 py-2 text-xs leading-relaxed ring-1 ring-inset ' + tone}>
          <p className="flex items-start gap-1.5 font-medium">
            {msg.tone !== 'ok' && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />}
            {msg.text}
          </p>
          {msg.lines && msg.lines.length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5 pl-5">
              {msg.lines.map((l) => <li key={l} className="list-disc">{l}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
