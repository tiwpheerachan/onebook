'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DownloadCloud } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { importPurchaseRequestsFromOA } from '@/actions/oa-import';

export function OaImportButton({
  labels,
}: {
  labels: { importBtn: string; done: string; failed: string };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');

  function run() {
    setMsg('');
    start(async () => {
      const res = await importPurchaseRequestsFromOA();
      if (!res.ok) { setMsg(res.error || labels.failed); return; }
      setMsg(
        labels.done
          .replace('{imported}', String(res.imported ?? 0))
          .replace('{skipped}', String(res.skipped ?? 0)),
      );
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-ink-500">{msg}</span>}
      <button className="btn-secondary" disabled={pending} onClick={run}>
        {pending ? <ShdSpinner size={16} /> : <DownloadCloud className="h-4 w-4" strokeWidth={1.8} />}
        {labels.importBtn}
      </button>
    </div>
  );
}
