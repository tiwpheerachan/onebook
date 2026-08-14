'use client';
import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Check, Trash2 } from 'lucide-react';
import { ShdSpinner, ShdOverlay } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { uploadForExtraction, createDocumentFromJob, discardJob } from '@/actions/ai-import';
import { useI18n } from '@/i18n/provider';

export function AiUpload({ configured, labels }: { configured: boolean; labels: Record<string, string> }) {
  const router = useRouter();
  const { dict: d } = useI18n();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(''); setOk(false);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await uploadForExtraction(fd);
      if (!res.ok) { setErr(res.error || ''); router.refresh(); return; }
      setOk(true);
      formRef.current?.reset();
      router.refresh();
    });
  }

  return (
    <>
      <button className="btn-primary" onClick={() => { setOpen(true); setErr(''); setOk(false); }}>
        <Sparkles className="h-4 w-4" strokeWidth={1.8} /> {labels.upload}
      </button>

      <SlidePanel open={open} onClose={() => setOpen(false)} title={labels.upload}>
        <form ref={formRef} onSubmit={submit}>
          {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2.5 text-xs leading-relaxed text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}
          {ok && (
            <p className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700 ring-1 ring-inset ring-emerald-200">
              <Check className="h-4 w-4" strokeWidth={2} /> {labels.upload} ✓
            </p>
          )}

          <label className="label">{labels.file}</label>
          <input
            type="file"
            name="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            required
            className="block w-full cursor-pointer rounded-lg border border-dashed border-ink-300 bg-ink-50 px-3 py-6 text-center text-sm text-ink-500 file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:border-brand-400"
          />
          <p className="mt-1.5 text-xxs leading-relaxed text-ink-400">{labels.fileHint}</p>

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>{labels.close}</button>
            <button type="submit" className="btn-primary" disabled={pending || !configured}>
              {pending && <ShdSpinner size={16} />} {labels.upload}
            </button>
          </div>
        </form>
      </SlidePanel>

      {/* อ่านเอกสารด้วย OCR/AI เป็นขั้นที่รอนานที่สุดในระบบ จึงบังหน้าจอไว้ทั้งจอ */}
      <ShdOverlay open={pending} label={labels.upload} sublabel={d.common.pleaseWait} />
    </>
  );
}

export function AiJobActions({
  jobId, mapped, labels,
}: {
  jobId: string;
  mapped: any;
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  function create() {
    setErr('');
    start(async () => {
      const res = await createDocumentFromJob(jobId);
      if (!res.ok) { setErr(res.error || ''); return; }
      router.refresh();
    });
  }

  function drop() {
    start(async () => {
      await discardJob(jobId);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {err && <span className="max-w-[16rem] text-right text-xxs text-rose-600">{err}</span>}
      <div className="flex items-center gap-1">
        <button
          onClick={create}
          disabled={pending}
          title={labels.create}
          className="rounded p-1 text-ink-400 hover:bg-brand-50 hover:text-brand-600"
        >
          {pending ? <ShdSpinner size={16} /> : <Check className="h-4 w-4" strokeWidth={1.8} />}
        </button>
        <button
          onClick={drop}
          disabled={pending}
          title={labels.discard}
          className="rounded p-1 text-ink-400 hover:bg-rose-50 hover:text-rose-600"
        >
          <Trash2 className="h-4 w-4" strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}
