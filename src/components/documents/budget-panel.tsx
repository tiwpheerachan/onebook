import { Wallet, AlertOctagon } from 'lucide-react';
import type { Dictionary } from '@/i18n';
import { money } from '@/lib/format';
import { cn } from '@/lib/cn';

export interface BudgetFinding {
  code: string;
  name: string;
  budget: number;
  used: number;
  remaining: number;
  requested: number;
  over: number;
}
export interface BudgetResult {
  checked: boolean;
  enforce?: 'off' | 'warn' | 'block';
  errors?: number;
  findings?: BudgetFinding[];
}

/**
 * ผลเช็กงบบนหน้าใบขอซื้อ/ใบสั่งซื้อ
 * อ่านจาก rpt_budget_check ซึ่งเรียกตัวตรวจตัวเดียวกับตอนอนุมัติ
 */
export function BudgetPanel({ result, d }: { result: BudgetResult; d: Dictionary }) {
  if (!result?.checked) return null;
  const L = d.ui.budget;
  const findings = result.findings || [];
  const clean = findings.length === 0;

  return (
    <section className="card mt-5 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-5 py-3">
        {clean
          ? <Wallet className="h-4 w-4 text-emerald-600" strokeWidth={2} />
          : <AlertOctagon className="h-4 w-4 text-rose-600" strokeWidth={2} />}
        <h2 className="text-sm font-semibold text-ink-900">{L.panelTitle}</h2>
        {clean && <span className="ml-auto chip bg-emerald-50 text-emerald-700 ring-emerald-200">{L.ok}</span>}
      </div>

      {!clean && (
        <ul className="divide-y divide-ink-100">
          {findings.map((f, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-2.5 text-xs text-rose-800">
              <span className="font-medium">
                <span className="font-mono text-xxs text-ink-400">{f.code}</span> {f.name}
              </span>
              <span className="ml-auto flex flex-wrap gap-x-3 tabular-nums text-ink-600">
                <span>{L.amount} {money(f.budget)}</span>
                <span>{L.used} {money(f.used)}</span>
                <span>{L.requested} {money(f.requested)}</span>
                <span className="font-medium text-rose-700">{L.over} {money(f.over)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {result.enforce === 'block' && !clean && (
        <p className="border-t border-ink-100 bg-rose-50 px-5 py-2.5 text-xxs leading-relaxed text-rose-800">
          {L.blockedHint}
        </p>
      )}
      {clean && (
        <p className="border-t border-ink-100 px-5 py-2.5 text-xxs leading-relaxed text-ink-400">
          {L.commitmentHint}
        </p>
      )}
    </section>
  );
}
