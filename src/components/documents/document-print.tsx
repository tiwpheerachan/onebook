import { PRINT_FORM, copyLabel } from './print-meta';
import { bahtText } from '@/lib/baht-text';
import { money, thaiDate } from '@/lib/format';
import type { DocKind } from '@/lib/constants';

export interface PrintCompany {
  name_th: string;
  name_en?: string | null;
  legal_form?: string | null;
  tax_id?: string | null;
  branch_code?: string | null;
  branch_name?: string | null;
  address_th?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logo_url?: string | null;
  bank_name?: string | null;
  bank_account_name?: string | null;
  bank_account_no?: string | null;
  doc_footer_note?: string | null;
  authorized_signer?: string | null;
}

export interface PrintContact {
  name?: string | null;
  legal_name?: string | null;
  tax_id?: string | null;
  branch_code?: string | null;
  branch_name?: string | null;
  address?: string | null;
  district?: string | null;
  province?: string | null;
  postcode?: string | null;
  phone?: string | null;
  contact_person?: string | null;
}

export interface PrintLine {
  line_no: number;
  description: string;
  quantity: number;
  unit?: string | null;
  unit_price: number;
  discount_pct?: number;
  discount_amt?: number;
  line_amount: number;
}

export interface PrintDoc {
  kind: DocKind;
  doc_number: string;
  doc_date: string;
  due_date?: string | null;
  reference?: string | null;
  notes?: string | null;
  subtotal: number;
  discount_amount: number;
  vat_base: number;
  vat_amount: number;
  wht_amount: number;
  grand_total: number;
  net_payable: number;
  status: string;
}

/** ที่อยู่ผู้ติดต่อรวมเป็นบรรทัดเดียว ข้ามช่องที่ยังไม่ได้กรอก */
function contactAddress(c: PrintContact): string {
  return [c.address, c.district, c.province, c.postcode].filter(Boolean).join(' ');
}

function taxIdSpaced(id?: string | null): string {
  if (!id) return '-';
  const s = id.replace(/\D/g, '');
  if (s.length !== 13) return id;
  // รูปแบบที่กรมสรรพากรใช้ : 0-0000-00000-00-0
  return `${s[0]}-${s.slice(1, 5)}-${s.slice(5, 10)}-${s.slice(10, 12)}-${s[12]}`;
}

function branchText(code?: string | null, name?: string | null): string {
  if (!code || code === '00000') return 'สำนักงานใหญ่';
  return name ? `${name} (${code})` : `สาขา ${code}`;
}

const LINES_PER_PAGE = 12;

