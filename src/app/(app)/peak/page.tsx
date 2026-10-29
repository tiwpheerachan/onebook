import {
  TrendingUp, TrendingDown, PiggyBank, Landmark, Scale, Building2,
  ArrowDownCircle, ArrowUpCircle, Wallet, BarChart3, type LucideIcon,
} from 'lucide-react';
import { requirePermission } from '@/lib/session';
import { Card, CardHeader } from '@/components/ui/page-header';
import { DonutBreakdown } from '@/components/charts/charts';
import { money, compact } from '@/lib/format';
import { peakFin, toSlices } from '@/lib/peak-fin';

export const dynamic = 'force-dynamic';

function Metric({ icon: Icon, label, value, sub, tint }: { icon: LucideIcon; label: string; value: number; sub?: string; tint: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:shadow-md">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tint}`}><Icon size={20} /></span>
      <div className="min-w-0">
        <p className="truncate text-xs text-slate-500">{label}</p>
        <p className="truncate text-[17px] font-bold tabular-nums text-slate-800">{money(value)}</p>
        {sub && <p className="truncate text-[11px] text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}

export default async function PeakOverviewPage() {
  await requirePermission('report', 'view');
  const f = peakFin();

  return (
    <>
      {/* สรุปกำไร โทนอ่อน */}
      <div className="mb-5 grid gap-4 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-teal-50 p-5">
          <div className="flex items-center gap-2 text-emerald-700"><PiggyBank size={18} /><span className="text-xs font-medium">กำไรสุทธิ · งวด {f.period}</span></div>
          <p className="mt-2 text-3xl font-bold tabular-nums text-emerald-700">{money(f.netProfit)} <span className="text-base font-normal text-emerald-500">บาท</span></p>
          <p className="mt-1 text-xs text-emerald-600/80">อัตรากำไรสุทธิ {(f.margin * 100).toFixed(1)}%</p>
        </div>
        <div className="rounded-2xl border border-teal-100 bg-white p-5">
          <div className="flex items-center gap-2 text-teal-600"><TrendingUp size={18} /><span className="text-xs font-medium">รายได้รวม</span></div>
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-800">{money(f.revenue)}</p>
          <p className="mt-1 text-xs text-slate-400">{compact(f.revenue)} บาท</p>
        </div>
        <div className="rounded-2xl border border-violet-100 bg-white p-5">
          <div className="flex items-center gap-2 text-violet-600"><TrendingDown size={18} /><span className="text-xs font-medium">ค่าใช้จ่ายรวม</span></div>
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-800">{money(f.expense)}</p>
          <p className="mt-1 text-xs text-slate-400">{compact(f.expense)} บาท</p>
        </div>
      </div>

      {/* KPI icon cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Metric icon={Landmark} label="สินทรัพย์รวม" value={f.assets} tint="bg-sky-50 text-sky-600" />
        <Metric icon={Scale} label="หนี้สินรวม" value={f.liabilities} tint="bg-amber-50 text-amber-600" />
        <Metric icon={Building2} label="ส่วนของผู้ถือหุ้น" value={f.equity} tint="bg-indigo-50 text-indigo-600" />
        <Metric icon={ArrowDownCircle} label="ลูกหนี้คงค้าง" value={f.arap.ar.total} sub={`${f.arap.ar.parties.length} ราย`} tint="bg-emerald-50 text-emerald-600" />
        <Metric icon={ArrowUpCircle} label="เจ้าหนี้คงค้าง" value={f.arap.ap.total} sub={`${f.arap.ap.parties.length} ราย`} tint="bg-rose-50 text-rose-600" />
        <Metric icon={Wallet} label="กำไรสุทธิ" value={f.netProfit} tint="bg-teal-50 text-teal-600" />
      </div>

      {/* Donut charts */}
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-600"><BarChart3 size={15} /></span>ภาพรวมแบบกราฟ
      </h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader title="รายได้ แยกตามประเภท" /><DonutBreakdown slices={toSlices(f.revRows)} total={f.revenue} topN={5} /></Card>
        <Card><CardHeader title="ค่าใช้จ่าย แยกตามประเภท" /><DonutBreakdown slices={toSlices(f.expRows)} total={f.expense} topN={5} /></Card>
        <Card><CardHeader title="ลูกหนี้ รายใหญ่" right={<span className="text-xs text-slate-400">{f.arap.ar.parties.length} ราย</span>} /><DonutBreakdown slices={toSlices(f.arap.ar.parties)} total={f.arap.ar.total} topN={6} /></Card>
        <Card><CardHeader title="เจ้าหนี้ รายใหญ่" right={<span className="text-xs text-slate-400">{f.arap.ap.parties.length} ราย</span>} /><DonutBreakdown slices={toSlices(f.arap.ap.parties)} total={f.arap.ap.total} topN={6} /></Card>
      </div>
    </>
  );
}
