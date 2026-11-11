'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, ArrowLeftRight, X, CheckCircle2 } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { generateIntercompanySale } from '@/actions/documents';

const baht = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * แผงยืนยัน "ขายข้ามบริษัท" บนใบซื้อ/ค่าใช้จ่าย
 * เมื่อผู้ขายเป็นบริษัทในเครือ จะเด้งให้ยืนยันก่อนออกใบกำกับภาษีขาย (ปรับ +/- % ได้)
 */
export function IntercompanyPanel({
  sourceId, companyName, defaultMarkup, costBase,
}: {
  sourceId: string;
  companyName: string;
  defaultMarkup: number;
  /** ฐานต้นทุนก่อน VAT ของใบซื้อ ใช้ประมาณการราคาขาย */
  costBase: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [markup, setMarkup] = useState<string>(String(defaultMarkup));
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ doc_number: string; company_name: string } | null>(null);
  const [pending, start] = useTransition();

  const m = Number(markup) || 0;
  const saleBase = Math.round(costBase * (1 + m / 100) * 100) / 100;
  const vat = Math.round(saleBase * 0.07 * 100) / 100;
  const total = Math.round((saleBase + vat) * 100) / 100;
  const diff = Math.round((saleBase - costBase) * 100) / 100;

  function confirm() {
    setErr('');
    start(async () => {
      const res = await generateIntercompanySale(sourceId, m);
      if (!res.ok) { setErr(res.error || 'error'); return; }
      setDone({ doc_number: res.doc_number || '', company_name: res.company_name || companyName });
      setOpen(false);
      router.refresh();
    });
  }

  if (done) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-emerald-50 px-3.5 py-2.5 text-xs leading-relaxed text-emerald-900 ring-1 ring-inset ring-emerald-200">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
        <span>ออกใบกำกับภาษีขายข้ามบริษัท <b>{done.doc_number}</b> ที่ <b>{done.company_name}</b> (ฉบับร่าง) แล้ว</span>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-violet-50 px-3.5 py-2.5 text-xs leading-relaxed text-violet-900 ring-1 ring-inset ring-violet-200 no-print">
        <span className="flex items-center gap-2">
          <Building2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          ผู้ขายรายนี้เป็นบริษัทในเครือ: <b>{companyName}</b> — ออกใบขายให้บริษัทนั้นได้
        </span>
        <button className="btn-primary !py-1 !text-xs" onClick={() => { setErr(''); setMarkup(String(defaultMarkup)); setOpen(true); }}>
          <ArrowLeftRight className="h-3.5 w-3.5" /> สร้างใบขายข้ามบริษัท
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4 no-print"
             onClick={() => !pending && setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl ring-1 ring-ink-100"
               onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-ink-900">ยืนยันการขายระหว่างบริษัท</h3>
                <p className="mt-0.5 text-xs text-ink-500">ออกใบกำกับภาษีขายให้ <b>{companyName}</b> (ฉบับร่าง)</p>
              </div>
              <button className="rounded p-1 text-ink-400 hover:bg-ink-50" onClick={() => !pending && setOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-3">
              <label className="label">ปรับราคาขาย (%) — บวก = เพิ่ม, ติดลบ = ลด</label>
              <div className="flex items-center gap-2">
                <input type="number" step="0.01" className="input w-32" value={markup}
                       onChange={(e) => setMarkup(e.target.value)} autoFocus />
                <div className="flex gap-1">
                  {[0, 5, 10].map((v) => (
                    <button key={v} type="button"
                            className="rounded-md border border-ink-200 px-2 py-1 text-xs text-ink-600 hover:bg-ink-50"
                            onClick={() => setMarkup(String(v))}>+{v}%</button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mb-4 space-y-1.5 rounded-lg bg-ink-50 px-3.5 py-3 text-xs">
              <Row label="ต้นทุน (ก่อน VAT)" value={baht(costBase)} />
              <Row label={`ปรับราคา ${m >= 0 ? '+' : ''}${m}%`} value={`${diff >= 0 ? '+' : ''}${baht(diff)}`} accent />
              <Row label="ราคาขาย (ก่อน VAT)" value={baht(saleBase)} bold />
              <Row label="VAT 7%" value={baht(vat)} />
              <div className="mt-1 border-t border-ink-200 pt-1.5">
                <Row label="รวมทั้งสิ้น (โดยประมาณ)" value={baht(total)} bold />
              </div>
              <p className="pt-1 text-xxs text-ink-400">* ยอดจริงคำนวณตอนสร้าง ตามประเภทภาษีของแต่ละรายการ</p>
            </div>

            {err && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}

            <div className="flex justify-end gap-2">
              <button className="btn-secondary" disabled={pending} onClick={() => setOpen(false)}>ยกเลิก</button>
              <button className="btn-primary" disabled={pending} onClick={confirm}>
                {pending && <ShdSpinner size={16} />} ยืนยันสร้างใบขาย ({m >= 0 ? '+' : ''}{m}%)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ label, value, bold, accent }: { label: string; value: string; bold?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={accent ? 'text-violet-700' : 'text-ink-500'}>{label}</span>
      <span className={`tabular-nums ${bold ? 'font-semibold text-ink-900' : accent ? 'font-medium text-violet-700' : 'text-ink-700'}`}>{value}</span>
    </div>
  );
}
