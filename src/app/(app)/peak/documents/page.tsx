import { FileText, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { requirePermission } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/server';
import { Card, CardHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { money } from '@/lib/format';
import { PeakDocsFilter } from '@/components/finance/peak-docs-filter';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 100;
const TYPE_LABEL: Record<string, string> = {
  invoice: 'ใบแจ้งหนี้', receipt: 'ใบเสร็จรับเงิน', expense: 'ค่าใช้จ่าย',
  credit_note: 'ใบลดหนี้ (ขาย)', billing_note: 'ใบวางบิล', quotation: 'ใบเสนอราคา',
  credit_note_expense: 'ใบลดหนี้ซื้อ', billing_note_expense: 'ใบวางบิลซื้อ', purchase_order: 'ใบสั่งซื้อ',
};
const fmtDate = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '-');
const monthRange = (m: string): [string | null, string | null] => {
  if (!m || m === 'all' || m.length !== 6) return [null, null];
  const y = m.slice(0, 4), mo = m.slice(4, 6);
  const last = new Date(Number(y), Number(mo), 0).getDate();
  return [`${y}-${mo}-01`, `${y}-${mo}-${String(last).padStart(2, '0')}`];
};

type SP = { type?: string; month?: string; q?: string; page?: string };

export default async function PeakDocumentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermission('report', 'view');
  const sp = await searchParams;
  const type = sp.type || 'all';
  const month = sp.month || 'all';
  const q = (sp.q || '').trim();
  const page = Math.max(1, Number(sp.page) || 1);
  const [from, to] = monthRange(month);

  const sb = createAdminClient();

  // สรุปยอดต่อประเภท (ตามเดือน/คำค้น ที่เลือก — ไม่ผูกกับตัวกรองประเภท)
  const { data: summary } = await sb.rpc('peak_doc_summary', { p_from: from, p_to: to, p_q: q || null });
  const sum = (summary ?? []) as { doc_type: string; cnt: number; sum_net: number }[];
  sum.sort((a, b) => b.cnt - a.cnt);
  const grandCnt = sum.reduce((s, r) => s + Number(r.cnt), 0);
  const grandNet = sum.reduce((s, r) => s + Number(r.sum_net), 0);

  // รายการ (กรองครบ + แบ่งหน้า)
  let query = sb.from('peak_documents')
    .select('doc_type,code,issued_date,due_date,contact_code,net_amount,remain_amount,is_void,document_link', { count: 'exact' })
    .order('issued_date', { ascending: false }).order('code', { ascending: false });
  if (type !== 'all') query = query.eq('doc_type', type);
  if (from) query = query.gte('issued_date', from);
  if (to) query = query.lte('issued_date', to);
  if (q) query = query.or(`code.ilike.%${q}%,contact_code.ilike.%${q}%`);
  const { data: rows, count } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const list = (rows ?? []) as {
    doc_type: string; code: string; issued_date: string | null; due_date: string | null;
    contact_code: string | null; net_amount: number | null; remain_amount: number | null; is_void: number | null; document_link: string | null;
  }[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const mkHref = (p: number) => {
    const u = new URLSearchParams();
    if (type !== 'all') u.set('type', type);
    if (month !== 'all') u.set('month', month);
    if (q) u.set('q', q);
    u.set('page', String(p));
    return `/peak/documents?${u.toString()}`;
  };
  const typeHref = (dt: string) => {
    const u = new URLSearchParams();
    if (dt !== 'all') u.set('type', dt);
    if (month !== 'all') u.set('month', month);
    if (q) u.set('q', q);
    const s = u.toString();
    return `/peak/documents${s ? `?${s}` : ''}`;
  };

  return (
    <>
      <div className="mb-4 flex items-start gap-3 rounded-2xl border border-sky-100 bg-sky-50/60 p-4 text-sm text-slate-600">
        <FileText size={18} className="mt-0.5 shrink-0 text-sky-600" />
        <div>
          <p className="font-medium text-slate-700">เอกสารจาก PEAK (กระจกเงิน อ่านอย่างเดียว)</p>
          <p className="mt-0.5 text-xs text-slate-500">
            ดึงจากระบบบัญชี PEAK ให้ตรงกับของจริง · ช่วง ส.ค.–พ.ย. 2026 · กดปุ่ม PEAK เพื่อเปิดเอกสารฉบับเต็ม
          </p>
        </div>
      </div>

      {/* สรุปยอดต่อประเภท */}
      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {sum.map((r) => (
          <Link key={r.doc_type} href={typeHref(r.doc_type)}
            className={`rounded-xl border p-3 transition hover:shadow-sm ${type === r.doc_type ? 'border-brand-300 bg-brand-50/50' : 'border-slate-100 bg-white'}`}>
            <p className="truncate text-xs text-slate-500">{TYPE_LABEL[r.doc_type] ?? r.doc_type}</p>
            <p className="mt-1 text-lg font-semibold text-slate-800">{Number(r.cnt).toLocaleString()}</p>
            <p className="text-xs tabular-nums text-slate-400">{money(r.sum_net, 0)} ฿</p>
          </Link>
        ))}
      </div>

      <PeakDocsFilter type={type} month={month} q={q} />

      <Card>
        <CardHeader
          title={type === 'all' ? 'เอกสารทั้งหมด' : (TYPE_LABEL[type] ?? type)}
          right={<span className="text-xs text-slate-400">{total.toLocaleString()} ใบ · รวม {money(grandNet, 0)} ฿ ({grandCnt.toLocaleString()} ใบในตัวกรอง)</span>}
        />
        <Table>
          <THead><TR><TH>ประเภท</TH><TH>เลขที่</TH><TH>วันที่</TH><TH>ครบกำหนด</TH><TH>คู่ค้า</TH><TH align="right">ยอด (บาท)</TH><TH>สถานะ</TH><TH></TH></TR></THead>
          <TBody>
            {list.length === 0 ? <EmptyRow colSpan={8} label="ไม่มีรายการ" /> : list.map((d, i) => {
              const voided = d.is_void === 1;
              const outstanding = !voided && Number(d.remain_amount) > 0;
              return (
                <TR key={i}>
                  <TD className="text-xs text-slate-500">{TYPE_LABEL[d.doc_type] ?? d.doc_type}</TD>
                  <TD className="font-mono text-xs">{d.code}</TD>
                  <TD className="text-xs text-slate-500">{fmtDate(d.issued_date)}</TD>
                  <TD className="text-xs text-slate-500">{fmtDate(d.due_date)}</TD>
                  <TD className="truncate text-xs">{d.contact_code || '-'}</TD>
                  <TD align="right" className="tabular-nums">{money(d.net_amount)}</TD>
                  <TD>
                    {voided ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xxs font-medium text-rose-600">ยกเลิก</span>
                      : outstanding ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xxs font-medium text-amber-600">ค้างชำระ</span>
                      : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xxs font-medium text-emerald-600">ปกติ</span>}
                  </TD>
                  <TD>{d.document_link && <a href={d.document_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"><ExternalLink size={12} />PEAK</a>}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>

        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2.5 text-xs text-slate-500">
            <span>หน้า {page} / {pages}</span>
            <div className="flex gap-1">
              {page > 1 && <Link href={mkHref(page - 1)} className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 px-2.5 py-1.5 hover:bg-slate-50"><ChevronLeft size={13} />ก่อนหน้า</Link>}
              {page < pages && <Link href={mkHref(page + 1)} className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 px-2.5 py-1.5 hover:bg-slate-50">ถัดไป<ChevronRight size={13} /></Link>}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
