'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck, AlertOctagon, AlertTriangle, Info, ChevronDown, ExternalLink, Plus, Check, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { addCloseCheckTasks } from '@/actions/tasks';
import { SLUG_BY_KIND } from '@/lib/constants';

export interface FindingView {
  key: string;
  severity: 'error' | 'warning' | 'info';
  category: string;
  title: string;
  detail: string;
  count: number;
  amount: number;
  samples: { id: string; label: string; kind: string }[] | null;
}

const TONE = {
  error:   { label: 'ต้องแก้ก่อนปิดงบ', chip: 'bg-rose-50 text-rose-700 ring-rose-200',    icon: AlertOctagon,  color: 'text-rose-600',  edge: 'border-l-rose-500' },
  warning: { label: 'ควรตรวจสอบ',      chip: 'bg-amber-50 text-amber-800 ring-amber-200', icon: AlertTriangle, color: 'text-amber-600', edge: 'border-l-amber-500' },
  info:    { label: 'ข้อเสนอแนะ',       chip: 'bg-sky-50 text-sky-700 ring-sky-200',       icon: Info,          color: 'text-sky-600',   edge: 'border-l-sky-500' },
} as const;

/** ลิงก์ไปยังสิ่งที่ตรวจพบ ตามชนิดของมัน */
function linkTo(kind: string, id: string): string | null {
  if (kind === 'journal') return `/accounting/journal/${id}`;
  if (kind === 'product') return `/inventory/${id}`;
  if (kind === 'asset') return '/accounting/assets';
  if (kind === 'channel') return '/finance/reconcile';
  const slug = SLUG_BY_KIND[kind];
  if (!slug) return null;
  const purchase = ['purchase_request','purchase_order','goods_receipt','bill','expense',
    'purchase_credit_note','purchase_debit_note','deposit_payment'].includes(kind);
  return `/${purchase ? 'purchase' : 'sales'}/${slug}/${id}`;
}

