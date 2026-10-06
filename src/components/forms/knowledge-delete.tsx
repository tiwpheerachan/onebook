'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { deleteKnowledge } from '@/actions/knowledge';

export function KnowledgeDelete({ id, confirmText }: { id: string; confirmText: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => {
        if (!window.confirm(confirmText)) return;
        start(async () => { await deleteKnowledge(id); router.refresh(); });
      }}
      className="rounded p-1 text-ink-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" strokeWidth={1.8} />
    </button>
  );
}
