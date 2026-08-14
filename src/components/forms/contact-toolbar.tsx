'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Upload, Printer, MoreHorizontal, Download, FolderPlus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { GROUP_COLORS, type GroupRow } from './contact-groups';

/**
 * แถบเครื่องมือเหนือตารางผู้ติดต่อ
 * ปุ่มจัดกลุ่มจะทำงานเมื่อเลือกรายการแล้ว (แถบสีเขียวจะโผล่ขึ้นมาแทน)
 */
export function ContactToolbar({
  groups, canEdit, canImport, exportButton,
}: {
  groups: GroupRow[];
  canEdit: boolean;
  canImport: boolean;
  /** ปุ่มส่งออก CSV ส่งมาจากฝั่งเซิร์ฟเวอร์เพราะต้องใช้ข้อมูลทั้งชุด */
  exportButton?: React.ReactNode;
}) {
  const [showOptions, setShowOptions] = useState(false);

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {canEdit && (
        <span
          title="ติ๊กเลือกผู้ติดต่อในตารางก่อน แล้วแถบจัดกลุ่มจะแสดงขึ้นมา"
          className="inline-flex cursor-default items-center gap-1.5 rounded-lg border border-dashed border-ink-300 px-2.5 py-1.5 text-xs text-ink-400"
        >
          <FolderPlus className="h-3.5 w-3.5" strokeWidth={1.8} />
          เพิ่มเข้ากลุ่ม / ออกจากกลุ่ม
          <span className="text-ink-300">— ติ๊กเลือกก่อน</span>
        </span>
      )}

      {canImport && (
        <Link href="/settings/data-import" className="btn-secondary">
          <Upload className="h-4 w-4 text-ink-400" strokeWidth={1.8} /> นำเข้าผู้ติดต่อ
        </Link>
      )}

      <button className="btn-secondary" onClick={() => window.print()}>
        <Printer className="h-4 w-4 text-ink-400" strokeWidth={1.8} /> พิมพ์รายงาน
      </button>

      <div className="relative">
        <button className="btn-secondary" onClick={() => setShowOptions((v) => !v)}>
          <MoreHorizontal className="h-4 w-4 text-ink-400" strokeWidth={1.8} /> ตัวเลือก
        </button>
        {showOptions && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowOptions(false)} />
            <div className="absolute left-0 z-20 mt-1 w-60 overflow-hidden rounded-xl border border-ink-200 bg-white py-1 shadow-card">
              {exportButton && (
                <div className="border-b border-ink-100 px-3 py-2 [&_button]:w-full [&_button]:justify-start">
                  {exportButton}
                </div>
              )}
              <p className="px-3.5 pb-1 pt-2 text-xxs font-semibold uppercase tracking-wider text-ink-400">
                กรองด่วนตามกลุ่ม
              </p>
              <div className="max-h-56 overflow-auto pb-1">
                {groups.length === 0 && (
                  <p className="px-3.5 py-2 text-xs text-ink-400">ยังไม่มีกลุ่มกำหนดเอง</p>
                )}
                {groups.map((g) => (
                  <Link
                    key={g.id}
                    href={`/contacts?g=${g.id}`}
                    onClick={() => setShowOptions(false)}
                    className="flex items-center gap-2 px-3.5 py-1.5 text-sm text-ink-700 hover:bg-brand-50 hover:text-brand-700"
                  >
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', GROUP_COLORS[g.color] || GROUP_COLORS.brand)} />
                    <span className="flex-1 truncate">{g.name}</span>
                    <span className="text-xxs text-ink-400">{g.member_count}</span>
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
