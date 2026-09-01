'use client';
import { useMemo, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Save, CheckCircle2, XCircle, Lock, CreditCard } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { calcDocument, calcLine, WHT_PRESETS, type VatTreatment } from '@/lib/tax';
import { money, bahtTextSafe } from '@/lib/ui-helpers';
import { saveDocument, approveDocument, voidDocument } from '@/actions/documents';
import { FxPanel, type FxState } from './fx-panel';

interface Option {
  id: string; label: string; sub?: string; price?: number; unit?: string;
  /** หน่วยบรรจุที่เลือกได้ พร้อมตัวคูณและราคาต่อหน่วยนั้น */
  units?: { code: string; factor: number; sale_price?: number; purchase_price?: number }[];
  /** ประเภทภาษีที่ผูกกับตัวสินค้าเอง เช่น สินค้ายกเว้นภาษีตามกฎหมาย */
  vat?: VatTreatment;
}

/**
 * ประเภทภาษีของเราปนสองเรื่องไว้ในช่องเดียว
 *   exclusive / inclusive  = "ราคาที่เสนอรวมภาษีหรือยัง" เป็นวิธีตั้งราคา
 *   zero_rated / exempt / none = "สินค้านี้เสียภาษีไหม" เป็นข้อเท็จจริงตามกฎหมาย
 *
 * ตัวหลังต้องมาจากตัวสินค้าเสมอและมีผลเหนือค่าที่ตั้งไว้ที่หัวเอกสาร
 * เพราะอาหารสดยกเว้นภาษีก็ยกเว้นเสมอ ไม่ว่าจะเสนอราคาแบบไหน
 */
const TAX_STATUS: VatTreatment[] = ['zero_rated', 'exempt', 'none'];

export interface EditorProps {
  slug: string;
  kind: string;
  section: 'sales' | 'purchase';
  title: string;
  contacts: Option[];
  products: Option[];
  accounts: Option[];
  /** แผนก — ระบุที่หัวเอกสารครั้งเดียว ฐานข้อมูลจะส่งต่อลงบรรทัดและสมุดรายวันเอง */
  dimensions: Option[];
  doc: any | null;
  lines: any[];
  /** ผู้ติดต่อตั้งต้นเมื่อเปิดจากหน้าผู้ติดต่อ */
  initialContactId?: string;
  perms: { create: boolean; edit: boolean; approve: boolean; void: boolean };
  lockedThrough: string | null;
  /** สถานะวงเงินของลูกค้า — null เมื่อไม่ได้ตั้งวงเงินหรือเอกสารไม่ก่อหนี้ */
  credit?: { name: string; credit_limit: number; outstanding: number; available: number } | null;
  labels: Record<string, string>;
}

interface Row {
  key: string;
  product_id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  discount_pct: number;
  vat_treatment: VatTreatment;
  vat_rate: number;
  wht_code: string;
  wht_rate: number;
  account_id: string;
}

/**
 * โครงคอลัมน์ของชั้นบน ใช้ร่วมกันระหว่างหัวตารางกับแถวข้อมูล
 * เพื่อให้ตรงกันเสมอแม้แก้ความกว้างทีหลัง
 *
 * ความกว้างรวมของคอลัมน์คงที่คือ 28+88+80+112+136+28 = 472px บวกช่องไฟอีก 72px
 * ที่เหลือทั้งหมดตกเป็นของช่องสินค้า จึงไม่มีทางกว้างเกินกรอบและไม่ต้องเลื่อนซ้ายขวา
 */
const LINE_GRID =
  'lg:grid lg:grid-cols-[1.75rem_minmax(0,1fr)_5.5rem_5rem_7rem_8.5rem_1.75rem]';

/**
 * ช่องกรอกหนึ่งช่องพร้อมป้ายกำกับ
 * ปกติป้ายจะโผล่เฉพาะจอแคบที่ไม่มีหัวตาราง ส่วน always ใช้กับชั้นล่างที่ไม่มีหัวตารางเลย
 */
