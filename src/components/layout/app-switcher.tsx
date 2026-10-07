'use client';
import { useState } from 'react';
import { LayoutGrid, Boxes, FileCheck2, BookOpen } from 'lucide-react';

// ไอคอนสลับแอปบน navbar — ลิงก์ไประบบอื่นในชุดเดียวกัน (ทรัพย์สิน / ขออนุมัติ)
// URL ส่งมาจาก server (env ASSET_APP_URL / OA_APP_URL) ถ้าไม่ตั้ง ใช้ค่า default ของ Render
const DEFAULT_ASSET = 'https://shd-asset.onrender.com';
const DEFAULT_OA = 'https://shd-oa.onrender.com';

export function AppSwitcher({
  assetUrl, oaUrl, labels,
}: {
  assetUrl?: string;
  oaUrl?: string;
  labels: { title: string; accounting: string; assets: string; oa: string; current: string };
}) {
  const [open, setOpen] = useState(false);
  const external = [
    { key: 'assets', label: labels.assets, href: assetUrl || DEFAULT_ASSET, icon: Boxes },
    { key: 'oa', label: labels.oa, href: oaUrl || DEFAULT_OA, icon: FileCheck2 },
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title={labels.title}
        className="rounded-md p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-800"
        aria-label={labels.title}
      >
        <LayoutGrid className="h-5 w-5" strokeWidth={1.8} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 w-56 rounded-lg border border-ink-200 bg-white p-1.5 shadow-lg">
            <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-ink-400">{labels.title}</div>
            <div className="flex items-center gap-2.5 rounded-md bg-ink-50 px-2 py-2 text-[13px] font-medium text-ink-800">
              <BookOpen className="h-4 w-4 text-brand-600" strokeWidth={1.8} />
              {labels.accounting}
              <span className="ml-auto text-[10px] text-ink-400">{labels.current}</span>
            </div>
            {external.map((a) => (
              <a key={a.key} href={a.href}
                 className="flex items-center gap-2.5 rounded-md px-2 py-2 text-[13px] text-ink-700 hover:bg-brand-50 hover:text-brand-700">
                <a.icon className="h-4 w-4" strokeWidth={1.8} /> {a.label}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
