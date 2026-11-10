'use client';

import { useState, useTransition } from 'react';
import { CalendarClock, FileText, Wallet, Tags, Copy, Globe } from 'lucide-react';
import { saveDocSettings } from '@/actions/settings';

type S = Record<string, any>;

export default function DocSettingsForm({ initial, hasColumn }: { initial: S; hasColumn: boolean }) {
  const [s, setS] = useState<S>({
    credit_term_days: 30,
    doc_note_invoice: '', doc_note_receipt: '', doc_note_quotation: '',
    show_payment_info: true,
    dup_name_policy: 'warn',
    public_doc: false, tax_request_link: false,
    ...initial,
    // price_types อาจเก็บเป็น array — แปลงเป็น string สำหรับช่องกรอก
    price_types: Array.isArray(initial.price_types) ? initial.price_types.join(', ') : (initial.price_types ?? 'ราคาปลีก, ราคาส่ง'),
  });
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const set = (k: string, v: any) => { setS((f) => ({ ...f, [k]: v })); setSaved(false); };

  const submit = () => {
    setErr('');
    const payload = { ...s, price_types: String(s.price_types || '').split(',').map((x: string) => x.trim()).filter(Boolean) };
    start(async () => {
      const res = await saveDocSettings(payload);
      if (!res.ok) { setErr(res.error || 'บันทึกไม่สำเร็จ'); return; }
      setSaved(true);
    });
  };

  const Section = ({ icon: Icon, title, hint, children }: { icon: any; title: string; hint?: string; children: React.ReactNode }) => (
    <div className="card mb-4 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Icon size={15} /></span>
        <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
      </div>
      <div className="space-y-3 p-4">
        {hint && <p className="text-xs text-ink-400">{hint}</p>}
        {children}
      </div>
    </div>
  );

  return (
    <>
      {!hasColumn && <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">ยังไม่ได้เพิ่มคอลัมน์ settings ในฐานข้อมูล — รัน migration ก่อน (ดูคำแนะนำจากแอดมิน) จึงจะบันทึกได้</div>}
      {err && <div className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
      {saved && <div className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">บันทึกการตั้งค่าแล้ว</div>}

      <Section icon={CalendarClock} title="วันที่ครบกำหนด (เครดิตเทอม)" hint="จำนวนวันเครดิตเริ่มต้นสำหรับเอกสารใหม่ (ใช้คำนวณวันครบกำหนดอัตโนมัติ)">
        <div className="flex items-center gap-2">
          <input type="number" min={0} max={365} className="input w-28" value={s.credit_term_days} onChange={(e) => set('credit_term_days', Number(e.target.value))} />
          <span className="text-sm text-ink-500">วัน หลังวันที่ออกเอกสาร</span>
        </div>
      </Section>

      <Section icon={FileText} title="หมายเหตุเอกสาร (ข้อความท้ายเริ่มต้น)" hint="ข้อความที่จะใส่ท้ายเอกสารแต่ละประเภทโดยอัตโนมัติ">
        <div><label className="label">ใบแจ้งหนี้</label><input className="input" value={s.doc_note_invoice} onChange={(e) => set('doc_note_invoice', e.target.value)} placeholder="เช่น กรุณาชำระภายในกำหนด…" /></div>
        <div><label className="label">ใบเสร็จรับเงิน</label><input className="input" value={s.doc_note_receipt} onChange={(e) => set('doc_note_receipt', e.target.value)} /></div>
        <div><label className="label">ใบเสนอราคา</label><input className="input" value={s.doc_note_quotation} onChange={(e) => set('doc_note_quotation', e.target.value)} /></div>
      </Section>

      <Section icon={Wallet} title="ช่องทางการรับชำระเงิน">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" className="h-4 w-4 rounded border-ink-300 text-brand-600" checked={!!s.show_payment_info} onChange={(e) => set('show_payment_info', e.target.checked)} />
          แสดงข้อมูลบัญชีธนาคาร / พร้อมเพย์ (จากข้อมูลกิจการ) บนเอกสาร
        </label>
      </Section>

      <Section icon={Tags} title="ประเภทราคา" hint="ตั้งชื่อระดับราคา คั่นด้วยคอมมา (เช่น ราคาปลีก, ราคาส่ง, ราคาตัวแทน)">
        <input className="input" value={s.price_types} onChange={(e) => set('price_types', e.target.value)} />
      </Section>

      <Section icon={Copy} title="การสร้างชื่อซ้ำ" hint="เมื่อสร้างผู้ติดต่อ/สินค้าที่ชื่อซ้ำกับที่มีอยู่">
        <select className="input w-56" value={s.dup_name_policy} onChange={(e) => set('dup_name_policy', e.target.value)}>
          <option value="allow">อนุญาตให้ซ้ำได้</option>
          <option value="warn">เตือน แต่สร้างได้</option>
          <option value="block">บล็อก ไม่ให้ซ้ำ</option>
        </select>
      </Section>

      <Section icon={Globe} title="การแสดงข้อมูลสาธารณะ / ใบกำกับภาษี">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" className="h-4 w-4 rounded border-ink-300 text-brand-600" checked={!!s.public_doc} onChange={(e) => set('public_doc', e.target.checked)} />
          เปิดให้ลูกค้าเปิดดูเอกสารผ่านลิงก์สาธารณะ
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" className="h-4 w-4 rounded border-ink-300 text-brand-600" checked={!!s.tax_request_link} onChange={(e) => set('tax_request_link', e.target.checked)} />
          แสดงลิงก์ให้ลูกค้าขอใบกำกับภาษีเต็มรูปบนเอกสาร
        </label>
      </Section>

      <div className="flex justify-end">
        <button className="btn-primary" disabled={pending || !hasColumn} onClick={submit}>{pending ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า'}</button>
      </div>
    </>
  );
}
