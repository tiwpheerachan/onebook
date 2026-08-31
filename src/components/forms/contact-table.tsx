'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/badge';
import { money } from '@/lib/format';
import { BulkGroupBar, GROUP_COLORS, type GroupRow } from './contact-groups';
import { ContactManager } from './contact-manager';
import { ContactRowActions, buildRowActions } from './contact-row-actions';

export interface ContactRow {
  id: string;
  code: string;
  name: string;
  tax_id: string | null;
  kind: string;
  phone: string | null;
  credit_days: number;
  credit_limit: number;
  is_active: boolean;
  groups: { id: string; name: string; color: string }[];
}

const PER_PAGE_OPTIONS = [10, 25, 50, 100];

/** หัวคอลัมน์ที่กดเรียงได้ สลับ ขึ้น → ลง → ขึ้น */
function SortHead({
  field, label, align = 'left',
}: {
  field: string; label: string; align?: 'left' | 'right';
}) {
  const router = useRouter();
  const params = useSearchParams();
  const active = params.get('sort') === field;
  const dir = params.get('dir') === 'desc' ? 'desc' : 'asc';

  function go() {
    const p = new URLSearchParams(params.toString());
    p.set('sort', field);
    p.set('dir', active && dir === 'asc' ? 'desc' : 'asc');
    p.delete('page');
    router.push(`/contacts?${p.toString()}`, { scroll: false });
  }

  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={cn('th-cell', align === 'right' && 'text-right')}>
      <button onClick={go} className={cn('inline-flex items-center gap-1 hover:text-brand-700', active && 'text-brand-700')}>
        {label}
        <Icon className="h-3 w-3" strokeWidth={2} />
      </button>
    </th>
  );
}

/**
 * ตารางผู้ติดต่อ : เลือกหลายรายการ เรียงคอลัมน์ แบ่งหน้า และมีเมนูทำรายการท้ายแถว
 */
