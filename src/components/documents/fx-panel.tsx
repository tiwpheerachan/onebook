'use client';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { RefreshCw, Globe } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { useI18n } from '@/i18n/provider';
import { money } from '@/lib/format';
import { cn } from '@/lib/cn';
import { getExchangeRate, saveManualRate } from '@/actions/fx';

/** สกุลที่ใช้บ่อยในการนำเข้า เพิ่มได้ภายหลังโดยไม่กระทบฐานข้อมูล */
const CURRENCIES = ['CNY', 'USD', 'EUR', 'JPY', 'SGD', 'MYR', 'KRW', 'GBP', 'AUD', 'HKD', 'TWD'];

export interface FxState {
  currency: string;
  rate: number;
  rateDate: string;
  source: string;
}

/**
 * ยอดเงินตราต่างประเทศบนเอกสารซื้อ
 *
 * กรอกยอดตามใบของผู้ขาย เลือกวันที่ของอัตรา แล้วระบบคิดยอดบาทให้
 * ยอดบาทคือตัวที่ลงบัญชีจริง ยอดต่างประเทศเก็บไว้กำกับเพื่อกระทบกับใบผู้ขาย
 */
export function FxPanel({
  value, onChange, bahtTotal, readOnly, docDate,
}: {
  value: FxState | null;
  onChange: (v: FxState | null) => void;
  /** ยอดรวมเป็นเงินบาทที่คำนวณจากบรรทัดแล้ว */
  bahtTotal: number;
  readOnly: boolean;
  docDate: string;
}) {
  const { dict: d } = useI18n();
  const L = d.ui.fx;
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [hint, setHint] = useState('');
  const [pending, start] = useTransition();

  const cur = value?.currency || '';
  const rate = Number(value?.rate || 0);
  const rateDate = value?.rateDate || docDate;
  const foreign = rate > 0 ? bahtTotal / rate : 0;

  const setField = (patch: Partial<FxState>) => {
    if (!value) return;
    onChange({ ...value, ...patch });
  };

  /** วันที่ที่ผู้ใช้พิมพ์อัตราเอง ใช้กันไม่ให้การดึงอัตโนมัติไปทับของที่กรอกไว้ */
  const typedFor = useRef<string | null>(null);
  /** คู่ (สกุล, วันที่) ที่ดึงไปแล้ว กันไม่ให้ยิงซ้ำเมื่อคอมโพเนนต์ re-render */
  const fetchedFor = useRef('');

  const pull = useCallback((currency: string, date: string) => {
    start(async () => {
      setErr(''); setMsg('');
      const res = await getExchangeRate(currency, date);
      // ยังไม่ได้ตั้งค่า token ไม่ใช่ความผิดของคนคีย์เอกสาร บอกเป็นคำแนะนำสีเทา
      // ไม่ใช่กล่องแดง เพราะการดึงอัตโนมัติจะเด้งข้อความนี้ทุกครั้งที่เลือกสกุลเงิน
      if (!res.ok) {
        if (res.notConfigured) setHint(res.error || ''); else setErr(res.error || '');
        return;
      }
      setHint('');
      // วันหยุดจะได้อัตราของวันทำการก่อนหน้ากลับมา ซึ่งทำให้ rateDate เปลี่ยน
      // ต้องจดวันที่ใหม่ไว้ด้วย ไม่งั้น effect จะเห็นเป็นคู่ใหม่แล้วยิงซ้ำอีกรอบ
      fetchedFor.current = `${currency}|${res.rateDate || date}`;
      setField({
        rate: Number(res.rate), rateDate: res.rateDate || date,
        source: res.source || 'bot',
      });
      setMsg((res.exact ? L.fetched : L.fetchedFallback)
        .replace('{date}', String(res.rateDate))
        .replace('{rate}', String(res.rate)));
    });
    // setField อ่านจาก value ของ render ปัจจุบัน จึงต้องผูก value ไว้ด้วย
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, L]);

  /**
   * ดึงอัตราให้เองทันทีที่เลือกสกุลเงินหรือเปลี่ยนวันที่
   *
   * ผู้ใช้ไม่ต้องกดอะไร แต่ถ้าพิมพ์อัตราเองไว้สำหรับวันนั้นแล้ว จะไม่ไปทับให้
   * เพราะบางใบผู้ขายระบุอัตราที่ตกลงกันไว้เอง ซึ่งไม่ตรงกับ ธปท.
   */
  useEffect(() => {
    if (!cur || readOnly) return;
    const key = `${cur}|${rateDate}`;
    if (fetchedFor.current === key) return;
    if (typedFor.current === rateDate) return;
    fetchedFor.current = key;
    pull(cur, rateDate);
    // pull เปลี่ยนทุก render ตาม value จึงไม่ใส่ในรายการ ไม่งั้นจะวนไม่จบ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, rateDate, readOnly]);

  return (
    <section className="card mt-5 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-5 py-3">
        <Globe className="h-4 w-4 text-ink-400" strokeWidth={1.8} />
        <h2 className="text-sm font-semibold text-ink-900">{L.panelTitle}</h2>
        <select
          className="input ml-auto w-auto py-1 text-xs"
          value={cur}
          disabled={readOnly}
          onChange={(e) =>
            onChange(e.target.value
              ? { currency: e.target.value, rate: 0, rateDate: docDate, source: 'manual' }
              : null)}
        >
          <option value="">{L.none}</option>
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {value && (
        <div className="px-5 py-4">
          {err && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-700 ring-1 ring-inset ring-rose-200">{err}</p>}
          {msg && <p className="mb-3 text-xs text-emerald-700">{msg}</p>}
          {hint && <p className="mb-3 rounded-lg bg-ink-50 px-3 py-2 text-xxs leading-relaxed text-ink-500">{hint}</p>}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">{L.rateDate}</label>
              <input type="date" className="input" value={rateDate} disabled={readOnly}
                     onChange={(e) => setField({ rateDate: e.target.value })} />
            </div>
            <div>
              <label className="label flex items-center gap-2">
                {L.rate} *
                {pending && (
                  <span className="flex items-center gap-1 font-normal text-ink-400">
                    <ShdSpinner size={12} /> {L.autoFetching}
                  </span>
                )}
              </label>
              <input type="number" step="0.000001" min={0} className="input num"
                     value={value.rate || ''} disabled={readOnly}
                     onChange={(e) => {
                       typedFor.current = rateDate;
                       setField({ rate: Number(e.target.value), source: 'manual' });
                     }} />
            </div>
          </div>

          <p className="mt-1 flex flex-wrap items-center gap-2 text-xxs leading-relaxed text-ink-400">
            <span>{L.rateHint}</span>
            {!readOnly && (
              <button type="button" disabled={pending}
                      className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-brand-600 disabled:opacity-50"
                      onClick={() => { typedFor.current = null; pull(cur, rateDate); }}>
                <RefreshCw className="h-3 w-3" strokeWidth={1.8} />{L.refetch}
              </button>
            )}
          </p>

          {/* ยอดตามใบผู้ขายคำนวณย้อนจากยอดบาท เพื่อให้สองฝั่งตรงกันเสมอ
            * ผู้ใช้คีย์ราคาต่อหน่วยเป็นบาทตามที่แปลงแล้ว จึงไม่มีทางที่สองยอดจะหลุดจากกัน */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-ink-50 px-3.5 py-2.5">
              <p className="text-xxs text-ink-500">{L.foreignTotal}</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-ink-900">
                {money(foreign)} <span className="text-xs font-normal text-ink-400">{cur}</span>
              </p>
            </div>
            <div className="rounded-lg bg-brand-50 px-3.5 py-2.5">
              <p className="text-xxs text-brand-700">{L.bahtTotal}</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-brand-800">
                {money(bahtTotal)}
              </p>
            </div>
          </div>

          <p className="mt-3 flex flex-wrap items-center gap-2 text-xxs text-ink-400">
            <span>{L.source}</span>
            <span className={cn('chip',
              value.source === 'bot' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                                     : 'bg-ink-100 text-ink-600 ring-ink-200')}>
              {value.source === 'bot' ? L.sourceBot : L.sourceManual}
            </span>
            {!readOnly && value.source === 'manual' && rate > 0 && (
              <button type="button" className="underline underline-offset-2 hover:text-brand-600"
                      onClick={() => start(async () => {
                        setErr(''); setMsg('');
                        const res = await saveManualRate(cur, rateDate, rate);
                        if (!res.ok) { setErr(res.error || ''); return; }
                        setMsg(L.savedManual);
                      })}>
                {L.savedManual}
              </button>
            )}
          </p>

          <p className="mt-3 text-xxs leading-relaxed text-ink-400">{L.ledgerNote}</p>
        </div>
      )}
    </section>
  );
}
