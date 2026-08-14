import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { DocumentPrint } from '@/components/documents/document-print';
import { PrintToolbar } from '@/components/documents/print-toolbar';
import { PRINT_FORM } from '@/components/documents/print-meta';
import { buildPromptPayPayload } from '@/lib/promptpay';
import { isValidThaiTaxId } from '@/lib/format';

export const dynamic = 'force-dynamic';

const COMPANY_FIELDS =
  'name_th, name_en, legal_form, tax_id, branch_code, branch_name, address_th, phone, email, website, ' +
  'logo_url, promptpay_id, promptpay_type, bank_name, bank_account_name, bank_account_no, doc_footer_note, authorized_signer';

/** ตรวจว่าข้อมูลครบตามที่ประมวลรัษฎากรกำหนดสำหรับใบกำกับภาษีหรือยัง */
function completenessWarning(company: any, contact: any, isTaxDoc: boolean): string | null {
  const missing: string[] = [];
  if (!company.tax_id) missing.push('เลขประจำตัวผู้เสียภาษีของบริษัท');
  else if (!isValidThaiTaxId(company.tax_id)) missing.push('เลขประจำตัวผู้เสียภาษีของบริษัทไม่ถูกต้อง');
  if (!company.address_th) missing.push('ที่อยู่บริษัท');
  if (isTaxDoc && !contact?.tax_id) missing.push('เลขประจำตัวผู้เสียภาษีของลูกค้า');
  if (isTaxDoc && !contact?.address) missing.push('ที่อยู่ลูกค้า');
  if (!missing.length) return null;
  return `ยังไม่ครบตามที่กรมสรรพากรกำหนด : ${missing.join(' · ')} — แก้ไขได้ที่ตั้งค่าบริษัท / ข้อมูลผู้ติดต่อ`;
}

export default async function PrintPage({ params }: { params: { id: string } }) {
  const ctx = await requirePermission('documents', 'view');
  const supabase = createClient();

  const { data: doc } = await supabase.from('documents').select('*').eq('id', params.id).maybeSingle();
  if (!doc) notFound();

  const [{ data: lines }, { data: company }, { data: prints }] = await Promise.all([
    supabase.from('document_lines').select('*').eq('document_id', params.id).order('line_no'),
    supabase.from('companies').select(COMPANY_FIELDS).eq('id', doc.company_id).maybeSingle(),
    supabase.from('document_prints').select('copy_no').eq('document_id', params.id).order('copy_no', { ascending: false }).limit(1),
  ]);
  if (!company) notFound();

  // ใช้ข้อมูลผู้ติดต่อ ณ วันออกเอกสารเป็นหลัก เพื่อไม่ให้เอกสารเก่าเปลี่ยนไปเมื่อลูกค้าย้ายที่อยู่
  let contact: any = doc.contact_snapshot || null;
  if (!contact && doc.contact_id) {
    const { data } = await supabase
      .from('contacts')
      .select('name, legal_name, tax_id, branch_code, branch_name, address, district, province, postcode, phone, contact_person')
      .eq('id', doc.contact_id)
      .maybeSingle();
    contact = data;
  }
  contact = contact || {};

  const form = PRINT_FORM[doc.kind as keyof typeof PRINT_FORM];
  const nextCopy = Number(prints?.[0]?.copy_no || 0) + 1;

  // ── QR พร้อมเพย์ : สร้างเฉพาะเอกสารที่ใช้เรียกเก็บเงินและตั้งค่าหมายเลขไว้แล้ว ──
  let qrDataUrl: string | null = null;
  const owing = Number(doc.net_payable ?? doc.grand_total) - Number(doc.paid_amount || 0);
  if (form?.showPayment && (company as any).promptpay_id && doc.status !== 'void' && owing > 0) {
    try {
      const payload = buildPromptPayPayload({
        id: (company as any).promptpay_id,
        idType: (company as any).promptpay_type || undefined,
        amount: owing,
        merchantName: (company as any).name_en || (company as any).name_th,
      });
      qrDataUrl = await QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 0, width: 320 });
    } catch {
      // หมายเลขพร้อมเพย์ไม่ถูกต้อง : ข้าม QR ไป เอกสารส่วนอื่นยังพิมพ์ได้ตามปกติ
      qrDataUrl = null;
    }
  }

  return (
    <>
      <PrintToolbar
        documentId={doc.id}
        docNumber={`${form?.th || ''} ${doc.doc_number}`}
        warning={completenessWarning(company, contact, !!form?.isTaxDoc)}
      />
      <DocumentPrint
        company={company as any}
        contact={contact}
        doc={doc as any}
        lines={(lines || []) as any}
        copyNo={nextCopy}
        qrDataUrl={qrDataUrl}
      />
    </>
  );
}
