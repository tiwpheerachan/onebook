'use client';
import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, AlertTriangle } from 'lucide-react';
import { ShdSpinner, ShdOverlay } from '@/components/ui/shd-loader';
import { SlidePanel } from './slide-panel';
import { parseBankCsv, type BankLine, type ColumnMapping } from '@/lib/bank-csv';
import { importStatement } from '@/actions/reconcile';
import { useI18n } from '@/i18n/provider';

const fmt = (n: any) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const FIELDS: { key: keyof ColumnMapping; label: string }[] = [
  { key: 'date', label: 'วันที่' },
  { key: 'description', label: 'รายละเอียด' },
  { key: 'reference', label: 'อ้างอิง' },
  { key: 'deposit', label: 'เงินเข้า' },
  { key: 'withdrawal', label: 'เงินออก' },
  { key: 'amount', label: 'จำนวนเงิน (คอลัมน์เดียว)' },
  { key: 'balance', label: 'ยอดคงเหลือ' },
];

export function StatementImport({
  channelId,
  channelName,
  labels,
}: {
  channelId: string;
  channelName: string;
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Partial<ColumnMapping>>({});
  const [lines, setLines] = useState<BankLine[]>([]);
  const [warn, setWarn] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ matched: number; total: number } | null>(null);
  const [pending, start] = useTransition();
  const { dict: dd } = useI18n();

  function reparse(raw: string, override: Partial<ColumnMapping>) {
    const r = parseBankCsv(raw, override);
    setHeaders(r.headers);
    setLines(r.lines);
    setWarn(r.errors);
    return r;
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setErr(''); setDone(null);
    setFileName(f.name);
    const raw = await f.text();
    setText(raw);
    const r = reparse(raw, {});
    setMapping(r.mapping);
  }

  function setCol(key: keyof ColumnMapping, idx: number) {
    const next = { ...mapping, [key]: idx };
    setMapping(next);
    if (text) reparse(text, next);
  }

  function submit() {
    setErr('');
    start(async () => {
      const res = await importStatement({ channel_id: channelId, file_name: fileName, lines, auto_match: true });
      if (!res.ok) { setErr(res.error || ''); return; }
      setDone({ matched: res.matched || 0, total: lines.length });
      setLines([]); setText(''); setHeaders([]); setFileName('');
      if (fileRef.current) fileRef.current.value = '';
      router.refresh();
    });
  }

  const totalIn = lines.reduce((s, l) => s + l.deposit, 0);
  const totalOut = lines.reduce((s, l) => s + l.withdrawal, 0);

  return (
    <>
      <button className="btn-primary" onClick={() => { setOpen(true); setDone(null); setErr(''); }}>
        <Upload className="h-4 w-4" strokeWidth={1.8} /> {labels.import}
      </button>

      <SlidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={`${labels.import} · ${channelName}`}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setOpen(false)}>{labels.close}</button>
            <button className="btn-primary" disabled={pending || lines.length === 0} onClick={submit}>
              {pending && <ShdSpinner size={16} />} {labels.importCount.replace('{n}', String(lines.length))}
            </button>
          </div>
        }
      >
        {err && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}
        {done && (
          <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700 ring-1 ring-inset ring-emerald-200">
            {labels.imported.replace('{n}', String(done.total)).replace('{m}', String(done.matched))}
          </p>
        )}

        <label className="label">{labels.file}</label>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,text/csv"
          onChange={onFile}
          className="block w-full cursor-pointer rounded-lg border border-dashed border-ink-300 bg-ink-50 px-3 py-6 text-center text-sm text-ink-500 file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:border-brand-400"
        />
        <p className="mt-1.5 text-xxs text-ink-400">{labels.fileHint}</p>

        {warn.length > 0 && (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
            <span>{warn.join(' · ')}</span>
          </div>
        )}

        {headers.length > 0 && (
          <>
            <p className="section-title mt-5 mb-2">{labels.mapping}</p>
            <div className="grid grid-cols-2 gap-3">
              {FIELDS.map((f) => (
                <div key={f.key}>
                  <label className="label">{f.label}</label>
                  <select
                    className="input"
                    value={String(mapping[f.key] ?? -1)}
                    onChange={(e) => setCol(f.key, Number(e.target.value))}
                  >
                    <option value="-1">— {labels.notUsed} —</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>{h || `คอลัมน์ ${i + 1}`}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </>
        )}

        {lines.length > 0 && (
          <>
            <div className="mt-5 mb-2 flex items-baseline justify-between">
              <span className="section-title">{labels.preview}</span>
              <span className="text-xs text-ink-500">
                {labels.in} <b className="text-emerald-600">{fmt(totalIn)}</b> · {labels.out} <b className="text-rose-600">{fmt(totalOut)}</b>
              </span>
            </div>
            <div className="max-h-72 overflow-auto rounded-lg border border-ink-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-ink-50">
                  <tr>
                    <th className="th-cell">{labels.date}</th>
                    <th className="th-cell">{labels.description}</th>
                    <th className="th-cell num">{labels.in}</th>
                    <th className="th-cell num">{labels.out}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {lines.slice(0, 100).map((l) => (
                    <tr key={l.line_no}>
                      <td className="td-cell whitespace-nowrap">{l.txn_date}</td>
                      <td className="td-cell max-w-[16rem] truncate">{l.description}</td>
                      <td className="td-cell num text-emerald-600">{l.deposit ? fmt(l.deposit) : '—'}</td>
                      <td className="td-cell num text-rose-600">{l.withdrawal ? fmt(l.withdrawal) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {lines.length > 100 && <p className="mt-1.5 text-xxs text-ink-400">{labels.showingFirst.replace('{n}', String(lines.length))}</p>}
          </>
        )}
      </SlidePanel>

      <ShdOverlay open={pending} label={labels.import} sublabel={dd.common.pleaseWait} />
    </>
  );
}
