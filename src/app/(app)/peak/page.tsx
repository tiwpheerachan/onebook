import { requirePermission } from '@/lib/session';
import { PageHeader, Card, CardHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { StatCard } from '@/components/ui/stat-card';
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

  const SectionTable = ({ title, rows, totalLabel, total, tone }: { title: string; rows: { code: string; name: string; bal: number }[]; totalLabel: string; total: number; tone?: string }) => (
    <Card className="mb-4">
      <CardHeader title={title} />
      <Table>
        <THead><TR><TH>รหัส</TH><TH>ชื่อบัญชี</TH><TH align="right">ยอด (บาท)</TH></TR></THead>
        <TBody>
          {rows.length === 0 ? <EmptyRow colSpan={3} label="ไม่มีรายการ" /> : rows.map((a) => (
            <TR key={a.code}><TD className="font-mono text-xs text-ink-500">{a.code}</TD><TD>{a.name}</TD><TD align="right" className="tabular-nums">{money(a.bal)}</TD></TR>
          ))}
          <TR className="border-t-2 border-ink-200 font-semibold">
            <TD colSpan={2}>{totalLabel}</TD><TD align="right" className={`tabular-nums ${tone ?? ''}`}>{money(total)}</TD>
          </TR>
        </TBody>
      </Table>
    </Card>
  );

  return (
    <>
      <PageHeader title="การเงิน PEAK" subtitle={`${ctx.company?.name_th ?? 'บริษัท'} · กระจกเงินจากระบบบัญชี PEAK (อ่านอย่างเดียว)`} />

      {/* ───────── Hero: ภาพรวมกำไร ───────── */}
      <div className="mb-5 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 via-brand-600 to-teal-500 p-6 text-white shadow-lg">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-white/70">กำไรสุทธิ · งวด {tb.period}</p>
            <p className="mt-1 text-4xl font-bold tabular-nums">{money(netProfit)} <span className="text-lg font-normal text-white/80">บาท</span></p>
            <p className="mt-1 text-sm text-white/80">อัตรากำไรสุทธิ {(margin * 100).toFixed(1)}% · ดึงข้อมูลเมื่อ {pulled}</p>
          </div>
          <div className="flex gap-8">
            <div><p className="text-xs text-white/70">รายได้รวม</p><p className="text-2xl font-semibold tabular-nums">{compact(revenue)}</p></div>
            <div><p className="text-xs text-white/70">ค่าใช้จ่ายรวม</p><p className="text-2xl font-semibold tabular-nums">{compact(expense)}</p></div>
            <div><p className="text-xs text-white/70">สินทรัพย์รวม</p><p className="text-2xl font-semibold tabular-nums">{compact(assets)}</p></div>
          </div>
        </div>
      </div>

      {/* ───────── KPI cards ───────── */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="รายได้รวม" value={revenue} tone="brand" />
        <StatCard label="ค่าใช้จ่ายรวม" value={expense} tone="neutral" />
        <StatCard label="หนี้สินรวม" value={liabilities} tone="neutral" />
        <StatCard label="ส่วนของผู้ถือหุ้น" value={equity} tone="neutral" />
        <StatCard label="ลูกหนี้การค้าคงค้าง" value={arap.ar.total} tone="positive" hint={`${arap.ar.parties.length} ราย`} />
        <StatCard label="เจ้าหนี้การค้าคงค้าง" value={arap.ap.total} tone="negative" hint={`${arap.ap.parties.length} ราย`} />
        <StatCard label="สินทรัพย์รวม" value={assets} tone="neutral" />
        <StatCard label="กำไรสุทธิ" value={netProfit} tone={netProfit >= 0 ? 'positive' : 'negative'} />
      </div>

      {/* ───────── Charts ───────── */}
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Card><CardHeader title="รายได้ แยกตามประเภท" /><DonutBreakdown slices={toSlices(revRows)} total={revenue} topN={5} /></Card>
        <Card><CardHeader title="ค่าใช้จ่าย แยกตามประเภท" /><DonutBreakdown slices={toSlices(expRows)} total={expense} topN={5} /></Card>
        <Card><CardHeader title="ลูกหนี้ รายใหญ่" right={<span className="text-xs text-ink-400">{arap.ar.parties.length} ราย</span>} /><DonutBreakdown slices={toSlices(arap.ar.parties)} total={arap.ar.total} topN={6} /></Card>
        <Card><CardHeader title="เจ้าหนี้ รายใหญ่" right={<span className="text-xs text-ink-400">{arap.ap.parties.length} ราย</span>} /><DonutBreakdown slices={toSlices(arap.ap.parties)} total={arap.ap.total} topN={6} /></Card>
      </div>

      {/* ───────── P&L ───────── */}
      <h2 className="mb-2 mt-6 text-sm font-semibold text-ink-700">งบกำไรขาดทุน (P&amp;L)</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <SectionTable title="รายได้" rows={revRows} totalLabel="รวมรายได้" total={revenue} tone="text-brand-700" />
        <SectionTable title="ค่าใช้จ่าย" rows={expRows} totalLabel="รวมค่าใช้จ่าย" total={expense} />
      </div>
      <Card className="mb-6"><div className="flex items-center justify-between px-4 py-3"><span className="font-semibold">กำไร (ขาดทุน) สุทธิ</span><span className={`text-xl font-bold tabular-nums ${netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{money(netProfit)}</span></div></Card>

      {/* ───────── Balance Sheet ───────── */}
      <h2 className="mb-2 mt-6 text-sm font-semibold text-ink-700">งบแสดงฐานะการเงิน (งบดุล)</h2>
      <div className="grid gap-4 md:grid-cols-3">
        <SectionTable title="สินทรัพย์" rows={assetRows} totalLabel="รวมสินทรัพย์" total={assets} />
        <SectionTable title="หนี้สิน" rows={liabRows} totalLabel="รวมหนี้สิน" total={liabilities} />
        <SectionTable title="ส่วนของผู้ถือหุ้น" rows={eqRows} totalLabel="รวมส่วนของผู้ถือหุ้น" total={equity} />
      </div>

      {/* ───────── AR / AP detail ───────── */}
      <h2 className="mb-2 mt-6 text-sm font-semibold text-ink-700">ลูกหนี้ / เจ้าหนี้ คงค้าง (รายคู่ค้า)</h2>
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
      <h2 className="mb-2 mt-6 text-sm font-semibold text-ink-700">งบทดลอง ({allRows.length} บัญชี)</h2>
      <Card>
        <Table>
          <THead><TR><TH>รหัส</TH><TH>ชื่อบัญชี</TH><TH align="right">เดบิต</TH><TH align="right">เครดิต</TH></TR></THead>
          <TBody>{allRows.map((a) => (<TR key={a.code}><TD className="font-mono text-xs text-ink-500">{a.code}</TD><TD>{a.name}</TD><TD align="right" className="tabular-nums">{a.debit ? money(a.debit) : '-'}</TD><TD align="right" className="tabular-nums">{a.credit ? money(a.credit) : '-'}</TD></TR>))}</TBody>
        </Table>
      </Card>
    </>
  );
}