export function ContactTable({
  rows, groups, currentGroup, groupName, canEdit, canCreateDoc, labels, page, perPage, total,
}: {
  rows: ContactRow[];
  groups: GroupRow[];
  currentGroup?: string;
  groupName?: string;
  canEdit: boolean;
  canCreateDoc: boolean;
  labels: Record<string, string>;
  page: number;
  perPage: number;
  total: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [sel, setSel] = useState<string[]>([]);
  const allOn = rows.length > 0 && sel.length === rows.length;
  const lastPage = Math.max(1, Math.ceil(total / perPage));

  const toggle = (id: string) =>
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  function nav(next: Record<string, string>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v); else p.delete(k);
    }
    router.push(`/contacts?${p.toString()}`, { scroll: false });
  }

  return (
    <>
      {canEdit && (
        <BulkGroupBar selected={sel} groups={groups} currentGroup={currentGroup} onDone={() => setSel([])} />
      )}

      <div className="card overflow-hidden">
        {/* หัวตาราง : บอกว่ากำลังดูกลุ่มไหน */}
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-200 px-5 py-3">
          <h2 className="text-sm font-medium text-ink-800">
            {groupName ? <>กลุ่ม <b className="font-semibold text-ink-900">{groupName}</b> :</> : 'ผู้ติดต่อทั้งหมด :'}
          </h2>
          <span className="text-xs text-ink-400">{total.toLocaleString('th-TH')} ราย</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50">
                {canEdit && (
                  <th className="th-cell w-10">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-300"
                      checked={allOn}
                      onChange={(e) => setSel(e.target.checked ? rows.map((r) => r.id) : [])}
                    />
                  </th>
                )}
                <th className="th-cell w-12 text-center">#</th>
                <SortHead field="code" label="เลขที่" />
                <SortHead field="name" label="ชื่อ" />
                <th className="th-cell">กลุ่ม</th>
                <th className="th-cell">เลขประจำตัวผู้เสียภาษี</th>
                <th className="th-cell">ประเภท</th>
                <th className="th-cell">โทรศัพท์</th>
                <SortHead field="credit_days" label="เครดิต" align="right" />
                <th className="th-cell text-right">คำสั่ง</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-5 py-10 text-center text-sm text-ink-400">
                    ไม่พบผู้ติดต่อตามเงื่อนไขที่เลือก
                  </td>
                </tr>
              )}
              {rows.map((r, i) => (
                <tr key={r.id} className={cn('hover:bg-ink-50', sel.includes(r.id) && 'bg-brand-50/50')}>
                  {canEdit && (
                    <td className="td-cell">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-300"
                        checked={sel.includes(r.id)}
                        onChange={() => toggle(r.id)}
                      />
                    </td>
                  )}
                  <td className="td-cell text-center text-xxs text-ink-400">{(page - 1) * perPage + i + 1}</td>
                  <td className="td-cell">
                    <Link href={`/sales/invoices?contact=${r.id}`} className="font-mono text-xs text-brand-700 hover:underline">
                      {r.code}
                    </Link>
                  </td>
                  <td className="td-cell font-medium text-ink-900">
                    <span className="flex items-center gap-1.5">
                      {/* ป้ายสถานะต้องไม่ถูกตัดทิ้งพร้อมชื่อยาว จึงอยู่นอกกล่องที่บีบ */}
                      <span className="block max-w-[20rem] truncate">{r.name}</span>
                      {!r.is_active && <Badge>ปิดใช้งาน</Badge>}
                    </span>
                  </td>
                  <td className="td-cell">
                    <span className="flex flex-wrap gap-1">
                      {r.groups.map((g) => (
                        <span key={g.id} className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-1.5 py-0.5 text-xxs text-ink-700">
                          <span className={cn('h-1.5 w-1.5 rounded-full', GROUP_COLORS[g.color] || GROUP_COLORS.brand)} />
                          {g.name}
                        </span>
                      ))}
                      {r.groups.length === 0 && <span className="text-xxs text-ink-300">–</span>}
                    </span>
                  </td>
                  <td className="td-cell"><span className="font-mono text-xs text-ink-500">{r.tax_id || '–'}</span></td>
                  <td className="td-cell">
                    <Badge tone={r.kind === 'vendor' ? 'warn' : r.kind === 'both' ? 'brand' : 'neutral'}>
                      {r.kind === 'customer' ? 'ลูกค้า' : r.kind === 'vendor' ? 'ผู้ขาย' : 'ทั้งสอง'}
                    </Badge>
                  </td>
                  <td className="td-cell">{r.phone || '–'}</td>
                  <td className="td-cell num">{r.credit_days} วัน</td>
                  <td className="td-cell">
                    <span className="flex items-center justify-end gap-1">
                      {canCreateDoc && <ContactRowActions actions={buildRowActions(r.id, r.kind)} />}
                      <ContactManager canCreate={false} canEdit={canEdit} editRow={r} labels={labels} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* แบ่งหน้า */}
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-ink-200 px-5 py-3 text-xs text-ink-600">
          <span className="flex items-center gap-1.5">
            แสดง
            <select
              className="input w-auto py-1 text-xs"
              value={perPage}
              onChange={(e) => nav({ per: e.target.value, page: '' })}
            >
              {PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            รายการ
          </span>

          <span className="flex items-center gap-1">
            <button
              disabled={page <= 1}
              onClick={() => nav({ page: String(page - 1) })}
              className="rounded-lg border border-ink-200 p-1 text-ink-500 transition hover:bg-ink-50 disabled:opacity-30"
            >
              <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
            <span className="px-1">หน้า</span>
            <select
              className="input w-auto py-1 text-xs"
              value={page}
              onChange={(e) => nav({ page: e.target.value })}
            >
              {Array.from({ length: lastPage }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span className="px-1 text-ink-400">/ {lastPage}</span>
            <button
              disabled={page >= lastPage}
              onClick={() => nav({ page: String(page + 1) })}
              className="rounded-lg border border-ink-200 p-1 text-ink-500 transition hover:bg-ink-50 disabled:opacity-30"
            >
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </span>
        </div>
      </div>
    </>
  );
}
