'use client';
import { useState } from 'react';
import {
  GitBranch, BookOpen, Wallet, Package, FileCheck2, Paperclip, Printer, History, Lock,
  ChevronDown, ExternalLink, ArrowRight, CircleDot,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { money, thaiDate } from '@/lib/format';
import { SLUG_BY_KIND, PURCHASE_KINDS } from '@/lib/constants';
import { docTitle } from './doc-meta';
import type { Dictionary } from '@/i18n';

export interface Trace {
  document: any;
  lines: any[];
  upstream: any[];
  downstream: any[];
  journal: any[];
  payments: any[];
  inventory: any[];
  tax_docs: any[];
  attachments: any[];
  prints: any[];
  audit: any[];
  frozen: boolean | null;
}

const docHref = (kind: string, id: string) => {
  const slug = SLUG_BY_KIND[kind];
  if (!slug) return null;
  const section = PURCHASE_KINDS.includes(kind as any) ? 'purchase' : 'sales';
  return `/${section}/${slug}/${id}`;
};

function Section({
  icon, title, count, children, defaultOpen = true,
}: {
  icon: React.ReactNode; title: string; count?: number;
  children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-ink-50">
        <span className="text-ink-400">{icon}</span>
        <h2 className="flex-1 text-sm font-semibold text-ink-900">{title}</h2>
        {count != null && <span className="chip bg-ink-100 text-ink-600 ring-ink-200">{count}</span>}
        <ChevronDown className={cn('h-4 w-4 text-ink-400 transition', !open && '-rotate-90')} strokeWidth={2} />
      </button>
      {open && <div className="border-t border-ink-100">{children}</div>}
    </div>
  );
}

/** เอกสารหนึ่งใบในสายธาร */
function FlowNode({ d, dict, current }: { d: any; dict: Dictionary; current?: boolean }) {
  const href = docHref(d.kind, d.id);
  const label = docTitle(dict, SLUG_BY_KIND[d.kind] || '');
  const body = (
    <span
      className={cn(
        'block min-w-[9rem] rounded-xl border px-3 py-2 transition',
        current
          ? 'border-brand-400 bg-brand-50 ring-2 ring-brand-100'
          : 'border-ink-200 bg-white hover:border-brand-300 hover:bg-brand-50/40'
      )}
    >
      <span className="block text-xxs text-ink-400">{label}</span>
      <span className="block font-mono text-xs font-semibold text-ink-900">{d.doc_number}</span>
      <span className="block text-xxs text-ink-500">{thaiDate(d.doc_date)}</span>
      <span className="mt-0.5 block text-xxs tabular-nums text-ink-600">{money(d.grand_total)}</span>
    </span>
  );
  return href && !current ? <a href={href}>{body}</a> : body;
}

export function DocumentTrace({ trace, dict }: { trace: Trace; dict: Dictionary }) {
  const doc = trace.document;
  const chain = [...(trace.upstream || []), doc, ...(trace.downstream || [])];

  return (
    <div className="space-y-4">
      {trace.frozen && (
        <p className="flex items-center gap-2 rounded-xl bg-ink-800 px-4 py-2.5 text-sm text-white">
          <Lock className="h-4 w-4 shrink-0" strokeWidth={2} />
          เอกสารใบนี้อยู่ในงวดที่ปิดแล้ว แก้ไขไม่ได้ — ตัวเลขถูกล็อกไว้เป็นหลักฐาน
        </p>
      )}

      {/* ─────────── สายธารเอกสาร ─────────── */}
      <Section icon={<GitBranch className="h-4 w-4" strokeWidth={1.8} />} title="สายธารเอกสาร" count={chain.length}>
        <div className="overflow-x-auto px-4 py-4">
          <div className="flex items-center gap-2">
            {chain.map((d, i) => (
              <span key={d.id} className="flex items-center gap-2">
                {i > 0 && <ArrowRight className="h-4 w-4 shrink-0 text-ink-300" strokeWidth={2} />}
                <FlowNode d={d} dict={dict} current={d.id === doc.id} />
              </span>
            ))}
          </div>
          <p className="mt-3 text-xxs leading-relaxed text-ink-400">
            ไล่จากเอกสารต้นทางไปจนถึงเอกสารสุดท้าย ทุกใบเชื่อมกันด้วยการอ้างอิงที่ระบบบันทึกไว้ตอนแปลงเอกสาร
            ไม่ใช่การเดาจากเลขที่หรือยอดเงิน
          </p>
        </div>
      </Section>

      {/* ─────────── รายการในเอกสาร ─────────── */}
      <Section icon={<CircleDot className="h-4 w-4" strokeWidth={1.8} />} title="รายการในเอกสาร" count={trace.lines.length}>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-ink-50">
              <th className="th-cell w-10">#</th>
              <th className="th-cell">รายการ</th>
              <th className="th-cell text-right">จำนวน</th>
              <th className="th-cell text-right">ราคา/หน่วย</th>
              <th className="th-cell text-right">จำนวนเงิน</th>
              <th className="th-cell">ลงบัญชี</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {trace.lines.map((l) => (
              <tr key={l.line_no}>
                <td className="td-cell text-ink-400">{l.line_no}</td>
                <td className="td-cell whitespace-normal">
                  {l.description}
                  {l.product && <span className="ml-1.5 font-mono text-xxs text-ink-400">{l.product.sku}</span>}
                </td>
                <td className="td-cell num">{money(l.quantity, 2)} {l.unit || ''}</td>
                <td className="td-cell num">{money(l.unit_price)}</td>
                <td className="td-cell num">{money(l.line_amount)}</td>
                <td className="td-cell">
                  {l.account
                    ? <span className="font-mono text-xxs text-ink-600">{l.account.code} {l.account.name}</span>
                    : <span className="text-xxs text-ink-300">–</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* ─────────── สมุดรายวัน ─────────── */}
      <Section icon={<BookOpen className="h-4 w-4" strokeWidth={1.8} />} title="ลงบัญชีเป็นอะไรบ้าง" count={trace.journal.length}>
        {trace.journal.length === 0 ? (
          <p className="px-4 py-4 text-sm text-ink-400">ยังไม่ได้ลงบัญชี — เอกสารจะลงบัญชีเมื่อถูกอนุมัติ</p>
        ) : (
          trace.journal.map((je) => (
            <div key={je.id} className="border-b border-ink-100 last:border-b-0">
              <div className="flex flex-wrap items-center gap-2 bg-ink-50 px-4 py-2">
                <a href={`/accounting/journal/${je.id}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline">
                  {je.entry_number}
                </a>
                <span className="text-xxs text-ink-500">{thaiDate(je.entry_date)}</span>
                <span className="chip bg-white text-ink-600 ring-ink-200">สมุด {je.book}</span>
                <span className="ml-auto text-xxs tabular-nums text-ink-600">
                  ดร. {money(je.total_debit)} / คร. {money(je.total_credit)}
                </span>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-ink-100">
                  {(je.lines || []).map((l: any) => (
                    <tr key={l.line_no}>
                      <td className="td-cell w-52">
                        <a href={`/accounting/ledger?account=${l.account_id}`} className="font-mono text-xs text-ink-700 hover:text-brand-700 hover:underline">
                          {l.account_code}
                        </a>
                        <span className="ml-1.5 text-xs text-ink-600">{l.account_name}</span>
                      </td>
                      <td className="td-cell whitespace-normal text-ink-500">{l.description}</td>
                      <td className="td-cell num w-28">{Number(l.debit) ? money(l.debit) : ''}</td>
                      <td className="td-cell num w-28">{Number(l.credit) ? money(l.credit) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </Section>

      {/* ─────────── เงินเข้า-ออก ─────────── */}
      {trace.payments.length > 0 && (
        <Section icon={<Wallet className="h-4 w-4" strokeWidth={1.8} />} title="การรับ-จ่ายเงินที่ตัดกับเอกสารนี้" count={trace.payments.length}>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ink-50">
                <th className="th-cell">เลขที่</th><th className="th-cell">วันที่</th>
                <th className="th-cell">ช่องทาง</th><th className="th-cell text-right">ตัดกับใบนี้</th>
                <th className="th-cell text-right">ยอดทั้งใบ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {trace.payments.map((p) => (
                <tr key={p.id}>
                  <td className="td-cell font-mono text-xs">{p.payment_number}</td>
                  <td className="td-cell">{thaiDate(p.payment_date)}</td>
                  <td className="td-cell">{p.channel || '–'}</td>
                  <td className="td-cell num font-medium">{money(p.amount_allocated)}</td>
                  <td className="td-cell num text-ink-500">{money(p.amount_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* ─────────── สต๊อก ─────────── */}
      {trace.inventory.length > 0 && (
        <Section icon={<Package className="h-4 w-4" strokeWidth={1.8} />} title="ผลกระทบต่อสินค้าคงคลัง" count={trace.inventory.length}>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ink-50">
                <th className="th-cell">วันที่</th><th className="th-cell">สินค้า</th>
                <th className="th-cell text-right">รับเข้า</th><th className="th-cell text-right">ตัดออก</th>
                <th className="th-cell text-right">ต้นทุน/หน่วย</th><th className="th-cell text-right">มูลค่า</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {trace.inventory.map((m, i) => (
                <tr key={i}>
                  <td className="td-cell">{thaiDate(m.move_date)}</td>
                  <td className="td-cell"><span className="font-mono text-xxs text-ink-400">{m.sku}</span> {m.product}</td>
                  <td className="td-cell num">{Number(m.qty_in) ? money(m.qty_in, 2) : ''}</td>
                  <td className="td-cell num">{Number(m.qty_out) ? money(m.qty_out, 2) : ''}</td>
                  <td className="td-cell num">{money(m.unit_cost)}</td>
                  <td className="td-cell num">{money(Number(m.value_in) || Number(m.value_out))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* ─────────── หลักฐานและประวัติ ─────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section icon={<Paperclip className="h-4 w-4" strokeWidth={1.8} />} title="หลักฐานประกอบ"
                 count={trace.attachments.length + trace.tax_docs.length} defaultOpen={false}>
          <ul className="divide-y divide-ink-100">
            {trace.tax_docs.map((t, i) => (
              <li key={`t${i}`} className="flex items-center gap-2 px-4 py-2 text-sm">
                <FileCheck2 className="h-3.5 w-3.5 shrink-0 text-ink-400" strokeWidth={1.8} />
                <span className="text-ink-700">{t.type}</span>
                <span className="font-mono text-xxs text-ink-500">{t.ref || '–'}</span>
                <span className="ml-auto chip bg-ink-100 text-ink-600 ring-ink-200">{t.status}</span>
              </li>
            ))}
            {trace.attachments.map((a) => (
              <li key={a.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-ink-400" strokeWidth={1.8} />
                <span className="truncate text-ink-700">{a.file_name}</span>
              </li>
            ))}
            {trace.prints.map((p, i) => (
              <li key={`p${i}`} className="flex items-center gap-2 px-4 py-2 text-sm">
                <Printer className="h-3.5 w-3.5 shrink-0 text-ink-400" strokeWidth={1.8} />
                <span className="text-ink-700">
                  {p.copy_no <= 1 ? 'พิมพ์ต้นฉบับ' : `พิมพ์สำเนาครั้งที่ ${p.copy_no - 1}`}
                </span>
                <span className="ml-auto text-xxs text-ink-400">{p.by}</span>
              </li>
            ))}
            {trace.attachments.length + trace.tax_docs.length + trace.prints.length === 0 && (
              <li className="px-4 py-3 text-sm text-ink-400">ยังไม่มีหลักฐานประกอบ</li>
            )}
          </ul>
        </Section>

        <Section icon={<History className="h-4 w-4" strokeWidth={1.8} />} title="ประวัติการแก้ไข"
                 count={trace.audit.length} defaultOpen={false}>
          {trace.audit.length === 0 ? (
            <p className="px-4 py-3 text-sm text-ink-400">ยังไม่มีประวัติการแก้ไขที่บันทึกไว้</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {trace.audit.map((a, i) => (
                <li key={i} className="flex items-center gap-2 px-4 py-2 text-sm">
                  <span className="chip bg-ink-100 text-ink-600 ring-ink-200">{a.action}</span>
                  <span className="truncate text-ink-600">{a.user_email || 'ระบบ'}</span>
                  <span className="ml-auto shrink-0 text-xxs text-ink-400">
                    {new Date(a.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
