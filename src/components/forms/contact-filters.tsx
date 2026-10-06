'use client';
import { useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { SlidersHorizontal, X } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { cn } from '@/lib/cn';

/** ชนิดเอกสารที่เลือกกรองได้ เรียงตามลำดับการใช้งานจริง ไม่ใช่ตามตัวอักษร */
const KINDS = [
  'invoice', 'tax_invoice', 'receipt', 'credit_note', 'debit_note', 'deposit_receipt',
  'bill', 'expense', 'purchase_credit_note', 'purchase_debit_note', 'deposit_payment',
  'quotation', 'sales_order', 'delivery_order', 'purchase_order', 'goods_receipt',
];
const BUCKETS = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'] as const;
const CURRENCIES = ['CNY', 'USD', 'EUR', 'JPY', 'SGD', 'MYR', 'GBP', 'AUD', 'HKD'];

/** คีย์ทุกตัวที่ลิ้นชักเป็นเจ้าของ ใช้ทั้งตอนล้างและตอนนับว่ามีกี่ตัวที่ตั้งอยู่ */
const ADVANCED = ['kind', 'min', 'max', 'bucket', 'cur', 'wht', 'none', 'q'];

export function ContactFilters({ docKindLabels }: { docKindLabels: Record<string, string> }) {
  const { dict: d } = useI18n();
  const L = d.ui.contactFile;
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  const get = (k: string) => params.get(k) || '';
  const activeCount = ADVANCED.filter((k) => params.get(k)).length;

  const push = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') p.delete(k); else p.set(k, v);
    }
    router.push(`${pathname}?${p.toString()}`);
  };

  const clearAdvanced = () => push(Object.fromEntries(ADVANCED.map((k) => [k, null])));

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* ฝั่ง : ตัวกรองที่ใช้บ่อยที่สุด อยู่นอกลิ้นชักเสมอ */}
        <span className="flex gap-1">
          {[['both', L.sideBoth], ['ar', L.sideAr], ['ap', L.sideAp]].map(([v, label]) => (
            <button key={v} type="button"
                    onClick={() => push({ side: v === 'both' ? null : v })}
                    className={cn('chip transition',
                      (get('side') || 'both') === v
                        ? 'bg-brand-600 text-white ring-brand-600'
                        : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50')}>
              {label}
            </button>
          ))}
        </span>

        <select className="input w-auto py-1.5 text-sm" value={get('st')}
                onChange={(e) => push({ st: e.target.value || null })}>
          <option value="">{L.statusAll}</option>
          <option value="open">{L.statusOpen}</option>
          <option value="overdue">{L.statusOverdue}</option>
          <option value="closed">{L.statusClosed}</option>
        </select>

        <input type="search" className="input w-auto min-w-[16rem] py-1.5 text-sm"
               placeholder={L.searchDoc} defaultValue={get('q')}
               onKeyDown={(e) => {
                 if (e.key === 'Enter') push({ q: (e.target as HTMLInputElement).value || null });
               }} />

        <button type="button" onClick={() => setOpen((v) => !v)}
                className={cn('btn-secondary py-1.5 text-sm',
                  activeCount > 0 && 'ring-brand-300 text-brand-700')}>
          <SlidersHorizontal className="h-4 w-4 text-ink-400" strokeWidth={1.8} />
          {L.moreFilters}
          {activeCount > 0 && (
            <span className="ml-1 rounded-full bg-brand-600 px-1.5 text-xxs text-white">{activeCount}</span>
          )}
        </button>

        {activeCount > 0 && (
          <button type="button" onClick={clearAdvanced}
                  className="flex items-center gap-1 text-xs text-ink-500 underline underline-offset-2 hover:text-brand-600">
            <X className="h-3 w-3" strokeWidth={2} />{L.clearFilters}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 grid gap-3 rounded-xl border border-ink-200 bg-ink-50/60 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label">{L.docKind}</label>
            <select className="input py-1.5 text-sm" value={get('kind')}
                    onChange={(e) => push({ kind: e.target.value || null })}>
              <option value="">{L.statusAll}</option>
              {KINDS.map((k) => <option key={k} value={k}>{docKindLabels[k] || k}</option>)}
            </select>
          </div>

          <div>
            <label className="label">{L.bucket}</label>
            <select className="input py-1.5 text-sm" value={get('bucket')}
                    onChange={(e) => push({ bucket: e.target.value || null })}>
              <option value="">{L.anyBucket}</option>
              {BUCKETS.map((b) => (
                <option key={b} value={b}>
                  {b === 'current' ? L.agingCurrent : (L as Record<string, string>)[b]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">{L.currency}</label>
            <select className="input py-1.5 text-sm" value={get('cur')}
                    onChange={(e) => push({ cur: e.target.value || null })}>
              <option value="">{L.anyCurrency}</option>
              {CURRENCIES.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>

          <div className="sm:col-span-2 lg:col-span-1">
            <label className="label">{L.amountRange}</label>
            <span className="flex items-center gap-2">
              <input type="number" min={0} className="input num py-1.5 text-sm" placeholder={L.min}
                     defaultValue={get('min')}
                     onBlur={(e) => push({ min: e.target.value || null })} />
              <span className="text-ink-400">–</span>
              <input type="number" min={0} className="input num py-1.5 text-sm" placeholder={L.max}
                     defaultValue={get('max')}
                     onBlur={(e) => push({ max: e.target.value || null })} />
            </span>
          </div>

          <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink-700">
            <input type="checkbox" className="h-4 w-4 rounded border-ink-300 text-brand-600"
                   checked={get('wht') === '1'}
                   onChange={(e) => push({ wht: e.target.checked ? '1' : null })} />
            {L.withWht}
          </label>

          {/* ค่าตั้งต้นคือรวมเอกสารที่ยังไม่เป็นหนี้ ติ๊กออกเพื่อซ่อน */}
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink-700">
            <input type="checkbox" className="h-4 w-4 rounded border-ink-300 text-brand-600"
                   checked={get('none') !== '0'}
                   onChange={(e) => push({ none: e.target.checked ? null : '0' })} />
            {L.showNone}
          </label>
        </div>
      )}
    </div>
  );
}
