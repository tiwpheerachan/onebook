import { ShieldCheck, AlertTriangle, AlertOctagon } from 'lucide-react';
import type { Dictionary } from '@/i18n';
import { cn } from '@/lib/cn';

export interface MatchFinding {
  code: string;
  severity: 'error' | 'warning';
  sku?: string;
  name?: string;
  ordered?: number;
  received?: number;
  billed?: number;
  ordered_price?: number;
  billed_price?: number;
  diff_pct?: number;
}

export interface MatchResult {
  checked: boolean;
  enforce?: 'off' | 'warn' | 'block';
  errors?: number;
  warnings?: number;
  findings?: MatchFinding[];
}

const qty = (n?: number) =>
  n == null ? '' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 4 });

/**
 * ผลจับคู่สามทางบนหน้าเอกสารฝั่งซื้อ
 *
 * อ่านผลจาก rpt_three_way ซึ่งเรียกตัวตรวจตัวเดียวกับที่ใช้ตอนอนุมัติ
 * จึงไม่มีทางที่หน้าจอบอกว่าผ่านแต่ตอนกดอนุมัติกลับถูกปฏิเสธ
 */
export function MatchPanel({ result, d }: { result: MatchResult; d: Dictionary }) {
  if (!result?.checked) return null;
  const L = d.ui.match;
  const findings = result.findings || [];
  const errors = result.errors || 0;
  const clean = findings.length === 0;

  return (
    <section className="card mt-5 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-5 py-3">
        {clean
          ? <ShieldCheck className="h-4 w-4 text-emerald-600" strokeWidth={2} />
          : errors > 0
            ? <AlertOctagon className="h-4 w-4 text-rose-600" strokeWidth={2} />
            : <AlertTriangle className="h-4 w-4 text-amber-600" strokeWidth={2} />}
        <h2 className="text-sm font-semibold text-ink-900">{L.title}</h2>
        <span className="text-xxs text-ink-400">{L.subtitle}</span>
        {clean && <span className="ml-auto chip bg-emerald-50 text-emerald-700 ring-emerald-200">{L.ok}</span>}
      </div>

      {!clean && (
        <ul className="divide-y divide-ink-100">
          {findings.map((f, i) => (
            <li key={i} className={cn('flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-2.5 text-xs',
              f.severity === 'error' ? 'text-rose-800' : 'text-amber-800')}>
              <span className="font-medium">
                {(L.code as Record<string, string>)[f.code] || f.code}
              </span>
              {f.sku && (
                <span className="text-ink-500">
                  <span className="font-mono text-xxs">{f.sku}</span> · {f.name}
                </span>
              )}
              {/* ตัวเลขที่ทำให้ไม่ผ่าน แสดงไว้ตรงนี้เพื่อไม่ต้องเปิดสามใบเทียบเอง */}
              <span className="ml-auto flex flex-wrap gap-x-3 tabular-nums text-ink-600">
                {f.ordered != null && <span>{L.ordered} {qty(f.ordered)}</span>}
                {f.received != null && <span>{L.received} {qty(f.received)}</span>}
                {f.billed != null && <span>{L.billed} {qty(f.billed)}</span>}
                {f.ordered_price != null && <span>{L.orderedPrice} {qty(f.ordered_price)}</span>}
                {f.billed_price != null && (
                  <span className="font-medium">
                    {L.billedPrice} {qty(f.billed_price)}
                    {f.diff_pct != null && ` (${f.diff_pct > 0 ? '+' : ''}${f.diff_pct}%)`}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {result.enforce === 'block' && errors > 0 && (
        <p className="border-t border-ink-100 bg-rose-50 px-5 py-2.5 text-xxs leading-relaxed text-rose-800">
          {L.blockedHint}
        </p>
      )}
    </section>
  );
}
