import { FileText, Clock, ExternalLink } from 'lucide-react';
import { requirePermission } from '@/lib/session';
import { Card, CardHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { money } from '@/lib/format';
import docsJson from '@/data/peak/documents.json';

export const dynamic = 'force-dynamic';

type DocRow = { type: string; code: string; date: string; due: string; contact: string; amount: number; link: string };
type Docs = { pulledAt: string; note?: string; invoices: { total: number; rows: DocRow[] }; expenses: { rows: DocRow[] } };
const docs = docsJson as unknown as Docs;

const fmtDate = (d: string) => (d && d.length >= 8 ? `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}` : d || '-');

export default async function PeakDocumentsPage() {
  await requirePermission('report', 'view');
  const inv = docs.invoices?.rows ?? [];
  const exp = docs.expenses?.rows ?? [];
  const pulled = (docs.pulledAt || '').slice(0, 10);

  const DocTable = ({ rows }: { rows: DocRow[] }) => (
    <Table>
      <THead><TR><TH>เลขที่</TH><TH>วันที่</TH><TH>ครบกำหนด</TH><TH>คู่ค้า</TH><TH align="right">ยอด (บาท)</TH><TH>สถานะ</TH><TH></TH></TR></THead>
      <TBody>
        {rows.length === 0 ? <EmptyRow colSpan={7} label="ไม่มีรายการ" /> : rows.map((d, i) => (
          <TR key={i}>
            <TD className="font-mono text-xs">{d.code}</TD>
            <TD className="text-xs text-slate-500">{fmtDate(d.date)}</TD>
            <TD className="text-xs text-slate-500">{fmtDate(d.due)}</TD>
            <TD className="truncate text-xs">{d.contact || '-'}</TD>
            <TD align="right" className="tabular-nums">{money(d.amount)}</TD>
            <TD><span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xxs font-medium text-amber-600"><Clock size={11} />รออนุมัติ</span></TD>
            <TD>{d.link && <a href={d.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"><ExternalLink size={12} />PEAK</a>}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );

  return (
    <>
      <div className="mb-4 flex items-start gap-3 rounded-2xl border border-sky-100 bg-sky-50/60 p-4 text-sm text-slate-600">
        <FileText size={18} className="mt-0.5 shrink-0 text-sky-600" />
        <div>
          <p className="font-medium text-slate-700">เอกสารรออนุมัติจาก PEAK</p>
          <p className="mt-0.5 text-xs text-slate-500">
            แสดงชุดล่าสุด (ใบแจ้งหนี้ {inv.length} จากทั้งหมด {docs.invoices?.total ?? 0} · ค่าใช้จ่าย {exp.length}) · ดึงเมื่อ {pulled} ·
            ระบบจะดึง <b>เฉพาะเอกสารที่เข้าใหม่</b> มาเพิ่มอัตโนมัติ · กดปุ่ม PEAK เพื่อดูรายใบฉบับเต็ม
          </p>
        </div>
      </div>

      <Card className="mb-4">
        <CardHeader title="ใบแจ้งหนี้ รออนุมัติ" right={<span className="text-xs text-slate-400">{inv.length} / {docs.invoices?.total ?? 0} ใบ</span>} />
        <DocTable rows={inv} />
      </Card>

      <Card>
        <CardHeader title="ค่าใช้จ่าย รออนุมัติ" right={<span className="text-xs text-slate-400">{exp.length} รายการ</span>} />
        <DocTable rows={exp} />
      </Card>
    </>
  );
}
