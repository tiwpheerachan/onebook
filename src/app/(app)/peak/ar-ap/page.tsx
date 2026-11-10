import { ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { requirePermission } from '@/lib/session';
import { Card, CardHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { DonutBreakdown } from '@/components/charts/charts';
import { money } from '@/lib/format';
import { peakFin, toSlices } from '@/lib/peak-fin';

export const dynamic = 'force-dynamic';

export default async function PeakArApPage() {
  await requirePermission('report', 'view');
  const { arap } = peakFin();

  const PartyTable = ({ parties }: { parties: { name: string; amount: number }[] }) => (
    <Table>
      <THead><TR><TH>คู่ค้า</TH><TH align="right">ยอดคงค้าง (บาท)</TH></TR></THead>
      <TBody>
        {parties.map((p, i) => (
          <TR key={i}><TD className="truncate">{p.name || '(ไม่ระบุ)'}</TD><TD align="right" className="tabular-nums">{money(p.amount)}</TD></TR>
        ))}
      </TBody>
    </Table>
  );

  return (
    <>
      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600"><ArrowDownCircle size={24} /></span>
          <div><p className="text-xs text-slate-500">ลูกหนี้การค้าคงค้าง · {arap.ar.parties.length} ราย</p><p className="text-2xl font-bold tabular-nums text-emerald-700">{money(arap.ar.total)}</p></div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50/60 p-5">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-100 text-rose-600"><ArrowUpCircle size={24} /></span>
          <div><p className="text-xs text-slate-500">เจ้าหนี้การค้าคงค้าง · {arap.ap.parties.length} ราย</p><p className="text-2xl font-bold tabular-nums text-rose-700">{money(arap.ap.total)}</p></div>
        </div>
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <Card><CardHeader title="ลูกหนี้ รายใหญ่" /><DonutBreakdown slices={toSlices(arap.ar.parties)} total={arap.ar.total} topN={7} /></Card>
        <Card><CardHeader title="เจ้าหนี้ รายใหญ่" /><DonutBreakdown slices={toSlices(arap.ap.parties)} total={arap.ap.total} topN={7} /></Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader title={`ลูกหนี้การค้า (${arap.ar.parties.length} ราย)`} right={<b className="text-sm tabular-nums text-emerald-600">{money(arap.ar.total)}</b>} /><PartyTable parties={arap.ar.parties} /></Card>
        <Card><CardHeader title={`เจ้าหนี้การค้า (${arap.ap.parties.length} ราย)`} right={<b className="text-sm tabular-nums text-rose-600">{money(arap.ap.total)}</b>} /><PartyTable parties={arap.ap.parties} /></Card>
      </div>
    </>
  );
}