export function CloseCheckPanel({
  findings, period, canCreateTask,
}: {
  findings: FindingView[];
  /** งวดในรูปแบบ YYYYMM ใช้กันสร้างงานซ้ำ */
  period: string;
  canCreateTask: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<string[]>(
    () => findings.filter((f) => f.severity === 'error').slice(0, 2).map((f) => f.key)
  );
  const [picked, setPicked] = useState<string[]>(
    () => findings.filter((f) => f.severity === 'error').map((f) => f.key)
  );
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  const toggle = (k: string) =>
    setOpen((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]));

  function createTasks() {
    setErr(''); setMsg('');
    const chosen = findings.filter((f) => picked.includes(f.key));
    start(async () => {
      const res = await addCloseCheckTasks(chosen.map((f) => ({ key: f.key, title: f.title, period })));
      if (!res.ok) { setErr(res.error || ''); return; }
      setMsg(res.count ? `สร้างงานติดตาม ${res.count} รายการในตารางงานแล้ว` : 'รายการเหล่านี้ถูกสร้างเป็นงานไว้แล้ว');
      router.refresh();
    });
  }

  if (findings.length === 0) {
    return (
      <div className="card card-pad text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-emerald-500" strokeWidth={1.5} />
        <p className="mt-3 text-base font-semibold text-ink-900">ตรวจครบทุกข้อแล้วไม่พบปัญหา</p>
        <p className="mt-1 text-sm text-ink-500">งวดนี้พร้อมปิดงบ — ปิดงวดได้ที่เมนู ตั้งค่า → ปิดงวด</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {canCreateTask && (
        <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
          <span className="text-sm text-ink-600">
            เลือกไว้ {picked.length} รายการ
          </span>
          <div className="ml-auto flex items-center gap-2">
            {msg && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-700">
                <Check className="h-3.5 w-3.5" strokeWidth={2} /> {msg}
              </span>
            )}
            {err && <span className="text-xs text-rose-600">{err}</span>}
            <button className="btn-primary" disabled={pending || picked.length === 0} onClick={createTasks}>
              {pending ? <ShdSpinner size={16} /> : <Plus className="h-4 w-4" strokeWidth={2} />}
              สร้างเป็นงานติดตาม
            </button>
          </div>
        </div>
      )}

      {findings.map((f) => {
        const tone = TONE[f.severity];
        const Icon = tone.icon;
        const isOpen = open.includes(f.key);
        return (
          <div key={f.key} className={cn('card overflow-hidden border-l-4', tone.edge)}>
            <div className="flex items-start gap-3 px-4 py-3">
              {canCreateTask && (
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0 rounded border-ink-300 text-brand-600 focus:ring-brand-300"
                  checked={picked.includes(f.key)}
                  onChange={(e) =>
                    setPicked((p) => (e.target.checked ? [...p, f.key] : p.filter((x) => x !== f.key)))
                  }
                />
              )}
              <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone.color)} strokeWidth={2} />

              <button onClick={() => toggle(f.key)} className="min-w-0 flex-1 text-left">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink-900">{f.title}</span>
                  <span className={cn('chip', tone.chip)}>{tone.label}</span>
                  <span className="chip bg-ink-100 text-ink-600 ring-ink-200">{f.category}</span>
                </p>
                <p className={cn('mt-1 text-xs leading-relaxed text-ink-500', !isOpen && 'line-clamp-1')}>
                  {f.detail}
                </p>
              </button>

              <ChevronDown
                onClick={() => toggle(f.key)}
                className={cn('mt-1 h-4 w-4 shrink-0 cursor-pointer text-ink-400 transition', !isOpen && '-rotate-90')}
                strokeWidth={2}
              />
            </div>

            {isOpen && f.samples && f.samples.length > 0 && (
              <div className="border-t border-ink-100 bg-ink-50/60 px-4 py-2.5">
                <p className="section-title mb-1.5">รายการที่พบ (แสดงไม่เกิน 8 รายการ)</p>
                <div className="flex flex-wrap gap-1.5">
                  {f.samples.map((s) => {
                    const href = linkTo(s.kind, s.id);
                    return href ? (
                      <a
                        key={s.id}
                        href={href}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 font-mono text-xxs text-ink-700 ring-1 ring-inset ring-ink-200 hover:bg-brand-50 hover:text-brand-700"
                      >
                        {s.label}
                        <ExternalLink className="h-3 w-3" strokeWidth={1.8} />
                      </a>
                    ) : (
                      <span key={s.id} className="rounded-lg bg-white px-2 py-1 font-mono text-xxs text-ink-600 ring-1 ring-inset ring-ink-200">
                        {s.label}
                      </span>
                    );
                  })}
                  {f.count > (f.samples?.length || 0) && (
                    <span className="px-1 py-1 text-xxs text-ink-400">
                      และอีก {f.count - (f.samples?.length || 0)} รายการ
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** การ์ดสรุปด้านบน */
export function CloseSummary({
  errors, warnings, infos, lines, actions, byAi, note,
}: {
  errors: number; warnings: number; infos: number;
  lines: string[]; actions: string[]; byAi: boolean; note?: string;
}) {
  const ready = errors === 0;
  return (
    <div className="card mb-5 overflow-hidden">
      <div className={cn('px-5 py-4 text-white', ready ? 'bg-gradient-to-br from-emerald-600 to-emerald-800' : 'bg-gradient-to-br from-brand-700 to-brand-900')}>
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-white/15 p-1.5">
            {ready ? <ShieldCheck className="h-4 w-4" strokeWidth={2} /> : <Sparkles className="h-4 w-4" strokeWidth={2} />}
          </span>
          <h2 className="text-sm font-semibold">ผลตรวจก่อนปิดงบ</h2>
          <span className={cn('chip ring-0', byAi ? 'bg-white/20 text-white' : 'bg-white/10 text-white/70')}>
            {byAi ? 'เรียบเรียงโดย AI' : 'สรุปอัตโนมัติ'}
          </span>
        </div>
        <div className="mt-2 space-y-1">
          {lines.map((l, i) => <p key={i} className="text-sm leading-relaxed text-white/90">{l}</p>)}
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-ink-100 border-b border-ink-200">
        {[
          { label: 'ต้องแก้ก่อนปิดงบ', value: errors, tone: errors > 0 ? 'text-rose-600' : 'text-emerald-600' },
          { label: 'ควรตรวจสอบ', value: warnings, tone: warnings > 0 ? 'text-amber-600' : 'text-ink-900' },
          { label: 'ข้อเสนอแนะ', value: infos, tone: 'text-sky-600' },
        ].map((s) => (
          <div key={s.label} className="px-3 py-3 text-center">
            <p className={cn('text-2xl font-semibold tabular-nums', s.tone)}>{s.value}</p>
            <p className="text-xxs text-ink-500">{s.label}</p>
          </div>
        ))}
      </div>

      {actions.length > 0 && (
        <ul className="divide-y divide-ink-100">
          {actions.map((a, i) => (
            <li key={i} className="flex items-start gap-2.5 px-5 py-2.5 text-sm text-ink-700">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xxs font-semibold text-brand-700">
                {i + 1}
              </span>
              <span className="leading-relaxed">{a}</span>
            </li>
          ))}
        </ul>
      )}

      {note && (
        <p className="flex items-start gap-1.5 border-t border-ink-200 bg-ink-50 px-5 py-2.5 text-xxs text-ink-400">
          <Info className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} /> {note}
        </p>
      )}
    </div>
  );
}
