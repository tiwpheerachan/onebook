'use client';
import { useState, useTransition } from 'react';
import { ShieldCheck, ShieldAlert, ShieldQuestion, FileSearch } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { money } from '@/lib/format';
import { verifyPeriod } from '@/actions/settings';

interface VerifyResult {
  status: 'intact' | 'changed' | 'no_snapshot';
  message: string;
  locked_at?: string;
  checked_at?: string;
  document_count?: number;
  entry_count?: number;
  changed_accounts?: { code: string; before: number | null; after: number | null; diff: number }[];
  before?: { document_count: number; entry_count: number; total_debit: number };
  after?: { document_count: number; entry_count: number; total_debit: number };
}

/**
 * ปุ่มพิสูจน์ว่าตัวเลขของงวดที่ปิดไปแล้วยังตรงกับตอนปิด
 * ระบบเก็บยอดคงเหลือรายบัญชีไว้ตอนปิดงวด แล้วคำนวณใหม่มาเทียบ
 */
export function PeriodVerify({ lockId }: { lockId: string }) {
  const [res, setRes] = useState<VerifyResult | null>(null);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  function run() {
    setErr(''); setRes(null);
    start(async () => {
      const r = await verifyPeriod(lockId);
      if (!r.ok) { setErr(r.error || ''); return; }
      setRes(r.result as VerifyResult);
    });
  }

  const tone =
    res?.status === 'intact'
      ? { Icon: ShieldCheck, cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200', icon: 'text-emerald-600' }
      : res?.status === 'changed'
        ? { Icon: ShieldAlert, cls: 'bg-rose-50 text-rose-800 ring-rose-200', icon: 'text-rose-600' }
        : { Icon: ShieldQuestion, cls: 'bg-ink-100 text-ink-700 ring-ink-200', icon: 'text-ink-500' };

  return (
    <div className="space-y-2">
      <button className="btn-secondary h-7 px-2 py-1 text-xs" disabled={pending} onClick={run}>
        {pending ? <ShdSpinner size={14} /> : <FileSearch className="h-3.5 w-3.5" strokeWidth={1.8} />}
        ตรวจสอบความถูกต้อง
      </button>

      {err && <p className="text-xxs text-rose-600">{err}</p>}

      {res && (
        <div className={cn('rounded-lg px-3 py-2.5 text-xs ring-1 ring-inset', tone.cls)}>
          <p className="flex items-start gap-1.5 font-medium">
            <tone.Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone.icon)} strokeWidth={2} />
            {res.message}
          </p>

          {res.status === 'intact' && (
            <p className="mt-1 pl-5 text-xxs opacity-80">
              เอกสาร {res.document_count} ใบ · สมุดรายวัน {res.entry_count} ใบ ·
              ตรวจเมื่อ {res.checked_at && new Date(res.checked_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
            </p>
          )}

          {res.status === 'changed' && (
            <div className="mt-2 pl-5">
              {res.before && res.after && (
                <p className="text-xxs opacity-80">
                  เอกสาร {res.before.document_count} → {res.after.document_count} ใบ ·
                  สมุดรายวัน {res.before.entry_count} → {res.after.entry_count} ใบ
                </p>
              )}
              {res.changed_accounts && res.changed_accounts.length > 0 && (
                <table className="mt-1.5 w-full text-xxs">
                  <thead>
                    <tr className="text-left opacity-70">
                      <th className="py-0.5 pr-2">บัญชี</th>
                      <th className="py-0.5 pr-2 text-right">ตอนปิดงวด</th>
                      <th className="py-0.5 pr-2 text-right">ตอนนี้</th>
                      <th className="py-0.5 text-right">ผลต่าง</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.changed_accounts.slice(0, 12).map((a) => (
                      <tr key={a.code} className="border-t border-current/10">
                        <td className="py-0.5 pr-2 font-mono">{a.code}</td>
                        <td className="py-0.5 pr-2 text-right tabular-nums">{money(a.before || 0)}</td>
                        <td className="py-0.5 pr-2 text-right tabular-nums">{money(a.after || 0)}</td>
                        <td className="py-0.5 text-right font-semibold tabular-nums">{money(a.diff)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