export function DocumentPrint({
  company, contact, doc, lines, copyNo, qrDataUrl,
}: {
  company: PrintCompany;
  contact: PrintContact;
  doc: PrintDoc;
  lines: PrintLine[];
  copyNo: number;
  /** QR พร้อมเพย์แบบ data URI (สร้างฝั่งเซิร์ฟเวอร์) */
  qrDataUrl?: string | null;
}) {
  const form = PRINT_FORM[doc.kind];
  const pages: PrintLine[][] = [];
  for (let i = 0; i < Math.max(1, lines.length); i += LINES_PER_PAGE) {
    pages.push(lines.slice(i, i + LINES_PER_PAGE));
  }

  return (
    <>
      {pages.map((pageLines, pi) => {
        const isLast = pi === pages.length - 1;
        return (
          <div key={pi} className="doc-sheet">
            {/* ─────────── หัวกระดาษ : ข้อมูลผู้ประกอบการ ─────────── */}
            <header className="flex items-start justify-between gap-6 border-b-2 border-ink-800 pb-3">
              <div className="flex min-w-0 items-start gap-3">
                {company.logo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={company.logo_url} alt="" className="h-16 w-16 shrink-0 object-contain" />
                )}
                <div className="min-w-0 leading-snug">
                  <p className="text-[13pt] font-bold text-ink-900">{company.name_th}</p>
                  {company.name_en && <p className="text-[8.5pt] text-ink-600">{company.name_en}</p>}
                  {company.address_th && <p className="mt-1 text-[8pt] leading-relaxed text-ink-700">{company.address_th}</p>}
                  <p className="text-[8pt] text-ink-700">
                    {company.phone && <>โทร. {company.phone} </>}
                    {company.email && <>· {company.email}</>}
                  </p>
                  <p className="text-[8pt] font-medium text-ink-800">
                    เลขประจำตัวผู้เสียภาษี {taxIdSpaced(company.tax_id)}
                    {' · '}
                    {branchText(company.branch_code, company.branch_name)}
                  </p>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-[16pt] font-bold leading-none text-ink-900">{form.th}</p>
                <p className="text-[8pt] tracking-widest text-ink-500">{form.en}</p>
                {form.isTaxDoc && (
                  <p className="mt-1.5 inline-block border border-ink-700 px-2 py-0.5 text-[8pt] font-bold text-ink-800">
                    {copyLabel(copyNo)}
                  </p>
                )}
                {doc.status === 'void' && (
                  <p className="mt-1 text-[11pt] font-bold text-rose-700">*** ยกเลิก ***</p>
                )}
              </div>
            </header>

            {/* ─────────── คู่ค้า + เลขที่/วันที่ ─────────── */}
            <section className="mt-3 flex gap-4 text-[8.5pt]">
              <div className="flex-1 border border-ink-300 p-2.5 leading-relaxed">
                <p className="mb-1 text-[7.5pt] font-semibold uppercase tracking-wide text-ink-500">
                  {form.side === 'sales' ? 'ลูกค้า / CUSTOMER' : 'ผู้ขาย / SUPPLIER'}
                </p>
                <p className="font-semibold text-ink-900">{contact.legal_name || contact.name || '-'}</p>
                <p className="text-ink-700">{contactAddress(contact) || '-'}</p>
                <p className="text-ink-700">
                  เลขประจำตัวผู้เสียภาษี {taxIdSpaced(contact.tax_id)} · {branchText(contact.branch_code, contact.branch_name)}
                </p>
                {(contact.contact_person || contact.phone) && (
                  <p className="text-ink-700">
                    {contact.contact_person && <>ผู้ติดต่อ {contact.contact_person} </>}
                    {contact.phone && <>โทร. {contact.phone}</>}
                  </p>
                )}
              </div>

              <table className="w-[52mm] shrink-0 self-start border border-ink-300 text-[8.5pt]">
                <tbody>
                  <tr className="border-b border-ink-200">
                    <th className="w-[20mm] bg-ink-50 px-2 py-1 text-left font-medium text-ink-600">เลขที่</th>
                    <td className="px-2 py-1 font-semibold text-ink-900">{doc.doc_number}</td>
                  </tr>
                  <tr className="border-b border-ink-200">
                    <th className="bg-ink-50 px-2 py-1 text-left font-medium text-ink-600">วันที่</th>
                    <td className="px-2 py-1">{thaiDate(doc.doc_date)}</td>
                  </tr>
                  {doc.due_date && (
                    <tr className="border-b border-ink-200">
                      <th className="bg-ink-50 px-2 py-1 text-left font-medium text-ink-600">ครบกำหนด</th>
                      <td className="px-2 py-1">{thaiDate(doc.due_date)}</td>
                    </tr>
                  )}
                  {doc.reference && (
                    <tr>
                      <th className="bg-ink-50 px-2 py-1 text-left font-medium text-ink-600">อ้างอิง</th>
                      <td className="px-2 py-1">{doc.reference}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>

            {/* ─────────── รายการสินค้า/บริการ ─────────── */}
            <table className="mt-3 w-full border-collapse text-[8.5pt]">
              <thead>
                <tr className="bg-ink-100">
                  <th className="w-[10mm] border border-ink-300 px-1.5 py-1.5 text-center font-semibold">ลำดับ</th>
                  <th className="border border-ink-300 px-2 py-1.5 text-left font-semibold">รายการ</th>
                  <th className="w-[16mm] border border-ink-300 px-1.5 py-1.5 text-right font-semibold">จำนวน</th>
                  <th className="w-[14mm] border border-ink-300 px-1.5 py-1.5 text-center font-semibold">หน่วย</th>
                  <th className="w-[22mm] border border-ink-300 px-1.5 py-1.5 text-right font-semibold">ราคา/หน่วย</th>
                  <th className="w-[18mm] border border-ink-300 px-1.5 py-1.5 text-right font-semibold">ส่วนลด</th>
                  <th className="w-[26mm] border border-ink-300 px-1.5 py-1.5 text-right font-semibold">จำนวนเงิน</th>
                </tr>
              </thead>
              <tbody>
                {pageLines.map((l) => {
                  const gross = Number(l.quantity) * Number(l.unit_price);
                  const disc = (Number(l.discount_amt) || 0) + gross * ((Number(l.discount_pct) || 0) / 100);
                  return (
                    <tr key={l.line_no} className="align-top">
                      <td className="border border-ink-300 px-1.5 py-1 text-center">{l.line_no}</td>
                      <td className="border border-ink-300 px-2 py-1 whitespace-pre-line">{l.description}</td>
                      <td className="border border-ink-300 px-1.5 py-1 text-right tabular-nums">{money(l.quantity, 2)}</td>
                      <td className="border border-ink-300 px-1.5 py-1 text-center">{l.unit || '-'}</td>
                      <td className="border border-ink-300 px-1.5 py-1 text-right tabular-nums">{money(l.unit_price)}</td>
                      <td className="border border-ink-300 px-1.5 py-1 text-right tabular-nums">{disc ? money(disc) : '-'}</td>
                      <td className="border border-ink-300 px-1.5 py-1 text-right tabular-nums">{money(l.line_amount)}</td>
                    </tr>
                  );
                })}
                {/* เติมแถวว่างให้ตารางเต็มหน้า กันไม่ให้มีการเขียนเพิ่มภายหลัง */}
                {Array.from({ length: Math.max(0, LINES_PER_PAGE - pageLines.length) }).map((_, i) => (
                  <tr key={`e${i}`}>
                    <td className="border border-ink-300 px-1.5 py-1">&nbsp;</td>
                    <td className="border border-ink-300" />
                    <td className="border border-ink-300" />
                    <td className="border border-ink-300" />
                    <td className="border border-ink-300" />
                    <td className="border border-ink-300" />
                    <td className="border border-ink-300" />
                  </tr>
                ))}
              </tbody>
            </table>

            {!isLast && (
              <p className="mt-2 text-right text-[8pt] text-ink-500">มีต่อหน้าถัดไป … (หน้า {pi + 1}/{pages.length})</p>
            )}

            {isLast && (
              <>
                {/* ─────────── ยอดรวม + จำนวนเงินตัวอักษร ─────────── */}
                <section className="mt-3 flex gap-4">
                  <div className="flex-1 space-y-2 text-[8.5pt]">
                    <div className="border border-ink-300 px-2.5 py-2">
                      <p className="text-[7.5pt] font-semibold uppercase tracking-wide text-ink-500">จำนวนเงินเป็นตัวอักษร</p>
                      <p className="mt-0.5 font-semibold text-ink-900">({bahtText(doc.grand_total)})</p>
                    </div>

                    {doc.notes && (
                      <div className="border border-ink-300 px-2.5 py-2">
                        <p className="text-[7.5pt] font-semibold uppercase tracking-wide text-ink-500">หมายเหตุ</p>
                        <p className="mt-0.5 whitespace-pre-line leading-relaxed text-ink-800">{doc.notes}</p>
                      </div>
                    )}

                    {form.showPayment && (company.bank_account_no || qrDataUrl) && (
                      <div className="flex items-start gap-3 border border-ink-300 px-2.5 py-2">
                        {qrDataUrl && (
                          <div className="shrink-0 pb-0.5 text-center">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={qrDataUrl} alt="PromptPay QR" className="h-[24mm] w-[24mm]" />
                            <p className="mt-1 text-[7pt] font-medium leading-none text-ink-700">สแกนจ่ายพร้อมเพย์</p>
                          </div>
                        )}
                        <div className="min-w-0 leading-relaxed">
                          <p className="text-[7.5pt] font-semibold uppercase tracking-wide text-ink-500">ช่องทางชำระเงิน</p>
                          {company.bank_name && <p className="text-ink-800">ธนาคาร{company.bank_name}</p>}
                          {company.bank_account_name && <p className="text-ink-800">ชื่อบัญชี {company.bank_account_name}</p>}
                          {company.bank_account_no && <p className="font-semibold text-ink-900">เลขที่บัญชี {company.bank_account_no}</p>}
                          <p className="mt-1 text-[7.5pt] text-ink-500">กรุณาชำระเงินภายในวันครบกำหนด และส่งหลักฐานการโอนกลับมาที่บริษัท</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <table className="w-[62mm] shrink-0 self-start border-collapse text-[8.5pt]">
                    <tbody>
                      <tr>
                        <th className="border border-ink-300 bg-ink-50 px-2 py-1 text-left font-medium">รวมเป็นเงิน</th>
                        <td className="w-[28mm] border border-ink-300 px-2 py-1 text-right tabular-nums">{money(doc.subtotal)}</td>
                      </tr>
                      {Number(doc.discount_amount) > 0 && (
                        <tr>
                          <th className="border border-ink-300 bg-ink-50 px-2 py-1 text-left font-medium">ส่วนลด</th>
                          <td className="border border-ink-300 px-2 py-1 text-right tabular-nums">{money(doc.discount_amount)}</td>
                        </tr>
                      )}
                      <tr>
                        <th className="border border-ink-300 bg-ink-50 px-2 py-1 text-left font-medium">มูลค่าที่คำนวณภาษี</th>
                        <td className="border border-ink-300 px-2 py-1 text-right tabular-nums">{money(doc.vat_base)}</td>
                      </tr>
                      <tr>
                        <th className="border border-ink-300 bg-ink-50 px-2 py-1 text-left font-medium">ภาษีมูลค่าเพิ่ม 7%</th>
                        <td className="border border-ink-300 px-2 py-1 text-right tabular-nums">{money(doc.vat_amount)}</td>
                      </tr>
                      <tr>
                        <th className="border border-ink-300 bg-ink-100 px-2 py-1 text-left font-bold">จำนวนเงินรวมทั้งสิ้น</th>
                        <td className="border border-ink-300 px-2 py-1 text-right font-bold tabular-nums">{money(doc.grand_total)}</td>
                      </tr>
                      {Number(doc.wht_amount) > 0 && (
                        <>
                          <tr>
                            <th className="border border-ink-300 bg-ink-50 px-2 py-1 text-left font-medium">หัก ณ ที่จ่าย</th>
                            <td className="border border-ink-300 px-2 py-1 text-right tabular-nums">({money(doc.wht_amount)})</td>
                          </tr>
                          <tr>
                            <th className="border border-ink-300 bg-ink-100 px-2 py-1 text-left font-bold">ยอดชำระสุทธิ</th>
                            <td className="border border-ink-300 px-2 py-1 text-right font-bold tabular-nums">{money(doc.net_payable)}</td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                </section>

                {/* ─────────── ช่องลงนาม ─────────── */}
                <section className="mt-6 grid grid-cols-3 gap-6 text-[8pt]">
                  {[
                    { label: form.signLeft, note: 'วันที่ ......../......../........' },
                    { label: 'ผู้จัดทำเอกสาร', note: 'วันที่ ......../......../........' },
                    { label: company.authorized_signer ? `ผู้มีอำนาจลงนาม\n(${company.authorized_signer})` : 'ผู้มีอำนาจลงนาม', note: 'ประทับตราบริษัท' },
                  ].map((s, i) => (
                    <div key={i} className="text-center">
                      <div className="h-[16mm]" />
                      <p className="border-t border-dotted border-ink-500 pt-1 whitespace-pre-line text-ink-800">{s.label}</p>
                      <p className="text-[7pt] text-ink-500">{s.note}</p>
                    </div>
                  ))}
                </section>
              </>
            )}

            <footer className="mt-auto border-t border-ink-200 pt-1.5 text-[7pt] text-ink-500">
              <div className="flex justify-between gap-4">
                <span>{company.doc_footer_note || `${company.name_th} · ${company.website || ''}`}</span>
                <span>หน้า {pi + 1} / {pages.length}</span>
              </div>
            </footer>
          </div>
        );
      })}
    </>
  );
}
