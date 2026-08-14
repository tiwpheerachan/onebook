'use client';
import { useState } from 'react';
import { Download } from 'lucide-react';
import { ShdOverlay } from './shd-loader';
import { useI18n } from '@/i18n/provider';

export function ExportCsvButton({
  rows, filename, label,
}: { rows: (string | number)[][]; filename: string; label: string }) {
  const { dict: d } = useI18n();
  const [busy, setBusy] = useState(false);

  function download() {
    setBusy(true);
    // ให้เบราว์เซอร์วาดฉากรอก่อนหนึ่งเฟรม ไม่งั้นตารางใหญ่จะค้างโดยไม่มีอะไรขึ้นเลย
    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          const csv = rows
            .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
            .join('\r\n');
          const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.click();
          URL.revokeObjectURL(url);
        } finally {
          setBusy(false);
        }
      }, 220);
    });
  }

  return (
    <>
      <button type="button" onClick={download} disabled={busy} className="btn-secondary no-print">
        <Download className="h-4 w-4 text-ink-400" strokeWidth={1.8} /> {label}
      </button>
      <ShdOverlay open={busy} label={d.common.preparingFile} sublabel={filename} />
    </>
  );
}
