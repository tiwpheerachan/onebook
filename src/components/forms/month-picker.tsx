'use client';
import { useMemo } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useI18n } from '@/i18n/provider';

export function MonthPicker({ year, month }: { year: number; month: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { locale } = useI18n();

  // ชื่อเดือนดึงจาก Intl ตามภาษาที่เลือก ไม่ต้องเก็บชื่อเดือนซ้ำในพจนานุกรมสามชุด
  const months = useMemo(() => {
    const tag = locale === 'th' ? 'th-TH' : locale === 'zh' ? 'zh-CN' : 'en-GB';
    const fmt = new Intl.DateTimeFormat(tag, { month: 'long' });
    return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(Date.UTC(2000, i, 1))));
  }, [locale]);

  const go = (y: number, m: number) => {
    const p = new URLSearchParams(params.toString());
    p.set('y', String(y)); p.set('m', String(m));
    router.push(`${pathname}?${p.toString()}`);
  };
  const years = Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - 4 + i);

  return (
    <div className="no-print flex flex-wrap gap-2">
      <select className="input w-auto min-w-[8.5rem]" value={month}
              onChange={(e) => go(year, Number(e.target.value))}>
        {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
      </select>
      {/* ภาษาไทยแสดง พ.ศ. คู่กับ ค.ศ. จึงยาวกว่าอีกสองภาษา ปล่อยให้ความกว้างยืดตามข้อความ
          ไม่งั้นปีพุทธศักราชจะโดนตัดหาย */}
      <select className="input w-auto min-w-[6rem]" value={year}
              onChange={(e) => go(Number(e.target.value), month)}>
        {years.map((y) => (
          <option key={y} value={y}>{locale === 'th' ? `${y} / ${y + 543}` : y}</option>
        ))}
      </select>
    </div>
  );
}
