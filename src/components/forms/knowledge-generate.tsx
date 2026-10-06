'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { generateKnowledgeArticle } from '@/actions/knowledge';

export function KnowledgeGenerate({
  suggested, labels,
}: {
  suggested: string[];
  labels: { placeholder: string; generate: string; failed: string; suggested: string };
}) {
  const router = useRouter();
  const [topic, setTopic] = useState('');
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  function run(tp?: string) {
    const value = (tp ?? topic).trim();
    if (!value) return;
    setErr('');
    start(async () => {
      const res = await generateKnowledgeArticle(value);
      if (!res.ok) { setErr(res.error || labels.failed); return; }
      setTopic('');
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className="input flex-1"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
          placeholder={labels.placeholder}
        />
        <button className="btn-primary whitespace-nowrap" disabled={pending} onClick={() => run()}>
          {pending ? <ShdSpinner size={16} /> : <Sparkles className="h-4 w-4" />} {labels.generate}
        </button>
      </div>
      {err && <p className="text-xs text-rose-600">{err}</p>}
      {suggested.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11.5px] text-ink-400">{labels.suggested}:</span>
          {suggested.map((s) => (
            <button
              key={s}
              disabled={pending}
              onClick={() => run(s)}
              className="chip bg-ink-100 text-ink-600 ring-ink-200 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
