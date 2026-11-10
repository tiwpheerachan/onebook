import { FileText, ExternalLink, ChevronLeft, ChevronRight, Paperclip } from 'lucide-react';
import Link from 'next/link';
import { requirePermission } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/server';
import { PageHeader, Card, CardHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { money } from '@/lib/format';
import { OaDocsFilter } from '@/components/finance/oa-docs-filter';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 100;
const fmtDate = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '-');
type SP = { form?: string; q?: string; page?: string };

export default async function OaDocumentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePermission('report', 'view');
  const sp = await searchParams;
  const form = sp.form || 'all';
  const q = (sp.q || '').trim();
  const page = Math.max(1, Number(sp.page) || 1);

  const sb = createAdminClient();

  const { data: summary } = await sb.rpc('oa_doc_summary', { p_from: null, p_to: null, p_q: q || null });
  const sum = (summary ?? []) as { form_code: string; form_name: string; cnt: number; sum_form: number; sum_ai: number }[];
  sum.sort((a, b) => Number(b.cnt) - Number(a.cnt));
  const grandCnt = sum.reduce((s, r) => s + Number(r.cnt), 0);
  const grandForm = sum.reduce((s, r) => s + Number(r.sum_form), 0);
  const forms = sum.map((r) => ({ code: r.form_code, label: `${r.form_name ?? r.form_code} (${Number(r.cnt).toLocaleString()})` }));

  let query = sb.from('oa_documents')
    .select('oa_key,serial,form_name,status,cancelled,applicant,department,submit_date,amount_form,amount_ai,files_count,ai_seller', { count: 'exact' })
    .order('submit_date', { ascending: false }).order('serial', { ascending: false });
  if (form !== 'all') query = query.eq('form_code', form);
  if (q) query = query.or(`serial.ilike.%${q}%,applicant.ilike.%${q}%,ai_seller.ilike.%${q}%`);
  const { data: rows, count } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const list = (rows ?? []) as {
    oa_key: string; serial: string | null; form_name: string | null; status: string | null; cancelled: boolean | null;
    applicant: string | null; department: string | null; submit_date: string | null;
    amount_form: number | null; amount_ai: number | null; files_count: number | null; ai_seller: string | null;
  }[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const mkHref = (p: number) => {
    const u = new URLSearchParams();
    if (form !== 'all') u.set('form', form);
    if (q) u.set('q', q);
    u.set('page', String(p));
    return `/oa?${u.toString()}`;
  };
  const formHref = (code: string) => {
    const u = new URLSearchParams();
    if (code !== 'all') u.set('form', code);
    if (q) u.set('q', q);
    const s = u.toString();
    return `/oa${s ? `?${s}` : ''}`;
  };

  return (
    <>
      <PageHeader title="เอกสาร OA" subtitle={`${ctx.company?.name_th ?? 'บริษัท'} · ใบคำขอจากระบบ OA (อนุมัติแล้ว) ดึงอัตโนมัติ · อ่านอย่างเดียว`} />

      <div className="mb-4 flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 text-sm text-slate-600">
        <FileText size={18} className="mt-0.5 shrink-0 text-indigo-600" />
        <div>
          <p className="font-medium text-slate-700">ใบคำขอ OA ที่อนุมัติแล้ว</p>
          <p className="mt-0.5 text-xs text-slate-500">
            ซิงก์จากระบบ OA อัตโนมัติ · เทียบยอดที่พนักงานกรอก (ฟอร์ม) กับยอดที่ AI อ่านจากไฟล์แนบ · ใช้ประกอบการลงบัญชี
          </p>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {sum.slice(0, 8).map((r) => (
          <Link key={r.form_code} href={formHref(r.form_code)}
            className={`rounded-xl border p-3 transition hover:shadow-sm ${form === r.form_code ? 'border-brand-300 bg-brand-50/50' : 'border-slate-100 bg-white'}`}>
            <p className="truncate text-xs text-slate-500" title={r.form_name ?? r.form_code}>{r.form_name ?? r.form_code}</p>
            <p className="mt-1 text-lg font-semibold text-slate-800">{Number(r.cnt).toLocaleString()}</p>
            <p className="text-xs tabular-nums text-slate-400">{money(r.sum_form, 0)} ฿</p>
          </Link>
        ))}
      </div>

      <OaDocsFilter form={form} q={q} forms={forms} />

      <Card>
        <CardHeader title={form === 'all' ? 'เอกสารทั้งหมด' : (sum.find((s) => s.form_code === form)?.form_name ?? form)}
          right={<span className="text-xs text-slate-400">{total.toLocaleString()} ใบ · ยอดฟอร์มรวม {money(grandForm, 0)} ฿ ({grandCnt.toLocaleString()} ใบในตัวกรอง)</span>} />
        <Table>
          <THead><TR><TH>เลขที่</TH><TH>ฟอร์ม</TH><TH>ผู้ยื่น</TH><TH>แผนก</TH><TH>วันที่ยื่น</TH><TH align="right">ยอดฟอร์ม</TH><TH align="right">ยอด AI</TH><TH>ไฟล์</TH><TH>สถานะ</TH></TR></THead>
          <TBody>
            {list.length === 0 ? <EmptyRow colSpan={9} label="ไม่มีรายการ" /> : list.map((d) => {
              const mismatch = d.amount_form != null && d.amount_ai != null && Math.abs(Number(d.amount_form) - Number(d.amount_ai)) > 1;
              return (
                <TR key={d.oa_key}>
                  <TD className="font-mono text-xs">{d.serial}</TD>
                  <TD className="text-xs text-slate-500"><span className="block max-w-[14rem] truncate" title={d.form_name ?? ''}>{d.form_name}</span></TD>
                  <TD className="text-xs">{d.applicant || '-'}</TD>
                  <TD className="max-w-[10rem] truncate text-xs text-slate-500">{d.department || '-'}</TD>
                  <TD className="text-xs text-slate-500">{fmtDate(d.submit_date)}</TD>
                  <TD align="right" className="tabular-nums">{d.amount_form != null ? money(d.amount_form) : '-'}</TD>
                  <TD align="right" className={`tabular-nums ${mismatch ? 'text-amber-600 font-medium' : ''}`}>{d.amount_ai != null ? money(d.amount_ai) : '-'}</TD>
                  <TD className="text-xs text-slate-500">{d.files_count ? <span className="inline-flex items-center gap-0.5"><Paperclip size={11} />{d.files_count}</span> : '-'}</TD>
                  <TD>{d.cancelled
                    ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xxs font-medium text-rose-600">ยกเลิก</span>
                    : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xxs font-medium text-emerald-600">อนุมัติ</span>}</TD>
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
