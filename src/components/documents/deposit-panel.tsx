'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Wallet, Plus, X } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { applyDeposit, unapplyDeposit } from '@/actions/deposits';
import { money, localeDate } from '@/lib/format';

export interface OpenDeposit {
  id: string; doc_number: string; doc_date: string;
  grand_total: number; remaining: number;
}
export interface AppliedDeposit {
  id: string; amount: number;
  deposit_id: string; deposit_number: string; deposit_date: string;
}

export function DepositPanel({
  documentId, available, applied, netPayable, canEdit, locale, labels,
}: {
  documentId: string;
  available: OpenDeposit[];
  applied: AppliedDeposit[];
  netPayable: number;
  canEdit: boolean;
  locale: string;
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');

  // ไม่มีทั้งมัดจำที่ใช้ได้และมัดจำที่หักไว้แล้ว = ไม่ต้องแสดงกล่องนี้ให้รก
  if (!available.length && !applied.length) return null;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setErr('');
    start(async () => {
      const res = await fn();
      if (!res.ok) { setErr(res.error || ''); return; }
      router.refresh();
    });
  };

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-200 px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          <Wallet className="h-4 w-4 text-ink-400" strokeWidth={1.8} /> {labels.title}
        </h2>
        {applied.length > 0 && (
          <span className="text-xs text-ink-500">
            {labels.netPayable} <b className="tabular-nums text-ink-900">{money(netPayable)}</b>
          </span>
        )}
      </div>

      {err && (
        <p className="mx-5 mt-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">
          {err}
        </p>
      )}

      {applied.length > 0 && (
        <div className="px-5 py-4">
          <p className="section-title mb-2">{labels.applied}</p>
          <ul className="flex flex-col divide-y divide-ink-100">
            {applied.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="flex flex-wrap items-baseline gap-2">
                  <Link href={`/documents/trace/${a.deposit_id}`}
                        className="font-mono text-xs text-brand-700 hover:underline">
                    {a.deposit_number}
                  </Link>
                  <span className="text-xxs text-ink-400">{localeDate(a.deposit_date, locale)}</span>
                </span>
                <span className="flex items-center gap-3">
                  <b className="tabular-nums text-ink-900">{money(a.amount)}</b>
                  {canEdit && (
                    <button type="button" disabled={pending}
                            aria-label={labels.remove}
                            onClick={() => run(() => unapplyDeposit(a.id))}
                            className="rounded p-1 text-ink-400 hover:bg-rose-50 hover:text-rose-600">
                      <X className="h-4 w-4" strokeWidth={2} />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {canEdit && available.length > 0 && (
        <div className="border-t border-ink-100 px-5 py-4">
          <p className="section-title mb-2">{labels.available}</p>
          <ul className="flex flex-col divide-y divide-ink-100">
            {available.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="flex flex-wrap items-baseline gap-2">
                  <Link href={`/documents/trace/${x.id}`}
                        className="font-mono text-xs text-brand-700 hover:underline">
                    {x.doc_number}
                  </Link>
                  <span className="text-xxs text-ink-400">{localeDate(x.doc_date, locale)}</span>
                  <span className="text-xxs text-ink-500">
                    {labels.remaining} <b className="tabular-nums">{money(x.remaining)}</b>
                  </span>
                </span>
                <button type="button" disabled={pending}
                        onClick={() => run(() => applyDeposit(x.id, documentId, null))}
                        className="btn-secondary py-1 text-xs">
                  {pending ? <ShdSpinner size={14} /> : <Plus className="h-3.5 w-3.5" strokeWidth={2} />}
                  {labels.apply}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xxs leading-relaxed text-ink-400">{labels.hint}</p>
        </div>
      )}
    </div>
  );
}
