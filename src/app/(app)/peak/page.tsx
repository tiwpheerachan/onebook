import { requirePermission } from '@/lib/session';
import { PageHeader, Card, CardHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { StatCard } from '@/components/ui/stat-card';
import { money } from '@/lib/format';
import tbJson from '@/data/peak/trial-balance.json';

export const dynamic = 'force-dynamic';

type Acct = { code: string; name: string; debit: number; credit: number };
type TB = { source: string; period: string; pulledAt: string; accounts: Acct[] };

const tb = tbJson as unknown as TB;

export default async function PeakFinancialsPage() {
  const ctx = await requirePermission('report', 'view');
  const accounts = tb.accounts || [];
  const r2 = (n: number) => Math.round(n * 100) / 100;
  // ยอดตามด้านธรรมชาติของบัญชี (side: dr = เดบิตปกติ, cr = เครดิตปกติ)
  const balOf = (a: Acct, side: 'dr' | 'cr') => (side === 'dr' ? a.debit - a.credit : a.credit - a.debit);
  const sumBy = (pred: (a: Acct) => boolean, side: 'dr' | 'cr') =>
    r2(accounts.filter(pred).reduce((s, a) => s + balOf(a, side), 0));
  const group = (prefix: string, side: 'dr' | 'cr') =>
    accounts
      .filter((a) => a.code.startsWith(prefix))
      .map((a) => ({ ...a, bal: r2(balOf(a, side)) }))
      .filter((a) => Math.abs(a.bal) > 0.005)
      .sort((x, y) => Math.abs(y.bal) - Math.abs(x.bal));

  const assets = sumBy((a) => a.code.startsWith('1'), 'dr');
  const liabilities = sumBy((a) => a.code.startsWith('2'), 'cr');
  const equity = sumBy((a) => a.code.startsWith('3'), 'cr');
  const revenue = sumBy((a) => a.code.startsWith('4'), 'cr');
  const expense = sumBy((a) => a.code.startsWith('5'), 'dr');
  const netProfit = r2(revenue - expense);
  const ar = sumBy((a) => a.code.startsWith('113'), 'dr');
  const ap = sumBy((a) => a.code.startsWith('21'), 'cr');

  const revRows = group('4', 'cr');
  const expRows = group('5', 'dr');
  const assetRows = group('1', 'dr');
  const liabRows = group('2', 'cr');
  const eqRows = group('3', 'cr');
  const allRows = accounts
    .filter((a) => Math.abs(a.debit) > 0.005 || Math.abs(a.credit) > 0.005)
    .sort((x, y) => x.code.localeCompare(y.code));

  const pulled = (tb.pulledAt || '').slice(0, 10);

  const Section = ({ title, rows, totalLabel, total, tone }: { title: string; rows: { code: string; name: string; bal: number }[]; totalLabel: string; total: number; tone?: string }) => (
    <Card className="mb-5">
      <CardHeader title={title} />
      <Table>
        <THead><TR><TH>รหัส</TH><TH>ชื่อบัญชี</TH><TH align="right">ยอด (บาท)</TH></TR></THead>
        <TBody>
          {rows.length === 0 ? <EmptyRow colSpan={3} label="ไม่มีรายการ" /> : rows.map((a) => (
            <TR key={a.code}><TD className="font-mono text-xs">{a.code}</TD><TD>{a.name}</TD><TD align="right">{money(a.bal)}</TD></TR>
          ))}
          <TR className="font-semibold border-t-2">
            <TD colSpan={2}>{totalLabel}</TD>
            <TD align="right" className={tone}>{money(total)}</TD>
          </TR>
        </TBody>
      </Table>
    </Card>
  );

  return (
    <>
      <PageHeader
        title="การเงิน PEAK"
        subtitle={`${ctx.company?.name_th ?? 'บริษัท'} · กระจกเงินจากระบบบัญชี PEAK (อ่านอย่างเดียว) · งวด ${tb.period} · ดึงเมื่อ ${pulled}`}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="รายได้รวม" value={revenue} tone="brand" />
        <StatCard label="ค่าใช้จ่ายรวม" value={expense} tone="neutral" />
        <StatCard label="กำไรสุทธิ" value={netProfit} tone={netProfit >= 0 ? 'positive' : 'negative'} size="lg" />
        <StatCard label="สินทรัพย์รวม" value={assets} tone="neutral" />
        <StatCard label="หนี้สินรวม" value={liabilities} tone="neutral" />
        <StatCard label="ส่วนของผู้ถือหุ้น" value={equity} tone="neutral" />
        <StatCard label="ลูกหนี้การค้าคงค้าง" value={ar} tone="neutral" hint="บัญชี 113xxx" />
        <StatCard label="เจ้าหนี้การค้าคงค้าง" value={ap} tone="neutral" hint="บัญชี 21xxxx" />
      </div>

      <h2 className="mb-2 mt-2 text-sm font-semibold text-ink-700">งบกำไรขาดทุน (P&amp;L)</h2>
      <Section title="รายได้" rows={revRows} totalLabel="รวมรายได้" total={revenue} tone="text-brand-700" />
      <Section title="ค่าใช้จ่าย" rows={expRows} totalLabel="รวมค่าใช้จ่าย" total={expense} />
      <Card className="mb-6">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="font-semibold">กำไร (ขาดทุน) สุทธิ</span>
          <span className={`text-lg font-bold ${netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{money(netProfit)}</span>
        </div>
      </Card>

      <h2 className="mb-2 mt-2 text-sm font-semibold text-ink-700">งบแสดงฐานะการเงิน (งบดุล)</h2>
      <Section title="สินทรัพย์" rows={assetRows} totalLabel="รวมสินทรัพย์" total={assets} />
      <Section title="หนี้สิน" rows={liabRows} totalLabel="รวมหนี้สิน" total={liabilities} />
      <Section title="ส่วนของผู้ถือหุ้น" rows={eqRows} totalLabel="รวมส่วนของผู้ถือหุ้น" total={equity} />
      <Card className="mb-6">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="font-semibold">หนี้สิน + ส่วนของผู้ถือหุ้น</span>
          <span className="text-sm font-semibold">{money(r2(liabilities + equity))} <span className="text-ink-400">(สินทรัพย์ {money(assets)})</span></span>
        </div>
      </Card>

      <h2 className="mb-2 mt-2 text-sm font-semibold text-ink-700">งบทดลอง (ทุกบัญชีที่มียอด · {allRows.length} บัญชี)</h2>
      <Card>
        <Table>
          <THead><TR><TH>รหัส</TH><TH>ชื่อบัญชี</TH><TH align="right">เดบิต</TH><TH align="right">เครดิต</TH></TR></THead>
          <TBody>
            {allRows.map((a) => (
              <TR key={a.code}>
                <TD className="font-mono text-xs">{a.code}</TD><TD>{a.name}</TD>
                <TD align="right">{a.debit ? money(a.debit) : '-'}</TD>
                <TD align="right">{a.credit ? money(a.credit) : '-'}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
