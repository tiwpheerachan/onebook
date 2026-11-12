'use client';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { BorderBeam } from '@/components/ui/border-beam';

export function SearchBox({ placeholder, defaultValue = '' }: { placeholder: string; defaultValue?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(defaultValue);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = new URLSearchParams(params.toString());
    if (q) p.set('q', q); else p.delete('q');
    router.push(`${pathname}?${p.toString()}`);
  }

  return (
    <form onSubmit={submit} className="no-print relative w-full rounded-lg sm:w-72">
      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-ink-400" strokeWidth={1.8} />
      <input
        className="input relative w-full pl-9"
        placeholder={placeholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <BorderBeam />
    </form>
  );
}
