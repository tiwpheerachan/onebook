'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, CheckCircle2, AlertTriangle, FileDown } from 'lucide-react';
import { ShdSpinner, ShdOverlay } from '@/components/ui/shd-loader';
import { splitCsvLine } from '@/lib/bank-csv';
import { IMPORT_SETS, guessMapping, type ImportSet } from '@/lib/import-map';
import { importRows, type ImportResult } from '@/actions/data-import';

const PREVIEW_ROWS = 8;

/**
 * นำเข้าข้อมูลหลักจากไฟล์ CSV — อ่านหัวตาราง เดาคอลัมน์ให้ ตรวจตัวอย่างก่อนบันทึกจริง
 * (Excel สั่ง "บันทึกเป็น CSV UTF-8" แล้วนำเข้าที่นี่ได้เลย)
 */
export function DataImport({ allowed }: { allowed: Record<string, boolean> }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [set, setSet] = useState<ImportSet>(IMPORT_SETS[0]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [fileName, setFileName] = useState('');
  const [err, setErr] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, start] = useTransition();

  function reset() {
    setHeaders([]); setRows([]); setMapping({}); setFileName(''); setResult(null); setErr('');
    if (inputRef.current) inputRef.current.value = '';
  }

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(''); setResult(null);

    const text = await file.text();
    // ตัด BOM ที่ Excel ใส่มา ไม่งั้นหัวคอลัมน์แรกจะจับคู่ไม่ตรง
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lines.length < 2) { setErr('ไฟล์ต้องมีบรรทัดหัวตารางและข้อมูลอย่างน้อย 1 แถว'); return; }

    const head = splitCsvLine(lines[0]);
    const body = lines.slice(1).map(splitCsvLine);
    setHeaders(head);
    setRows(body);
    setMapping(guessMapping(head, set));
    setFileName(file.name);
  }

  function changeSet(key: string) {
    const s = IMPORT_SETS.find((x) => x.key === key)!;
    setSet(s);
    setResult(null);
    if (headers.length) setMapping(guessMapping(headers, s));
  }

  function submit() {
    setErr(''); setResult(null);
    const missing = set.fields.filter((f) => f.required && mapping[f.key] == null);
    if (missing.length) {
      setErr(`ยังไม่ได้จับคู่ช่องที่จำเป็น : ${missing.map((m) => m.label).join(' · ')}`);
      return;
    }
    const payload = rows.map((r) => {
      const o: Record<string, string> = {};
      for (const f of set.fields) {
        const idx = mapping[f.key];
        if (idx != null) o[f.key] = r[idx] ?? '';
      }
      return o;
    });
    start(async () => {
      const res = await importRows(set.key, payload);
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  /** ไฟล์ตัวอย่างให้ผู้ใช้กรอกตามหัวตารางที่ระบบรู้จักแน่นอน */
  function template() {
    const head = set.fields.map((f) => f.label).join(',');
    const blob = new Blob(['﻿' + head + '\r\n'], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `template-${set.key}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const canImport = allowed[set.key] !== false;

  return (
    <div className="space-y-5">
      <div className="card card-pad">
        <label className="label">ชุดข้อมูลที่ต้องการนำเข้า</label>
        <div className="grid gap-3 sm:grid-cols-3">
          {IMPORT_SETS.map((s) => (
            <button
              key={s.key}
              onClick={() => changeSet(s.key)}
              disabled={allowed[s.key] === false}
              className={`rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                set.key === s.key
                  ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100'
                  : 'border-ink-200 hover:border-brand-300'
              }`}
            >
              <p className="text-sm font-medium text-ink-900">{s.label}</p>
              <p className="mt-1 text-xxs leading-relaxed text-ink-500">{s.description}</p>
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={pick} />
          <button className="btn-primary" disabled={!canImport} onClick={() => inputRef.current?.click()}>
            <Upload className="h-4 w-4" strokeWidth={1.8} /> เลือกไฟล์ CSV
          </button>
          <button className="btn-secondary" onClick={template}>
            <FileDown className="h-4 w-4 text-ink-400" strokeWidth={1.8} /> ดาวน์โหลดไฟล์ตัวอย่าง
          </button>
          {fileName && <span className="text-xs text-ink-500">{fileName} · {rows.length} แถว</span>}
          {fileName && <button className="btn-ghost text-xs" onClick={reset}>ล้าง</button>}
        </div>

        {!canImport && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
            คุณไม่มีสิทธิ์นำเข้าข้อมูลชุดนี้
          </p>
        )}
        <p className="mt-3 text-xxs leading-relaxed text-ink-400">
          จาก Excel เลือก <b>บันทึกเป็น → CSV UTF-8 (คั่นด้วยเครื่องหมายจุลภาค)</b> เพื่อให้ภาษาไทยไม่เพี้ยน ·
          รหัสที่มีอยู่แล้วจะถูกอัปเดตทับ ไม่สร้างซ้ำ
        </p>
      </div>

      {err && (
        <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>
      )}

      {headers.length > 0 && (
        <>
          <div className="card">
            <div className="border-b border-ink-200 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-ink-900">จับคู่คอลัมน์</h2>
              <p className="mt-0.5 text-xs text-ink-500">ระบบเดาให้จากหัวตารางแล้ว ตรวจและแก้ได้ตามต้องการ</p>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
              {set.fields.map((f) => (
                <div key={f.key}>
                  <label className="label">
                    {f.label}
                    {f.required && <span className="ml-1 text-rose-600">*</span>}
                  </label>
                  <select
                    className="input"
                    value={mapping[f.key] ?? ''}
                    onChange={(e) =>
                      setMapping((m) => {
                        const next = { ...m };
                        if (e.target.value === '') delete next[f.key];
                        else next[f.key] = Number(e.target.value);
                        return next;
                      })
                    }
                  >
                    <option value="">— ไม่ใช้ —</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h || `คอลัมน์ ${i + 1}`}</option>)}
                  </select>
                  {f.hint && <p className="mt-1 text-xxs text-ink-400">{f.hint}</p>}
                </div>
              ))}
            </div>
          </div>

          <div className="card overflow-x-auto">
            <div className="border-b border-ink-200 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-ink-900">ตัวอย่างข้อมูลที่จะนำเข้า</h2>
              <p className="mt-0.5 text-xs text-ink-500">
                แสดง {Math.min(PREVIEW_ROWS, rows.length)} แถวแรกจากทั้งหมด {rows.length} แถว
              </p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-ink-50">
                  {set.fields.filter((f) => mapping[f.key] != null).map((f) => (
                    <th key={f.key} className="th-cell">{f.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.slice(0, PREVIEW_ROWS).map((r, i) => (
                  <tr key={i}>
                    {set.fields.filter((f) => mapping[f.key] != null).map((f) => (
                      <td key={f.key} className="td-cell">{r[mapping[f.key]] || '–'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end gap-2 border-t border-ink-200 px-5 py-3.5">
              <button className="btn-primary" disabled={pending || !canImport} onClick={submit}>
                {pending && <ShdSpinner size={16} />} นำเข้า {rows.length} แถว
              </button>
            </div>
          </div>
        </>
      )}

      {result && (
        <div className="card card-pad">
          {result.ok ? (
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
              นำเข้าสำเร็จ {result.inserted} แถว
            </p>
          ) : (
            <p className="flex items-center gap-2 text-sm font-medium text-rose-700">
              <AlertTriangle className="h-4 w-4" strokeWidth={2} />
              {result.error}
            </p>
          )}

          {result.failed && result.failed.length > 0 && (
            <>
              <p className="mt-3 text-xs font-medium text-amber-700">
                ข้าม {result.failed.length} แถวที่ข้อมูลไม่ถูกต้อง
              </p>
              <ul className="mt-1.5 max-h-56 space-y-1 overflow-auto text-xxs text-ink-600">
                {result.failed.map((f, i) => (
                  <li key={i}>แถวที่ {f.row} : {f.error}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <ShdOverlay open={pending} label="กำลังนำเข้าข้อมูล…" sublabel={`${rows.length} แถว`} />
    </div>
  );
}
