import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { PrintToolbar } from '@/components/documents/print-toolbar';
import { WHT_FORM_ROWS, formRowOf, PAY_CONDITIONS } from '@/lib/wht-form';
import { bahtText } from '@/lib/baht-text';
import { money, thaiDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

function taxIdBoxes(id?: string | null) {
  const s = (id || '').replace(/\D/g, '').padEnd(13, ' ').slice(0, 13);
  return (
    <span className="inline-flex gap-[1px]">
      {Array.from(s).map((c, i) => (
        <span key={i} className="inline-block w-[4.2mm] border border-ink-400 text-center text-[8pt] leading-[4.6mm]">
          {c.trim() || ' '}
        </span>
      ))}
    </span>
  );
}

function partyAddress(p: any): string {
  if (!p) return '';
  return [p.address, p.district, p.province, p.postcode].filter(Boolean).join(' ');
}

export default async function WhtCertPrintPage({ params }: { params: { id: string } }) {
  await requirePermission('tax', 'view');
  const supabase = createClient();

  const { data: cert } = await supabase
    .from('wht_certificates')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();
  if (!cert) notFound();

  const [{ data: lines }, { data: company }] = await Promise.all([
    supabase.from('wht_certificate_lines').select('*').eq('cert_id', params.id),
    supabase
      .from('companies')
      .select('name_th, tax_id, address_th, branch_code, branch_name, authorized_signer')
      .eq('id', cert.company_id)
      .maybeSingle(),
  ]);

  const payee: any = cert.payee_snapshot || {};

  // ยุบรายการของเราลงในช่องของแบบราชการ
  const byRow = new Map<string, { base: number; wht: number; date: string | null }>();
  for (const l of lines || []) {
    const row = formRowOf(l.wht_code);
    const cur = byRow.get(row) || { base: 0, wht: 0, date: null };
    cur.base += Number(l.base_amount || 0);
    cur.wht += Number(l.wht_amount || 0);
    cur.date = cur.date || l.pay_date;
    byRow.set(row, cur);
  }
  const totalBase = Number(cert.base_total || 0);
  const totalWht = Number(cert.wht_total || 0);

  return (
    <>
      <PrintToolbar documentId={cert.document_id || cert.id} docNumber={`50 ทวิ · ${cert.cert_number}`} />

      <div className="doc-sheet">
        <header className="text-center">
          <p className="text-[9pt] text-ink-600">ฉบับที่ 1 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)</p>
          <p className="mt-1 text-[14pt] font-bold text-ink-900">หนังสือรับรองการหักภาษี ณ ที่จ่าย</p>
          <p className="text-[8.5pt] text-ink-600">ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</p>
          <p className="mt-1 text-[8.5pt]">เล่มที่ / เลขที่ <b className="font-mono">{cert.cert_number}</b></p>
          {cert.status === 'cancelled' && (
            <p className="mt-1 text-[11pt] font-bold text-rose-700">*** ยกเลิก ***</p>
          )}
        </header>

        {/* ผู้มีหน้าที่หักภาษี ณ ที่จ่าย */}
        <section className="mt-3 border border-ink-400 p-2.5 text-[8.5pt] leading-relaxed">
          <p className="font-semibold">ผู้มีหน้าที่หักภาษี ณ ที่จ่าย</p>
          <p className="mt-0.5">
            <span className="text-ink-600">ชื่อ </span>{company?.name_th || '-'}
          </p>
          <p className="flex flex-wrap items-center gap-x-2">
            <span className="text-ink-600">เลขประจำตัวผู้เสียภาษีอากร</span>
            {taxIdBoxes(company?.tax_id)}
            <span className="text-ink-600">
              {company?.branch_code && company.branch_code !== '00000'
                ? `สาขา ${company.branch_code}`
                : 'สำนักงานใหญ่'}
            </span>
          </p>
          <p><span className="text-ink-600">ที่อยู่ </span>{company?.address_th || '-'}</p>
        </section>

        {/* ผู้ถูกหักภาษี ณ ที่จ่าย */}
        <section className="mt-2 border border-ink-400 p-2.5 text-[8.5pt] leading-relaxed">
          <p className="font-semibold">ผู้ถูกหักภาษี ณ ที่จ่าย</p>
          <p className="mt-0.5">
            <span className="text-ink-600">ชื่อ </span>{payee.legal_name || payee.name || '-'}
          </p>
          <p className="flex flex-wrap items-center gap-x-2">
            <span className="text-ink-600">เลขประจำตัวผู้เสียภาษีอากร</span>
            {taxIdBoxes(cert.tax_id || payee.tax_id)}
            <span className="text-ink-600">
              {payee.branch_code && payee.branch_code !== '00000' ? `สาขา ${payee.branch_code}` : 'สำนักงานใหญ่'}
            </span>
          </p>
          <p><span className="text-ink-600">ที่อยู่ </span>{partyAddress(payee) || '-'}</p>
        </section>

        <p className="mt-2 text-[8.5pt]">
          <span className="text-ink-600">ลำดับที่ </span>
          <b>{cert.cert_number}</b>
          <span className="ml-3 text-ink-600">ในแบบ </span>
          <b>{cert.pnd_form}</b>
        </p>

        {/* ตารางประเภทเงินได้ */}
        <table className="mt-2 w-full border-collapse text-[8pt]">
          <thead>
            <tr className="bg-ink-100">
              <th className="w-[10mm] border border-ink-400 px-1 py-1.5">ลำดับ</th>
              <th className="border border-ink-400 px-2 py-1.5 text-left">ประเภทเงินได้พึงประเมินที่จ่าย</th>
              <th className="w-[26mm] border border-ink-400 px-1 py-1.5">วัน เดือน ปี ที่จ่าย</th>
              <th className="w-[30mm] border border-ink-400 px-1 py-1.5">จำนวนเงินที่จ่าย</th>
              <th className="w-[30mm] border border-ink-400 px-1 py-1.5">ภาษีที่หักและนำส่งไว้</th>
            </tr>
          </thead>
          <tbody>
            {WHT_FORM_ROWS.map((r) => {
              const v = byRow.get(r.no);
              return (
                <tr key={r.no} className="align-top">
                  <td className="border border-ink-400 px-1 py-1 text-center">{r.no}</td>
                  <td className="border border-ink-400 px-2 py-1 leading-snug">{r.label}</td>
                  <td className="border border-ink-400 px-1 py-1 text-center">{v?.date ? thaiDate(v.date) : ''}</td>
                  <td className="border border-ink-400 px-1.5 py-1 text-right tabular-nums">{v ? money(v.base) : ''}</td>
                  <td className="border border-ink-400 px-1.5 py-1 text-right tabular-nums">{v ? money(v.wht) : ''}</td>
                </tr>
              );
            })}
            <tr className="bg-ink-50 font-semibold">
              <td className="border border-ink-400 px-1 py-1.5 text-center" colSpan={3}>
                รวมเงินที่จ่ายและภาษีที่หักนำส่ง
              </td>
              <td className="border border-ink-400 px-1.5 py-1.5 text-right tabular-nums">{money(totalBase)}</td>
              <td className="border border-ink-400 px-1.5 py-1.5 text-right tabular-nums">{money(totalWht)}</td>
            </tr>
          </tbody>
        </table>

        <p className="mt-1.5 border border-ink-400 px-2.5 py-1.5 text-[8.5pt]">
          <span className="text-ink-600">รวมเงินภาษีที่หักนำส่ง (ตัวอักษร) </span>
          <b>({bahtText(totalWht)})</b>
        </p>

        {/* เงื่อนไขการหักภาษี */}
        <section className="mt-2 border border-ink-400 px-2.5 py-2 text-[8.5pt]">
          <p className="mb-1 text-ink-600">ผู้จ่ายเงิน</p>
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            {[1, 2, 3, 4].map((c) => (
              <span key={c} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-[3.6mm] w-[3.6mm] border border-ink-500 text-center text-[8pt] leading-[3.4mm]">
                  {cert.condition_code === c ? '✓' : ' '}
                </span>
                ({c}) {PAY_CONDITIONS[c]}
              </span>
            ))}
          </div>
        </section>

        {/* ลงนาม */}
        <section className="mt-6 flex justify-end">
          <div className="w-[70mm] text-center text-[8.5pt]">
            <div className="h-[14mm]" />
            <p className="border-t border-dotted border-ink-500 pt-1">
              ผู้จ่ายเงิน
              {company?.authorized_signer && <><br />({company.authorized_signer})</>}
            </p>
            <p className="mt-1 text-ink-600">วันที่ {thaiDate(cert.cert_date)}</p>
            <p className="mt-3 text-[7.5pt] text-ink-400">ประทับตรานิติบุคคล (ถ้ามี)</p>
          </div>
        </section>

        <footer className="mt-auto border-t border-ink-300 pt-1.5 text-[7pt] leading-relaxed text-ink-500">
          <p>
            <b>คำเตือน</b> ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย
            ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร
          </p>
          <p className="mt-0.5">ออกโดยระบบ ONEBOOK · {cert.cert_number}</p>
        </footer>
      </div>
    </>
  );
}
