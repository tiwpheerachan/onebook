/**
 * โครงหน้าระหว่างโหลด (Suspense boundary ระดับ route)
 * ทำให้การคลิกเมนูตอบสนองทันที ไม่ค้างรอข้อมูลจากเซิร์ฟเวอร์ก่อนแล้วค่อยเปลี่ยนหน้า
 * และช่วยให้ Next.js prefetch โครงหน้าไว้ล่วงหน้าตอนเมาส์ชี้ที่ลิงก์
 */
import { ShdMark } from '@/components/ui/shd-loader';
import { t } from '@/i18n/server';

export default function Loading() {
  const d = t();
  return (
    <div className="relative">
      {/* ป้ายโลโก้ลอยไว้กลางบน บอกว่ากำลังโหลดจริง ไม่ใช่หน้าค้าง */}
      <div className="no-print pointer-events-none absolute inset-x-0 -top-2 z-20 flex justify-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white/95 py-1.5 pl-1.5 pr-3.5 text-xs font-medium text-ink-600 shadow-card backdrop-blur">
          <ShdMark size={22} />
          {d.common.loading}
        </span>
      </div>

      <div className="animate-pulse">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="h-6 w-56 rounded-md bg-ink-200" />
          <div className="mt-2 h-4 w-80 rounded-md bg-ink-100" />
        </div>
        <div className="h-9 w-28 rounded-lg bg-ink-100" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card card-pad">
            <div className="h-3.5 w-24 rounded bg-ink-100" />
            <div className="mt-3 h-7 w-32 rounded bg-ink-200" />
          </div>
        ))}
      </div>

      <div className="card mt-5">
        <div className="border-b border-ink-200 px-5 py-3.5">
          <div className="h-4 w-40 rounded bg-ink-200" />
        </div>
        <div className="divide-y divide-ink-100">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5">
              <div className="h-3.5 w-28 rounded bg-ink-100" />
              <div className="h-3.5 w-24 rounded bg-ink-100" />
              <div className="h-3.5 flex-1 rounded bg-ink-100" />
              <div className="h-3.5 w-20 rounded bg-ink-100" />
            </div>
          ))}
        </div>
      </div>
      </div>
    </div>
  );
}
