'use client';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

export function FxCurrencyPicker({
  currencies, current,
}: { currencies: string[]; current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <select
      className="input w-auto py-1.5 text-sm"
      value={current}
      onChange={(e) => {
        const p = new URLSearchParams(params.toString());
        p.set('c', e.target.value);
        router.push(`${pathname}?${p.toString()}`);
      }}
    >
      {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
    </select>
  );
}