function LineField(
  { label, children, align, always }:
  { label: string; children: ReactNode; align?: 'right'; always?: boolean }
) {
  return (
    <div className="min-w-0">
      <span className={
        'mb-1 block text-xxs font-medium text-ink-500 ' +
        (always ? '' : 'lg:hidden ') +
        (align === 'right' ? 'text-right' : '')
      }>{label}</span>
      {children}
    </div>
  );
}

const emptyRow = (vat: VatTreatment = 'exclusive'): Row => ({
  key: Math.random().toString(36).slice(2),
  product_id: '', description: '', quantity: 1, unit: '', unit_price: 0,
  discount_pct: 0, vat_treatment: vat, vat_rate: 7,
  wht_code: 'NONE', wht_rate: 0, account_id: '',
});

export function DocumentEditor(p: EditorProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const readOnly =
    !!p.doc && (['approved', 'paid', 'partial', 'void', 'closed'].includes(p.doc.status) || !p.perms.edit);
  const frozen = !!p.lockedThrough && !!p.doc && p.doc.doc_date <= p.lockedThrough;

  const [docDate, setDocDate] = useState<string>(p.doc?.doc_date || new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState<string>(p.doc?.due_date || '');
  const [contactId, setContactId] = useState<string>(p.doc?.contact_id || p.initialContactId || '');
  const [reference, setReference] = useState<string>(p.doc?.reference || '');
  const [notes, setNotes] = useState<string>(p.doc?.notes || '');
  const [description, setDescription] = useState<string>(p.doc?.description || '');
  const [dimensionId, setDimensionId] = useState<string>(p.doc?.dimension_id || '');
  const [headerDiscount, setHeaderDiscount] = useState<number>(0);
  const [rows, setRows] = useState<Row[]>(
    p.lines.length
      ? p.lines.map((l: any) => ({
          key: l.id,
          product_id: l.product_id || '',
          description: l.description || '',
          quantity: Number(l.quantity),
          unit: l.unit || '',
          unit_price: Number(l.unit_price),
          discount_pct: Number(l.discount_pct || 0),
          vat_treatment: l.vat_treatment,
          vat_rate: Number(l.vat_rate ?? 7),
          wht_code: l.wht_code || 'NONE',
          wht_rate: Number(l.wht_rate || 0),
          account_id: l.account_id || '',
        }))
      : [emptyRow()]
  );

  const totals = useMemo(() => calcDocument(rows as any, headerDiscount), [rows, headerDiscount]);

  // เงินตราต่างประเทศ — ยอดบาทยังเป็นตัวที่ลงบัญชี
  // ยอดต่างประเทศคำนวณย้อนจากยอดบาทหารด้วยอัตรา สองฝั่งจึงไม่มีทางหลุดจากกัน
  const [fx, setFx] = useState<FxState | null>(
    p.doc?.fx_currency
      ? {
          currency: p.doc.fx_currency,
          rate: Number(p.doc.fx_rate) || 0,
          rateDate: String(p.doc.fx_rate_date || p.doc.doc_date || '').slice(0, 10),
          source: p.doc.fx_rate_source || 'manual',
        }
      : null
  );

  // ประเภทราคาระดับเอกสารอ่านจากบรรทัดเสมอ ไม่เก็บซ้ำไว้อีกที่
  // เก็บสองที่แล้ววันหนึ่งจะไม่ตรงกันโดยไม่มีใครรู้ว่าอันไหนถูก
  const docVat: VatTreatment | 'mixed' = useMemo(() => {
    if (!rows.length) return 'exclusive';
    const first = rows[0].vat_treatment;
    return rows.every((r) => r.vat_treatment === first) ? first : 'mixed';
  }, [rows]);

  /** ตั้งประเภทราคาให้ทุกบรรทัดพร้อมกัน แบบที่ Express ทำ */
  function setAllVat(v: VatTreatment) {
    setRows((prev) => prev.map((r) => ({ ...r, vat_treatment: v })));
  }

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function onPickProduct(i: number, productId: string) {
    const prod = p.products.find((x) => x.id === productId);
    // สินค้าที่ยกเว้นภาษีหรืออัตราศูนย์ ต้องใช้ค่าของตัวสินค้าเสมอ
    // ส่วนสินค้าที่ตั้งเป็นแยกนอก/รวมใน ปล่อยให้ตามประเภทราคาของเอกสาร
    const legalStatus = prod?.vat && TAX_STATUS.includes(prod.vat) ? prod.vat : null;
    update(i, {
      product_id: productId,
      description: prod?.label || rows[i].description,
      unit_price: prod?.price ?? rows[i].unit_price,
      unit: prod?.unit || rows[i].unit,
      ...(legalStatus ? { vat_treatment: legalStatus } : {}),
    });
  }

  function onPickWht(i: number, code: string) {
    const preset = WHT_PRESETS.find((w) => w.code === code);
    update(i, { wht_code: code, wht_rate: preset?.rate ?? 0 });
  }

  function submit(thenApprove = false) {
    setMsg(null);
    if (!description.trim()) {
      setMsg({ type: 'err', text: p.labels.entryDescriptionRequired });
      return;
    }
    start(async () => {
      const res = await saveDocument({
        id: p.doc?.id || null,
        kind: p.kind,
        doc_date: docDate,
        due_date: dueDate || null,
        contact_id: contactId || null,
        dimension_id: dimensionId || null,
        description,
        reference,
        notes,
        discount_amount: headerDiscount,
        lines: rows.map((r) => ({
          product_id: r.product_id || null,
          description: r.description,
          quantity: Number(r.quantity) || 0,
          unit: r.unit,
          unit_price: Number(r.unit_price) || 0,
          discount_pct: Number(r.discount_pct) || 0,
          vat_treatment: r.vat_treatment,
          vat_rate: Number(r.vat_rate) || 0,
          wht_code: r.wht_code === 'NONE' ? null : r.wht_code,
          wht_rate: Number(r.wht_rate) || 0,
          account_id: r.account_id || null,
        })),
        fx: fx && fx.rate > 0
          ? {
              currency: fx.currency,
              rate: fx.rate,
              rate_date: fx.rateDate,
              source: fx.source,
              subtotal: Math.round((totals.subtotal / fx.rate) * 100) / 100,
              grand_total: Math.round((totals.grand_total / fx.rate) * 100) / 100,
            }
          : null,
      });
      if (!res.ok) { setMsg({ type: 'err', text: res.error || '' }); return; }
      if (thenApprove) {
        const ap = await approveDocument(res.id as string);
        if (!ap.ok) { setMsg({ type: 'err', text: ap.error || '' }); return; }
      }
      router.push(`/${p.section}/${p.slug}/${res.id}`);
      router.refresh();
    });
  }

  function doApprove() {
    start(async () => {
      const res = await approveDocument(p.doc.id);
      if (!res.ok) setMsg({ type: 'err', text: res.error || '' });
      else router.refresh();
    });
  }

  function doVoid() {
    const reason = window.prompt(p.labels.voidReason || '');
    if (reason === null) return;
    start(async () => {
      const res = await voidDocument(p.doc.id, reason);
      if (!res.ok) setMsg({ type: 'err', text: res.error || '' });
      else router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {msg && (
        <div className={msg.type === 'ok'
          ? 'rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-200'
          : 'rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200'}>
          {msg.text}
        </div>
      )}
      {frozen && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
          <Lock className="h-4 w-4" /> {p.labels.frozen}
        </div>
      )}

      {/* วงเงินเครดิต — เตือนตั้งแต่เปิดเอกสาร ไม่ใช่ตอนกดอนุมัติแล้วโดนปฏิเสธ */}
      {p.credit && (() => {
        const over = p.credit.available < 0;
        const near = !over && p.credit.available <= p.credit.credit_limit * 0.2;
        return (
          <div className={
            'flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg px-4 py-3 text-sm ring-1 ring-inset ' +
            (over ? 'bg-rose-50 text-rose-800 ring-rose-200'
                  : near ? 'bg-amber-50 text-amber-800 ring-amber-200'
                         : 'bg-ink-50 text-ink-700 ring-ink-200')
          }>
            <span className="flex items-center gap-2 font-medium">
              <CreditCard className="h-4 w-4 shrink-0" strokeWidth={1.8} />
              {over ? p.labels.creditOver : near ? p.labels.creditNear : p.credit.name}
            </span>
            <span>{p.labels.creditLimit} <b className="tabular-nums">{money(p.credit.credit_limit)}</b></span>
            <span>{p.labels.creditOutstanding} <b className="tabular-nums">{money(p.credit.outstanding)}</b></span>
            <span>{p.labels.creditAvailable} <b className="tabular-nums">{money(p.credit.available)}</b></span>
            {over && <span className="w-full text-xxs opacity-80">{p.labels.creditOverrideHint}</span>}
          </div>
        );
      })()}

      {/* ---------- ส่วนหัวเอกสาร ---------- */}
      <div className="card card-pad">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="label">{p.labels.contact}</label>
            <select className="input" value={contactId} disabled={readOnly}
                    onChange={(e) => setContactId(e.target.value)}>
              <option value="">— {p.labels.select} —</option>
              {p.contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.label}{c.sub ? ` (${c.sub})` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{p.labels.docDate}</label>
            <input type="date" className="input" value={docDate} disabled={readOnly}
                   onChange={(e) => setDocDate(e.target.value)} />
          </div>
          <div>
            <label className="label">{p.labels.dueDate}</label>
            <input type="date" className="input" value={dueDate} disabled={readOnly}
                   onChange={(e) => setDueDate(e.target.value)} />
          </div>
          {/* คำอธิบายรายการบันทึกบัญชี — ข้อความนี้ไปเป็นคำอธิบายในสมุดรายวัน
              คนละหน้าที่กับหมายเหตุซึ่งเป็นบันทึกภายในและไม่ลงบัญชี */}
          <div className="md:col-span-4">
            <label className="label">
              {p.labels.entryDescription} <span className="text-rose-600">*</span>
            </label>
            <input
              className={'input' + (!description.trim() && !readOnly ? ' border-rose-300' : '')}
              value={description}
              disabled={readOnly}
              placeholder={p.labels.entryDescriptionHint}
              onChange={(e) => setDescription(e.target.value)}
            />
            <p className="mt-1 text-xxs text-ink-400">{p.labels.entryDescriptionHint}</p>
          </div>
          {/* ประเภทราคาระดับเอกสาร — เลือกครั้งเดียวแล้วทุกบรรทัดตามทันที
            * แบบเดียวกับช่องประเภทราคาของ Express ที่คีย์บิลสิบบรรทัดได้เร็วกว่ามาก
            * ยังแก้รายบรรทัดทับได้ พอต่างกันช่องนี้จะขึ้นว่าผสม */}
          <div className="md:col-span-2">
            <label className="label">{p.labels.priceType}</label>
            <select
              className="input"
              value={docVat}
              disabled={readOnly}
              onChange={(e) => setAllVat(e.target.value as VatTreatment)}
            >
              {docVat === 'mixed' && <option value="mixed">{p.labels.vatMixed}</option>}
              <option value="exclusive">{p.labels.exclusive}</option>
              <option value="inclusive">{p.labels.inclusive}</option>
              <option value="zero_rated">{p.labels.zeroRated}</option>
              <option value="exempt">{p.labels.exempt}</option>
              <option value="none">{p.labels.none}</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label">{p.labels.reference}</label>
            <input className="input" value={reference} disabled={readOnly}
                   onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="label">{p.labels.notes}</label>
            <input className="input" value={notes} disabled={readOnly}
                   onChange={(e) => setNotes(e.target.value)} />
          </div>
          {/* ซ่อนทั้งช่องเมื่อบริษัทยังไม่ได้ตั้งแผนก จะได้ไม่รกสำหรับกิจการที่ไม่ใช้ */}
          {p.dimensions.length > 0 && (
            <div className="md:col-span-2">
              <label className="label">{p.labels.dimension}</label>
              <select className="input" value={dimensionId} disabled={readOnly}
                      onChange={(e) => setDimensionId(e.target.value)}>
                <option value="">— {p.labels.noDimension} —</option>
                {p.dimensions.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ---------- รายการ ----------
          เดิมเป็นตาราง 9 คอลัมน์ที่กว้างเกินพื้นที่จริงเสมอ เบราว์เซอร์จึงบีบช่องจนซ้อนกัน
          เปลี่ยนเป็นตารางแบบ grid ที่แบ่งเป็นสองชั้น
            ชั้นบน  = ข้อมูลที่ต้องเห็นทุกครั้ง (สินค้า จำนวน หน่วย ราคา ยอด)
            ชั้นล่าง = ข้อมูลที่ตั้งครั้งเดียวแล้วแทบไม่แก้ (บัญชี ส่วนลด ภาษี หัก ณ ที่จ่าย)
          จอแคบจะเรียงลงมาเป็นบล็อกพร้อมป้ายกำกับ ไม่ต้องเลื่อนซ้ายขวาและไม่ซ้อนกันทุกความกว้าง */}
      <div className="card overflow-hidden">
        {/* หัวคอลัมน์ของชั้นบน — ซ่อนบนจอแคบเพราะแต่ละช่องมีป้ายกำกับในตัวแล้ว */}
        <div className={'hidden bg-ink-50 px-4 py-2.5 text-xs font-medium text-ink-500 lg:gap-3 ' + LINE_GRID}>
          <div>#</div>
          <div>{p.labels.product}</div>
          <div className="text-right">{p.labels.quantity}</div>
          <div>{p.labels.unit}</div>
          <div className="text-right">{p.labels.unitPrice}</div>
          <div className="text-right">{p.labels.subtotal}</div>
          <div />
        </div>

        <div className="divide-y divide-ink-100">
          {rows.map((r, i) => {
            const calc = calcLine(r as any);
            const removable = !readOnly && rows.length > 1;
            return (
              <div key={r.key} className="px-4 py-3">
                <div className={'grid grid-cols-1 gap-2 lg:items-start lg:gap-3 ' + LINE_GRID}>
                  <div className="hidden pt-2.5 text-sm tabular-nums text-ink-400 lg:block">{i + 1}</div>

                  {/* สินค้า + รายละเอียด */}
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center justify-between lg:hidden">
                      <span className="text-xxs font-semibold text-ink-400">#{i + 1}</span>
                      {removable && (
                        <button type="button" onClick={() => setRows(rows.filter((_, x) => x !== i))}
                                aria-label={p.labels.removeLine}
                                className="rounded p-1 text-ink-400 hover:bg-rose-50 hover:text-rose-600">
                          <Trash2 className="h-4 w-4" strokeWidth={1.8} />
                        </button>
                      )}
                    </div>
                    <select className="input text-xs" value={r.product_id} disabled={readOnly}
                            onChange={(e) => onPickProduct(i, e.target.value)}>
                      <option value="">— {p.labels.freeText} —</option>
                      {p.products.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                    </select>
                    <input className="input" placeholder={p.labels.description} value={r.description}
                           disabled={readOnly} onChange={(e) => update(i, { description: e.target.value })} />
                  </div>

                  {/* จอแคบเรียงสามช่องนี้เป็นแถวเดียว จอกว้าง lg:contents ทำให้กลับไปอยู่ในคอลัมน์ของตัวเอง */}
                  <div className="grid grid-cols-3 gap-2 lg:contents">
                    <LineField label={p.labels.quantity} align="right">
                      <input type="number" step="0.0001" className="input num" value={r.quantity} disabled={readOnly}
                             onChange={(e) => update(i, { quantity: Number(e.target.value) })} />
                    </LineField>
                    <LineField label={p.labels.unit}>
                      {/* สินค้าที่ตั้งหน่วยบรรจุไว้จะได้ตัวเลือก ส่วนบรรทัดอิสระยังพิมพ์เองได้
                        * เปลี่ยนหน่วยแล้วราคาต่อหน่วยปรับตามให้ เพราะราคาต่อลังกับต่อชิ้นไม่เท่ากัน */}
                      {(() => {
                        const prod = p.products.find((x) => x.id === r.product_id);
                        const opts = prod?.units || [];
                        if (opts.length < 2) {
                          return (
                            <input className="input" value={r.unit} disabled={readOnly}
                                   onChange={(e) => update(i, { unit: e.target.value })} />
                          );
                        }
                        return (
                          <select className="input" value={r.unit} disabled={readOnly}
                                  onChange={(e) => {
                                    const u = opts.find((x) => x.code === e.target.value);
                                    const price = p.section === 'sales' ? u?.sale_price : u?.purchase_price;
                                    update(i, { unit: e.target.value, ...(price != null ? { unit_price: price } : {}) });
                                  }}>
                            {opts.map((u) => <option key={u.code} value={u.code}>{u.code}</option>)}
                          </select>
                        );
                      })()}
                    </LineField>
                    <LineField label={p.labels.unitPrice} align="right">
                      <input type="number" step="0.0001" className="input num" value={r.unit_price} disabled={readOnly}
                             onChange={(e) => update(i, { unit_price: Number(e.target.value) })} />
                    </LineField>
                  </div>

                  {/* ยอดของรายการ */}
                  <div className="flex items-baseline justify-between border-t border-ink-100 pt-2 lg:block lg:border-0 lg:pt-2.5 lg:text-right">
                    <span className="text-xxs font-medium text-ink-500 lg:hidden">{p.labels.subtotal}</span>
                    <div>
                      <div className="text-sm font-medium tabular-nums text-ink-900">{money(calc.line_amount)}</div>
                      {calc.vat_amount > 0 && <div className="text-xxs tabular-nums text-ink-400">VAT {money(calc.vat_amount)}</div>}
                      {calc.wht_amount > 0 && <div className="text-xxs tabular-nums text-amber-600">WHT {money(calc.wht_amount)}</div>}
                    </div>
                  </div>

                  <div className="hidden pt-2 lg:block">
                    {removable && (
                      <button type="button" onClick={() => setRows(rows.filter((_, x) => x !== i))}
                              aria-label={p.labels.removeLine}
                              className="rounded p-1 text-ink-400 hover:bg-rose-50 hover:text-rose-600">
                        <Trash2 className="h-4 w-4" strokeWidth={1.8} />
                      </button>
                    )}
                  </div>
                </div>

                {/* ชั้นล่าง : ค่าที่ตั้งแล้วแทบไม่แก้ — มีป้ายกำกับเสมอเพราะไม่มีหัวคอลัมน์ */}
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 lg:pl-[2.5rem]">
                  <LineField label={p.labels.account} always>
                    <select className="input text-xs" value={r.account_id} disabled={readOnly}
                            onChange={(e) => update(i, { account_id: e.target.value })}>
                      <option value="">— {p.labels.auto} —</option>
                      {p.accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                    </select>
                  </LineField>
                  <LineField label={`${p.labels.discount} %`} always>
                    <input type="number" step="0.01" className="input num" value={r.discount_pct} disabled={readOnly}
                           onChange={(e) => update(i, { discount_pct: Number(e.target.value) })} />
                  </LineField>
                  <LineField label={p.labels.vatType} always>
                    <select className="input text-xs" value={r.vat_treatment} disabled={readOnly}
                            onChange={(e) => update(i, { vat_treatment: e.target.value as VatTreatment })}>
                      <option value="exclusive">{p.labels.exclusive}</option>
                      <option value="inclusive">{p.labels.inclusive}</option>
                      <option value="zero_rated">{p.labels.zeroRated}</option>
                      <option value="exempt">{p.labels.exempt}</option>
                      <option value="none">{p.labels.none}</option>
                    </select>
                  </LineField>
                  <LineField label={p.labels.whtType} always>
                    <select className="input text-xs" value={r.wht_code} disabled={readOnly}
                            onChange={(e) => onPickWht(i, e.target.value)}>
                      {WHT_PRESETS.map((w) => (
                        <option key={w.code} value={w.code}>{w.label}{w.rate ? ` ${w.rate}%` : ''}</option>
                      ))}
                    </select>
                  </LineField>
                </div>
              </div>
            );
          })}
        </div>
        {!readOnly && (
          <div className="border-t border-ink-200 px-4 py-3">
            <button type="button" onClick={() => setRows([...rows, emptyRow(docVat === 'mixed' ? 'exclusive' : docVat)])} className="btn-ghost text-brand-700">
              <Plus className="h-4 w-4" /> {p.labels.addLine}
            </button>
          </div>
        )}
      </div>

      {/* ---------- สรุปยอด ---------- */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="card card-pad lg:col-span-2">
          <p className="section-title mb-2">{p.labels.entryDescription}</p>
          <p className="mb-4 text-sm text-ink-800">{description || '—'}</p>
          <p className="section-title mb-2">{p.labels.amountInWords}</p>
          <p className="text-sm text-ink-700">{bahtTextSafe(totals.net_payable)}</p>
        </div>
        <div className="card card-pad">
          <dl className="space-y-2 text-sm">
            <Row2 label={p.labels.subtotal} value={money(totals.subtotal)} />
            <Row2 label={p.labels.discount} value={money(totals.discount_amount)} />
            <Row2 label={p.labels.vatBase} value={money(totals.vat_base)} />
            <Row2 label={p.labels.vat} value={money(totals.vat_amount)} />
            <div className="border-t border-ink-200 pt-2">
              <Row2 label={p.labels.grandTotal} value={money(totals.grand_total)} bold />
            </div>
            {totals.wht_amount > 0 && (
              <>
                <Row2 label={p.labels.wht} value={'-' + money(totals.wht_amount)} tone="amber" />
                <div className="border-t border-ink-200 pt-2">
                  <Row2 label={p.labels.netPayable} value={money(totals.net_payable)} bold />
                </div>
              </>
            )}
          </dl>
        </div>
      </div>

      {/* เงินตราต่างประเทศ แสดงเฉพาะฝั่งซื้อ เพราะขายในประเทศเป็นบาททั้งหมด */}
      {p.section === 'purchase' && (
        <FxPanel
          value={fx}
          onChange={setFx}
          bahtTotal={totals.grand_total}
          readOnly={readOnly}
          docDate={docDate}
        />
      )}

      {/* ---------- ปุ่มดำเนินการ ---------- */}
      <div className="no-print flex flex-wrap items-center gap-2">
        {!readOnly && (
          <>
            <button type="button" disabled={pending} onClick={() => submit(false)} className="btn-primary">
              {pending ? <ShdSpinner size={16} /> : <Save className="h-4 w-4" />}
              {p.labels.save}
            </button>
            {p.perms.approve && (
              <button type="button" disabled={pending} onClick={() => submit(true)} className="btn-secondary">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> {p.labels.saveAndApprove}
              </button>
            )}
          </>
        )}
        {p.doc && p.doc.status === 'draft' && p.perms.approve && (
          <button type="button" disabled={pending} onClick={doApprove} className="btn-primary">
            <CheckCircle2 className="h-4 w-4" /> {p.labels.approve}
          </button>
        )}
        {p.doc && p.doc.status !== 'void' && p.perms.void && (
          <button type="button" disabled={pending} onClick={doVoid} className="btn-danger">
            <XCircle className="h-4 w-4" /> {p.labels.void}
          </button>
        )}
      </div>
    </div>
  );
}

function Row2({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={bold ? 'font-medium text-ink-800' : 'text-ink-500'}>{label}</dt>
      <dd className={
        'tabular-nums ' +
        (bold ? 'text-base font-semibold text-ink-900 ' : 'text-ink-800 ') +
        (tone === 'amber' ? 'text-amber-600' : '')
      }>{value}</dd>
    </div>
  );
}
