'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightLeft, ChevronDown } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { convertDocument } from '@/actions/documents';
import { SLUG_BY_KIND, PURCHASE_KINDS, type DocKind } from '@/lib/constants';

/**
 * ปุ่มแปลงเอกสารต่อเนื่อง — คัดลอกรายการทั้งหมดไปเป็นเอกสารฉบับใหม่แล้วเปิดให้ตรวจทันที
 */
export function ConvertButton({
  documentId, targets, labels,
}: {
  documentId: string;
  /** ชนิดเอกสารปลายทางพร้อมชื่อที่จะแสดง */
  targets: { kind: DocKind; label: string }[];
  labels: { convert: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  if (targets.length === 0) return null;

  function go(kind: DocKind) {
    setOpen(false);
    setErr('');
    start(async () => {
      const res = await convertDocument(documentId, kind);
      if (!res.ok) { setErr(res.error || ''); return; }
      const section = PURCHASE_KINDS.includes(kind) ? 'purchase' : 'sales';
      router.push(`/${section}/${SLUG_BY_KIND[kind]}/${res.id}`);
    });
  }

  return (
    <div className="relative no-print">
      {err && (
        <p className="absolute right-0 top-full z-20 mt-1 w-64 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 shadow-card ring-1 ring-inset ring-rose-200">
          {err}
        </p>
      )}

      <button className="btn-secondary" disabled={pending} onClick={() => setOpen((v) => !v)}>
        {pending ? <ShdSpinner size={16} /> : <ArrowRightLeft className="h-4 w-4 text-ink-400" strokeWidth={1.8} />}
        {labels.convert}
        <ChevronDown className="h-3.5 w-3.5 text-ink-400" strokeWidth={2} />
      </button>

      {open && (
        <>
          {/* คลิกที่ว่างเพื่อปิดเมนู */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 min-w-[14rem] overflow-hidden rounded-xl border border-ink-200 bg-white py-1 shadow-card">
            {targets.map((t) => (
              <button
                key={t.kind}
                onClick={() => go(t.kind)}
                className="block w-full px-3.5 py-2 text-left text-sm text-ink-700 hover:bg-brand-50 hover:text-brand-700"
              >
                {t.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
