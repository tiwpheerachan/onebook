import { TrendingUp, TrendingDown, PiggyBank, Landmark, Scale, Building2, HandCoins, FileSpreadsheet, type LucideIcon } from 'lucide-react';
import { requirePermission } from '@/lib/session';
import { Card, CardHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { money } from '@/lib/format';
import { peakFin } from '@/lib/peak-fin';

export const dynamic = 'force-dynamic';

function SectionTitle({ icon: Icon, children, tint }: { icon: LucideIcon; children: React.ReactNode; tint: string }) {
  return (
    <h2 className="mb-3 mt-7 flex items-center gap-2 text-sm font-semibold text-slate-700 first:mt-0">
      <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${tint}`}><Icon size={15} /></span>{children}
    </h2>
  );
}

function AcctTable({ title, rows, totalLabel, total, tone }: { title: string; rows: { code: string; name: string; bal: number }[]; totalLabel: string; total: number; tone?: string }) {
  return (
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
}

export default async function PeakStatementsPage() {
  await requirePermission('report', 'view');
  const f = peakFin();
  return (
    <>
      <SectionTitle icon={HandCoins} tint="bg-emerald-50 text-emerald-600">งบกำไรขาดทุน (P&amp;L)</SectionTitle>
      <div className="grid gap-4 md:grid-cols-2">
        <AcctTable title="รายได้" rows={f.revRows} totalLabel="รวมรายได้" total={f.revenue} tone="text-teal-600" />
        <AcctTable title="ค่าใช้จ่าย" rows={f.expRows} totalLabel="รวมค่าใช้จ่าย" total={f.expense} tone="text-violet-600" />
      </div>
      <div className="mb-6 rounded-2xl border border-emerald-100 bg-emerald-50/60 px-5 py-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 font-semibold text-slate-700"><PiggyBank size={17} className="text-emerald-600" />กำไร (ขาดทุน) สุทธิ</span>
          <span className={`text-xl font-bold tabular-nums ${f.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{money(f.netProfit)}</span>
        </div>
      </div>

      <SectionTitle icon={Scale} tint="bg-sky-50 text-sky-600">งบแสดงฐานะการเงิน (งบดุล)</SectionTitle>
      <div className="grid gap-4 md:grid-cols-3">
        <AcctTable title="สินทรัพย์" rows={f.assetRows} totalLabel="รวมสินทรัพย์" total={f.assets} />
        <AcctTable title="หนี้สิน" rows={f.liabRows} totalLabel="รวมหนี้สิน" total={f.liabilities} />
        <AcctTable title="ส่วนของผู้ถือหุ้น" rows={f.eqRows} totalLabel="รวมส่วนของผู้ถือหุ้น" total={f.equity} />
      </div>

      <SectionTitle icon={FileSpreadsheet} tint="bg-slate-100 text-slate-600">งบทดลอง ({f.allRows.length} บัญชี)</SectionTitle>
      <Card>
        <Table>
          <THead><TR><TH>รหัส</TH><TH>ชื่อบัญชี</TH><TH align="right">เดบิต</TH><TH align="right">เครดิต</TH></TR></THead>
          <TBody>{f.allRows.map((a) => (
            <TR key={a.code}><TD className="font-mono text-xs text-slate-400">{a.code}</TD><TD>{a.name}</TD><TD align="right" className="tabular-nums">{a.debit ? money(a.debit) : '-'}</TD><TD align="right" className="tabular-nums">{a.credit ? money(a.credit) : '-'}</TD></TR>
          ))}</TBody>
        </Table>
      </Card>
    </>
  );
}
