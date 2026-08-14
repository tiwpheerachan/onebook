'use client';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/badge';
import { money } from '@/lib/format';
import { BulkGroupBar, GROUP_COLORS, type GroupRow } from './contact-groups';
import { ContactManager } from './contact-manager';

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

/**
 * ตารางผู้ติดต่อที่เลือกได้หลายรายการ
 * เลือกแล้วแถบเครื่องมือด้านบนจะโผล่ให้จัดกลุ่มทีเดียวหลายราย
 */
export function ContactTable({
  rows, groups, currentGroup, canEdit, labels,
}: {
  rows: ContactRow[];
  groups: GroupRow[];
  currentGroup?: string;
  canEdit: boolean;
  labels: Record<string, string>;
}) {
  const [sel, setSel] = useState<string[]>([]);
  const allOn = rows.length > 0 && sel.length === rows.length;

  const toggle = (id: string) =>
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <>
      {canEdit && (
        <BulkGroupBar selected={sel} groups={groups} currentGroup={currentGroup} onDone={() => setSel([])} />
      )}

      <div className="card overflow-x-auto">
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
              <th className="th-cell">รหัส</th>
              <th className="th-cell">ชื่อ</th>
              <th className="th-cell">กลุ่ม</th>
              <th className="th-cell">เลขประจำตัวผู้เสียภาษี</th>
              <th className="th-cell">ประเภท</th>
              <th className="th-cell">โทรศัพท์</th>
              <th className="th-cell text-right">เครดิต</th>
              <th className="th-cell text-right">วงเงิน</th>
              <th className="th-cell" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-5 py-10 text-center text-sm text-ink-400">
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
                <td className="td-cell text-center text-xxs text-ink-400">{i + 1}</td>
                <td className="td-cell"><span className="font-mono text-xs">{r.code}</span></td>
                <td className="td-cell max-w-[20rem] truncate font-medium text-ink-900">
                  {r.name}
                  {!r.is_active && <Badge>ปิดใช้งาน</Badge>}
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
                <td className="td-cell num">{Number(r.credit_limit) ? money(r.credit_limit) : '–'}</td>
                <td className="td-cell text-right">
                  <ContactManager canCreate={false} canEdit={canEdit} editRow={r} labels={labels} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
