'use client';
import { useId, useState } from 'react';
import { cn } from '@/lib/cn';
import { compact, money } from '@/lib/format';

/**
 * กราฟวาดด้วย SVG ล้วน ไม่พึ่งไลบรารีภายนอก
 * ทำให้ขนาดไฟล์เล็ก คุมสีให้เข้าธีมได้เอง และไม่มีปัญหาตอน render ฝั่งเซิร์ฟเวอร์
 */

const TH_MONTH_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

export interface Series {
  key: string;
  label: string;
  color: string;
  values: number[];
}

/** กราฟแท่งรายเดือน 12 ช่อง วางแท่งของแต่ละชุดข้อมูลเรียงกัน */
export function MonthlyBars({
  series, year, height = 200,
}: {
  series: Series[];
  year: number;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const cols = 12;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-xxs text-ink-600">
            <span className="h-2 w-4 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      <div className="relative" style={{ height }}>
        {/* เส้นตารางแนวนอน */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <div key={f} className="absolute inset-x-0 border-t border-ink-100" style={{ bottom: f * height }}>
            <span className="absolute -top-2 left-0 bg-white pr-1 text-xxs text-ink-300">
              {compact(max * f)}
            </span>
          </div>
        ))}

        <div className="absolute inset-0 flex items-end gap-[2px] pl-8">
          {Array.from({ length: cols }, (_, i) => (
            <div
              key={i}
              className={cn('group relative flex h-full flex-1 items-end justify-center gap-[2px] rounded-t transition',
                hover === i && 'bg-ink-50')}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {series.map((s) => {
                const v = s.values[i] || 0;
                const h = max > 0 ? (v / max) * (height - 4) : 0;
                return (
                  <span
                    key={s.key}
                    className="w-full max-w-[10px] rounded-t-sm transition-all"
                    style={{ height: Math.max(v > 0 ? 2 : 0, h), background: s.color }}
                  />
                );
              })}

              {hover === i && series.some((s) => (s.values[i] || 0) > 0) && (
                <div className="pointer-events-none absolute bottom-full z-10 mb-1 w-40 rounded-lg bg-ink-900 px-2.5 py-2 text-xxs text-white shadow-lg">
                  <p className="mb-1 font-medium">{TH_MONTH_SHORT[i]} {String(year + 543).slice(2)}</p>
                  {series.map((s) => (
                    <p key={s.key} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1 text-white/70">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                        {s.label}
                      </span>
                      <b className="tabular-nums">{money(s.values[i] || 0, 0)}</b>
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-1.5 flex gap-[2px] pl-8">
        {TH_MONTH_SHORT.map((m, i) => (
          <span key={m} className={cn('flex-1 text-center text-xxs', hover === i ? 'font-medium text-ink-700' : 'text-ink-400')}>
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}

export interface Slice {
  id: string | null;
  label: string;
  amount: number;
  mom?: number | null;
}

const DONUT_COLORS = ['#14827c', '#3cbdb0', '#72d8c9', '#a9eade', '#7dd3fc', '#c4b5fd', '#fcd34d'];
const REST_COLOR = '#cbd5e1';

/** โดนัทพร้อมรายการอันดับด้านข้าง แสดง %MoM ให้เห็นแนวโน้ม */
export function DonutBreakdown({
  slices, total, topN = 4,
}: {
  slices: Slice[];
  /** ยอดรวมทั้งหมด ถ้าไม่ส่งจะรวมจาก slices */
  total?: number;
  topN?: number;
}) {
  const uid = useId().replace(/:/g, '');
  const sum = total ?? slices.reduce((a, s) => a + s.amount, 0);
  const top = slices.slice(0, topN);
  const restAmount = Math.max(0, sum - top.reduce((a, s) => a + s.amount, 0));

  if (sum <= 0) {
    return <p className="py-8 text-center text-sm text-ink-400">ยังไม่มีข้อมูลในช่วงนี้</p>;
  }

  const parts = [
    ...top.map((s, i) => ({ ...s, color: DONUT_COLORS[i % DONUT_COLORS.length] })),
    ...(restAmount > 0 ? [{ id: 'rest', label: 'อื่น ๆ', amount: restAmount, mom: null, color: REST_COLOR }] : []),
  ];

  const R = 42;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 110 110" className="h-28 w-28 shrink-0 -rotate-90">
        <circle cx="55" cy="55" r={R} fill="none" stroke="#f1f5f9" strokeWidth="16" />
        {parts.map((p) => {
          const len = (p.amount / sum) * C;
          const el = (
            <circle
              key={p.id || p.label}
              cx="55" cy="55" r={R} fill="none"
              stroke={p.color}
              strokeWidth="16"
              strokeDasharray={`${Math.max(0, len - 1)} ${C}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return el;
        })}
        <text x="55" y="55" transform="rotate(90 55 55)" textAnchor="middle" dominantBaseline="middle"
              className="fill-ink-900 text-[9px] font-semibold">
          {compact(sum)}
        </text>
      </svg>

      <ul className="min-w-0 flex-1 space-y-1.5">
        {parts.map((p) => (
          <li key={p.id || p.label} className="flex items-start gap-2">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xxs text-ink-600" title={p.label}>{p.label}</span>
              <span className="flex items-center gap-1.5">
                <b className="text-xs tabular-nums text-ink-900">{money(p.amount)}</b>
                {p.mom != null && (
                  <span className={cn('text-xxs tabular-nums', p.mom >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                    {p.mom >= 0 ? '+' : ''}{p.mom.toFixed(1)}%
                  </span>
                )}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** แถบความคืบหน้าแบบมีตัวเลขกำกับ ใช้ในช่องทางใบเสนอราคา */
export function ProgressRow({
  label, amount, count, ratio, color = 'bg-brand-500',
}: {
  label: string; amount: number; count: number; ratio: number; color?: string;
}) {
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-xs text-ink-600">{label}</span>
        <b className="shrink-0 text-sm tabular-nums text-ink-900">{money(amount)}</b>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
        <div className={cn('h-full rounded-full transition-all', color)}
             style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }} />
      </div>
      <p className="mt-0.5 text-right text-xxs text-ink-400">{count} รายการ</p>
    </div>
  );
}
