'use client';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

export function LedgerAccountPicker({
  accounts, current,
}: { accounts: { id: string; label: string }[]; current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <select
      className="input max-w-md"
      value={current}
      onChange={(e) => {
        const p = new URLSearchParams(params.toString());
        p.set('account', e.target.value);
        router.push(`${pathname}?${p.toString()}`);
      }}
    >
      {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
    </select>
  );
}
