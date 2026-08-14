'use client';
import { useState } from 'react';
import { Printer, X, AlertTriangle } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { recordPrint } from '@/actions/print';

/**
 * แถบเครื่องมือลอยเหนือกระดาษ — ไม่ถูกพิมพ์ออกไปด้วย (class no-print)
 * กดพิมพ์แล้วบันทึกประวัติก่อน จึงค่อยเปิดกล่องพิมพ์ของเบราว์เซอร์
 */
export function PrintToolbar({
  documentId, docNumber, warning,
}: {
  documentId: string;
  docNumber: string;
  /** ข้อความเตือนกรณีข้อมูลบริษัทยังไม่ครบตามที่กฎหมายกำหนด */
  warning?: string | null;
}) {
  const [busy, setBusy] = useState(false);

  async function print() {
    setBusy(true);
    try {
      await recordPrint(documentId);
    } finally {
      setBusy(false);
      // รอให้ React วาดสถานะปุ่มกลับก่อน ไม่งั้นกล่องพิมพ์จะจับภาพตอนปุ่มยังหมุนอยู่
      requestAnimationFrame(() => window.print());
    }
  }

  return (
    <div className="no-print sticky top-0 z-20 mx-auto mb-4 w-[210mm] max-w-full">
      {warning && (
        <div className="mb-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 ring-1 ring-inset ring-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
          <span>{warning}</span>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white/95 px-3 py-2 shadow-card backdrop-blur">
        <p className="truncate text-sm font-medium text-ink-700">{docNumber}</p>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={() => window.close()}>
            <X className="h-4 w-4" strokeWidth={1.8} /> ปิด
          </button>
          <button className="btn-primary" disabled={busy} onClick={print}>
            {busy ? <ShdSpinner size={16} /> : <Printer className="h-4 w-4" strokeWidth={1.8} />} พิมพ์
          </button>
        </div>
      </div>
    </div>
  );
}
