'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Download } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { useI18n } from '@/i18n/provider';
import { backfillRates } from '@/actions/fx';

/** ดึงอัตราย้อนหลังมาเก็บ เพื่อให้มีข้อมูลพอจะเห็นความเคลื่อนไหว */
export function FxBackfillButton({
  currencies, from, to, canEdit,
}: {
  currencies: string[];
  from: string;
  to: string;
  canEdit: boolean;
}) {
  const { dict: d } = useI18n();
  const L = d.ui.fxTrend;
  const router = useRouter();
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  if (!canEdit) return null;

  return (
    <span className="flex flex-wrap items-center gap-2">
      {msg && <span className="text-xs text-emerald-700">{msg}</span>}
      {err && <span className="max-w-[24rem] text-right text-xs text-rose-600">{err}</span>}
      <button className="btn-secondary" disabled={pending}
              onClick={() => start(async () => {
                setErr(''); setMsg('');
                const res = await backfillRates(currencies, from, to);
                if (!res.ok) { setErr(res.error || ''); return; }
                const parts = [L.backfilled.replace('{n}', String(res.saved))];
                if (res.failed?.length) parts.push(L.backfillFailed.replace('{list}', res.failed.join(', ')));
                setMsg(parts.join(' · '));
                router.refresh();
              })}>
        {pending ? <ShdSpinner size={16} /> : <Download className="h-4 w-4 text-ink-400" strokeWidth={1.8} />}
        {L.backfill}
      </button>
    </span>
  );
}
