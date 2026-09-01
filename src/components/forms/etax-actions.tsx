'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileCode2, Send, Download } from 'lucide-react';
import { SlidePanel } from './slide-panel';
import { ShdSpinner, ShdOverlay } from '@/components/ui/shd-loader';
import { prepareEtax, submitEtax } from '@/actions/etax';
import { useI18n } from '@/i18n/provider';

export function EtaxActions({
  documentId, docNumber, etaxId, status, configured, labels,
}: {
  documentId: string;
  docNumber: string;
  etaxId?: string;
  status: string;
  configured: boolean;
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const { dict: d } = useI18n();
  const [xml, setXml] = useState('');
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [pending, start] = useTransition();

  function prepare() {
    setErr([]);
    start(async () => {
      const res = await prepareEtax(documentId);
      if (!res.ok) {
        setErr(res.errors?.length ? res.errors : [res.error || '']);
        setOpen(true);
        return;
      }
      setXml(res.xml || '');
      setOpen(true);
      router.refresh();
    });
  }

  function submit() {
    if (!etaxId) return;
    setErr([]);
    start(async () => {
      const res = await submitEtax(etaxId);
      if (!res.ok) { setErr([res.error || '']); setOpen(true); return; }
      router.refresh();
    });
  }

  function download() {
    setSaving(true);
    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `etax-${docNumber}.xml`;
          a.click();
          URL.revokeObjectURL(a.href);
        } finally {
          setSaving(false);
        }
      }, 220);
    });
  }

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        <button
          onClick={prepare}
          disabled={pending}
          title={labels.prepare}
          className="rounded p-1 text-ink-400 hover:bg-brand-50 hover:text-brand-600"
        >
          {pending ? <ShdSpinner size={16} /> : <FileCode2 className="h-4 w-4" strokeWidth={1.8} />}
        </button>
        {etaxId && status !== 'accepted' && (
          <button
            onClick={submit}
            disabled={pending || !configured}
            title={configured ? labels.submit : `${labels.submit} (${d.ui.misc.etaxNotConfiguredShort})`}
            className="rounded p-1 text-ink-400 hover:bg-brand-50 hover:text-brand-600 disabled:opacity-40"
          >
            <Send className="h-4 w-4" strokeWidth={1.8} />
          </button>
        )}
      </div>

      <SlidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={`e-Tax · ${docNumber}`}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setOpen(false)}>{labels.close}</button>
            {xml && (
              <button className="btn-primary" onClick={download}>
                <Download className="h-4 w-4" /> {labels.download}
              </button>
            )}
          </div>
        }
      >
        {err.length > 0 && (
          <ul className="mb-4 list-inside list-disc space-y-1 rounded-lg bg-rose-50 px-3 py-2.5 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">
            {err.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        )}
        {xml && (
          <>
            <p className="section-title mb-2">{labels.viewXml}</p>
            <pre className="max-h-[28rem] overflow-auto rounded-lg bg-ink-900 p-3 text-xxs leading-relaxed text-ink-100">
              {xml}
            </pre>
          </>
        )}
      </SlidePanel>

      <ShdOverlay open={saving} label={d.common.preparingFile} sublabel={`etax-${docNumber}.xml`} />
    </>
  );
}
