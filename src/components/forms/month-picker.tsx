'use client';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

const MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

export function MonthPicker({ year, month }: { year: number; month: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const go = (y: number, m: number) => {
    const p = new URLSearchParams(params.toString());
    p.set('y', String(y)); p.set('m', String(m));
    router.push(`${pathname}?${p.toString()}`);
  };
  const years = Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - 4 + i);
  return (
    <div className="no-print flex gap-2">
      <select className="input w-36" value={month} onChange={(e) => go(year, Number(e.target.value))}>
        {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
      </select>
      <select className="input w-28" value={year} onChange={(e) => go(Number(e.target.value), month)}>
        {years.map((y) => <option key={y} value={y}>{y} / {y + 543}</option>)}
      </select>
    </div>
  );
}
