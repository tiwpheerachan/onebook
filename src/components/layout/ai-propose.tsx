'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles, ShieldAlert, ShieldCheck, Check, X, ArrowRight, SendHorizonal, Ban, CheckCircle2, PencilLine,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { money } from '@/lib/format';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { docKindLabel } from '@/lib/search-meta';
import { confirmProposal } from '@/actions/ai-proposals';
import { FIELD_LABEL } from '@/lib/ai-actions';
import type { Dictionary } from '@/i18n';

interface Proposal {
  action: 'approve' | 'void' | 'update_fields';
  document_id: string;
  expected_updated_at: string;
  changes?: { field: keyof typeof FIELD_LABEL; from: unknown; to: unknown }[];
  reason?: string;
  rationale: string;
  doc: { number: string; kind: string; date: string; total: number; status: string; contact: string | null };
  blockers: string[];
}

const ACTION_ICON = { approve: CheckCircle2, void: Ban, update_fields: PencilLine };

/**
 * สั่งงาน AI แบบเสนอ–ยืนยัน
 *
 * AI ไม่เคยแตะฐานข้อมูล มันคืนข้อเสนอมาให้ดูก่อนเท่านั้น
 * ปุ่มยืนยันเรียก server action ที่ตรวจสิทธิ์และสถานะเอกสารใหม่ทั้งหมด
 */
export function AiPropose({ d, locale }: { d: Dictionary; locale: string }) {
  const L = d.ui.propose;
  const router = useRouter();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  const ask = async () => {
    const text = q.trim();
    if (text.length < 2 || busy) return;
    setBusy(true); setErr(''); setDone(false); setProposal(null); setMessage('');
    try {
      const r = await fetch('/api/ai/propose', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ instruction: text, locale }),
      });
      const j = await r.json();
      setMessage(j.message || j.error || L.failed);
      setProposal(j.proposal || null);
    } catch {
      setErr(L.failed);
    } finally {
      setBusy(false);
    }
  };

  const run = () => {
    if (!proposal) return;
    setErr('');
    start(async () => {
      const res = await confirmProposal(proposal as any);
      if (!res.ok) { setErr(res.error || L.failed); return; }
      setProposal(null);
      setDone(true);
      setQ('');
      router.refresh();
    });
  };

  const Icon = proposal ? ACTION_ICON[proposal.action] : Sparkles;
  const headline = proposal
    ? proposal.action === 'approve' ? L.willApprove
    : proposal.action === 'void' ? L.willVoid
    : L.willUpdate
    : '';

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <div className="rounded-lg bg-brand-50 px-3 py-2.5 text-xs leading-relaxed text-brand-800">
          <p className="flex items-center gap-1.5 font-medium">
            <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} /> {L.subtitle}
          </p>
          <p className="mt-1.5">{L.safetyNote}</p>
        </div>

        {message && !proposal && (
          <p className="whitespace-pre-wrap rounded-2xl bg-ink-50 px-3.5 py-2.5 text-sm leading-relaxed text-ink-800">
            {message}
          </p>
        )}

        {done && (
          <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-200">
            <Check className="h-4 w-4" strokeWidth={2.2} /> {L.done}
          </p>
        )}

        {err && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>
        )}

        {/* ---------- ข้อเสนอ ---------- */}
        {proposal && (
          <div className="rounded-xl border border-ink-200 bg-white">
            <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-2.5">
              <Icon className={cn('h-4 w-4', proposal.action === 'void' ? 'text-rose-600' : 'text-brand-600')} strokeWidth={1.8} />
              <p className="text-sm font-semibold text-ink-900">{L.proposalTitle}</p>
            </div>

            <div className="space-y-3 px-4 py-3">
              <p className="text-sm text-ink-800">{headline}</p>

              <div className="rounded-lg bg-ink-50 px-3 py-2 text-xs">
                <p className="font-mono font-medium text-ink-900">{proposal.doc.number}</p>
                <p className="mt-0.5 text-ink-600">
                  {docKindLabel(d, proposal.doc.kind)} · {proposal.doc.date}
                  {proposal.doc.contact && ` · ${proposal.doc.contact}`}
                </p>
                <p className="mt-0.5 tabular-nums text-ink-700">{money(proposal.doc.total)}</p>
              </div>

              {/* ก่อน → หลัง */}
              {proposal.changes && proposal.changes.length > 0 && (
                <ul className="space-y-2">
                  {proposal.changes.map((c) => (
                    <li key={String(c.field)} className="text-xs">
                      <p className="font-medium text-ink-700">
                        {(FIELD_LABEL[c.field] as any)?.[locale] || String(c.field)}
                      </p>
                      <p className="mt-0.5 flex items-center gap-2">
                        <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-700 line-through">
                          {String(c.from ?? '—') || '—'}
                        </span>
                        <ArrowRight className="h-3 w-3 shrink-0 text-ink-400" strokeWidth={2} />
                        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
                          {String(c.to ?? '—') || '—'}
                        </span>
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              {proposal.reason && (
                <p className="text-xs text-ink-600">
                  <span className="font-medium">{L.reason}:</span> {proposal.reason}
                </p>
              )}

              {proposal.rationale && (
                <p className="text-xxs leading-relaxed text-ink-500">
                  <span className="font-medium">{L.rationale}:</span> {proposal.rationale}
                </p>
              )}

              {proposal.blockers.length > 0 && (
                <div className="rounded-lg bg-rose-50 px-3 py-2 ring-1 ring-inset ring-rose-200">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-rose-800">
                    <ShieldAlert className="h-3.5 w-3.5" strokeWidth={2} /> {L.blocked}
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {proposal.blockers.map((b) => (
                      <li key={b} className="text-xxs text-rose-700">• {b}</li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-xxs text-ink-400">{L.auditNote}</p>
            </div>

            <div className="flex justify-end gap-2 border-t border-ink-100 px-4 py-2.5">
              <button className="btn-secondary" onClick={() => setProposal(null)} disabled={pending}>
                <X className="h-3.5 w-3.5" strokeWidth={1.8} /> {L.cancel}
              </button>
              <button
                className={cn('btn-primary', proposal.blockers.length > 0 && 'opacity-40')}
                disabled={pending || proposal.blockers.length > 0}
                onClick={run}
              >
                {pending && <ShdSpinner size={16} />} {L.confirm}
              </button>
            </div>
          </div>
        )}

        {busy && (
          <div className="flex items-center gap-2 text-sm text-ink-500">
            <ShdSpinner size={16} /> {d.ui.assistant.thinking}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); ask(); }}
        className="flex items-center gap-2 border-t border-ink-200 px-3 py-3"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={L.placeholder}
          className="input flex-1"
        />
        <button
          type="submit"
          disabled={busy || q.trim().length < 2}
          className={cn('btn-primary shrink-0 px-3', (busy || q.trim().length < 2) && 'opacity-40')}
        >
          <SendHorizonal className="h-4 w-4" strokeWidth={1.8} />
        </button>
      </form>
    </div>
  );
}
