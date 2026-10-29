import {
  TrendingUp, TrendingDown, PiggyBank, Landmark, Scale, Building2,
  ArrowDownCircle, ArrowUpCircle, Wallet, BarChart3, Users2, HandCoins, FileSpreadsheet,
  type LucideIcon,
} from 'lucide-react';
import { requirePermission } from '@/lib/session';
import { PageHeader, Card, CardHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { DonutBreakdown } from '@/components/charts/charts';
import { money, compact } from '@/lib/format';
import tbJson from '@/data/peak/trial-balance.json';
import arApJson from '@/data/peak/ar-ap.json';

export const dynamic = 'force-dynamic';

type Acct = { code: string; name: string; debit: number; credit: number };
type TB = { source: string; period: string; pulledAt: string; accounts: Acct[] };
type Party = { name: string; amount: number };
type ARAP = { pulledAt: string; ar: { total: number; parties: Party[] }; ap: { total: number; parties: Party[] } };

const tb = tbJson as unknown as TB;
const arap = arApJson as unknown as ARAP;

// การ์ด KPI สีอ่อน + ไอคอน (โทนสบายตา)
function Metric({ icon: Icon, label, value, sub, tint }: {
  icon: LucideIcon; label: string; value: number; sub?: string; tint: string;
}) {
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

function SectionTitle({ icon: Icon, children, tint }: { icon: LucideIcon; children: React.ReactNode; tint: string }) {
  return (
    <h2 className="mb-3 mt-7 flex items-center gap-2 text-sm font-semibold text-slate-700">
      <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${tint}`}><Icon size={15} /></span>{children}
    </h2>
  );
}

export default async function PeakFinancialsPage() {
  const ctx = await requirePermission('report', 'view');
  const accounts = tb.accounts || [];
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const balOf = (a: Acct, side: 'dr' | 'cr') => (side === 'dr' ? a.debit - a.credit : a.credit - a.debit);
  const sumBy = (pred: (a: Acct) => boolean, side: 'dr' | 'cr') => r2(accounts.filter(pred).reduce((s, a) => s + balOf(a, side), 0));
  const group = (prefix: string, side: 'dr' | 'cr') =>
    accounts.filter((a) => a.code.startsWith(prefix)).map((a) => ({ ...a, bal: r2(balOf(a, side)) }))
      .filter((a) => Math.abs(a.bal) > 0.005).sort((x, y) => Math.abs(y.bal) - Math.abs(x.bal));

  const assets = sumBy((a) => a.code.startsWith('1'), 'dr');
  const liabilities = sumBy((a) => a.code.startsWith('2'), 'cr');
  const equity = sumBy((a) => a.code.startsWith('3'), 'cr');
  const revenue = sumBy((a) => a.code.startsWith('4'), 'cr');
  const expense = sumBy((a) => a.code.startsWith('5'), 'dr');
  const netProfit = r2(revenue - expense);
  const margin = revenue > 0 ? netProfit / revenue : 0;

  const revRows = group('4', 'cr');
  const expRows = group('5', 'dr');
  const assetRows = group('1', 'dr');
  const liabRows = group('2', 'cr');
  const eqRows = group('3', 'cr');
  const allRows = accounts.filter((a) => Math.abs(a.debit) > 0.005 || Math.abs(a.credit) > 0.005).sort((x, y) => x.code.localeCompare(y.code));
  const toSlices = (rows: { code?: string; name: string; bal?: number; amount?: number }[]) =>
    rows.map((r) => ({ id: r.code ?? r.name, label: r.name, amount: Math.abs(r.bal ?? r.amount ?? 0) }));
  const pulled = (tb.pulledAt || '').slice(0, 10);

  const SectionTable = ({ title, icon, rows, totalLabel, total, tone }: { title: string; icon: LucideIcon; rows: { code: string; name: string; bal: number }[]; totalLabel: string; total: number; tone?: string }) => (
    <Card className="mb-4">
      <CardHeader title={title} right={<span className="text-xs font-semibold tabular-nums text-slate-500">{money(total)}</span>} />
      <Table>
        <THead><TR><TH>รหัส</TH><TH>ชื่อบัญชี</TH><TH align="right">ยอด (บาท)</TH></TR></THead>
        <TBody>
          {rows.length === 0 ? <EmptyRow colSpan={3} label="ไม่มีรายการ" /> : rows.map((a) => (
            <TR key={a.code}><TD className="font-mono text-xs text-slate-400">{a.code}</TD><TD>{a.name}</TD><TD align="right" className="tabular-nums">{money(a.bal)}</TD></TR>
          ))}
          <TR className="border-t-2 border-slate-200 font-semibold"><TD colSpan={2}>{totalLabel}</TD><TD align="right" className={`tabular-nums ${tone ?? ''}`}>{money(total)}</TD></TR>
        </TBody>
      </Table>
    </Card>
  );

  return (
    <>
      <PageHeader title="การเงิน PEAK" subtitle={`${ctx.company?.name_th ?? 'บริษัท'} · กระจกเงินจากระบบบัญชี PEAK (อ่านอย่างเดียว) · งวด ${tb.period} · ดึงเมื่อ ${pulled}`} />

      {/* ───────── สรุปกำไร (โทนอ่อน) ───────── */}
      <div className="mb-5 grid gap-4 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-teal-50 p-5">
          <div className="flex items-center gap-2 text-emerald-700"><PiggyBank size={18} /><span className="text-xs font-medium">กำไรสุทธิ · งวด {tb.period}</span></div>
          <p className="mt-2 text-3xl font-bold tabular-nums text-emerald-700">{money(netProfit)} <span className="text-base font-normal text-emerald-500">บาท</span></p>
          <p className="mt-1 text-xs text-emerald-600/80">อัตรากำไรสุทธิ {(margin * 100).toFixed(1)}%</p>
        </div>
        <div className="rounded-2xl border border-teal-100 bg-white p-5">
          <div className="flex items-center gap-2 text-teal-600"><TrendingUp size={18} /><span className="text-xs font-medium">รายได้รวม</span></div>
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-800">{money(revenue)}</p>
          <p className="mt-1 text-xs text-slate-400">{compact(revenue)} บาท</p>
        </div>
        <div className="rounded-2xl border border-violet-100 bg-white p-5">
          <div className="flex items-center gap-2 text-violet-600"><TrendingDown size={18} /><span className="text-xs font-medium">ค่าใช้จ่ายรวม</span></div>
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-800">{money(expense)}</p>
          <p className="mt-1 text-xs text-slate-400">{compact(expense)} บาท</p>
        </div>
      </div>

      {/* ───────── KPI icon cards (หลากสี นุ่ม) ───────── */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Metric icon={Landmark} label="สินทรัพย์รวม" value={assets} tint="bg-sky-50 text-sky-600" />
        <Metric icon={Scale} label="หนี้สินรวม" value={liabilities} tint="bg-amber-50 text-amber-600" />
        <Metric icon={Building2} label="ส่วนของผู้ถือหุ้น" value={equity} tint="bg-indigo-50 text-indigo-600" />
        <Metric icon={ArrowDownCircle} label="ลูกหนี้คงค้าง" value={arap.ar.total} sub={`${arap.ar.parties.length} ราย`} tint="bg-emerald-50 text-emerald-600" />
        <Metric icon={ArrowUpCircle} label="เจ้าหนี้คงค้าง" value={arap.ap.total} sub={`${arap.ap.parties.length} ราย`} tint="bg-rose-50 text-rose-600" />
        <Metric icon={Wallet} label="กำไรสุทธิ" value={netProfit} tint="bg-teal-50 text-teal-600" />
      </div>

      {/* ───────── Donut charts ───────── */}
      <SectionTitle icon={BarChart3} tint="bg-teal-50 text-teal-600">ภาพรวมแบบกราฟ</SectionTitle>
      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader title="รายได้ แยกตามประเภท" /><DonutBreakdown slices={toSlices(revRows)} total={revenue} topN={5} /></Card>
        <Card><CardHeader title="ค่าใช้จ่าย แยกตามประเภท" /><DonutBreakdown slices={toSlices(expRows)} total={expense} topN={5} /></Card>
        <Card><CardHeader title="ลูกหนี้ รายใหญ่" right={<span className="text-xs text-slate-400">{arap.ar.parties.length} ราย</span>} /><DonutBreakdown slices={toSlices(arap.ar.parties)} total={arap.ar.total} topN={6} /></Card>
        <Card><CardHeader title="เจ้าหนี้ รายใหญ่" right={<span className="text-xs text-slate-400">{arap.ap.parties.length} ราย</span>} /><DonutBreakdown slices={toSlices(arap.ap.parties)} total={arap.ap.total} topN={6} /></Card>
      </div>

      {/* ───────── P&L ───────── */}
      <SectionTitle icon={HandCoins} tint="bg-emerald-50 text-emerald-600">งบกำไรขาดทุน (P&amp;L)</SectionTitle>
      <div className="grid gap-4 md:grid-cols-2">
        <SectionTable title="รายได้" icon={TrendingUp} rows={revRows} totalLabel="รวมรายได้" total={revenue} tone="text-teal-600" />
        <SectionTable title="ค่าใช้จ่าย" icon={TrendingDown} rows={expRows} totalLabel="รวมค่าใช้จ่าย" total={expense} tone="text-violet-600" />
      </div>
      <div className="mb-6 rounded-2xl border border-emerald-100 bg-emerald-50/60 px-5 py-4">
        <div className="flex items-center justify-between"><span className="flex items-center gap-2 font-semibold text-slate-700"><PiggyBank size={17} className="text-emerald-600" />กำไร (ขาดทุน) สุทธิ</span><span className={`text-xl font-bold tabular-nums ${netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{money(netProfit)}</span></div>
      </div>

      {/* ───────── Balance Sheet ───────── */}
      <SectionTitle icon={Scale} tint="bg-sky-50 text-sky-600">งบแสดงฐานะการเงิน (งบดุล)</SectionTitle>
      <div className="grid gap-4 md:grid-cols-3">
        <SectionTable title="สินทรัพย์" icon={Landmark} rows={assetRows} totalLabel="รวมสินทรัพย์" total={assets} />
        <SectionTable title="หนี้สิน" icon={Scale} rows={liabRows} totalLabel="รวมหนี้สิน" total={liabilities} />
        <SectionTable title="ส่วนของผู้ถือหุ้น" icon={Building2} rows={eqRows} totalLabel="รวมส่วนของผู้ถือหุ้น" total={equity} />
      </div>

      {/* ───────── AR / AP ───────── */}
      <SectionTitle icon={Users2} tint="bg-rose-50 text-rose-600">ลูกหนี้ / เจ้าหนี้ คงค้าง (รายคู่ค้า)</SectionTitle>
      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader title="ลูกหนี้การค้า" right={<b className="text-sm tabular-nums text-emerald-600">{money(arap.ar.total)}</b>} />
          <Table><THead><TR><TH>คู่ค้า</TH><TH align="right">ยอดคงค้าง</TH></TR></THead><TBody>
            {arap.ar.parties.slice(0, 25).map((p, i) => (<TR key={i}><TD className="truncate">{p.name || '(ไม่ระบุ)'}</TD><TD align="right" className="tabular-nums">{money(p.amount)}</TD></TR>))}
          </TBody></Table></Card>
        <Card><CardHeader title="เจ้าหนี้การค้า" right={<b className="text-sm tabular-nums text-rose-600">{money(arap.ap.total)}</b>} />
          <Table><THead><TR><TH>คู่ค้า</TH><TH align="right">ยอดคงค้าง</TH></TR></THead><TBody>
            {arap.ap.parties.slice(0, 25).map((p, i) => (<TR key={i}><TD className="truncate">{p.name || '(ไม่ระบุ)'}</TD><TD align="right" className="tabular-nums">{money(p.amount)}</TD></TR>))}
          </TBody></Table></Card>
      </div>

      {/* ───────── Trial Balance ───────── */}
      <SectionTitle icon={FileSpreadsheet} tint="bg-slate-100 text-slate-600">งบทดลอง ({allRows.length} บัญชี)</SectionTitle>
      <Card>
        <Table>
          <THead><TR><TH>รหัส</TH><TH>ชื่อบัญชี</TH><TH align="right">เดบิต</TH><TH align="right">เครดิต</TH></TR></THead>
          <TBody>{allRows.map((a) => (<TR key={a.code}><TD className="font-mono text-xs text-slate-400">{a.code}</TD><TD>{a.name}</TD><TD align="right" className="tabular-nums">{a.debit ? money(a.debit) : '-'}</TD><TD align="right" className="tabular-nums">{a.credit ? money(a.credit) : '-'}</TD></TR>))}</TBody>
        </Table>
      </Card>
    </>
  );
}
