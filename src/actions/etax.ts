'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext, can } from '@/lib/session';
import { buildEtaxXml, validateEtax, hashXml, ETAX_TYPE_BY_KIND, type EtaxInput } from '@/lib/etax';
import { signAndSubmit, isEtaxConfigured } from '@/lib/etax-provider';

export interface Res {
  ok: boolean;
  error?: string;
  errors?: string[];
  id?: string;
  xml?: string;
  status?: string;
  notConfigured?: boolean;
}

/** ประกอบข้อมูลเอกสารจากฐานข้อมูลให้อยู่ในรูปแบบที่ ETDA ต้องการ */
async function loadEtaxInput(companyId: string, documentId: string): Promise<{ input?: EtaxInput; error?: string }> {
  const supabase = createClient();

  const [{ data: doc }, { data: company }] = await Promise.all([
    supabase
      .from('documents')
      .select('id, kind, doc_number, doc_date, subtotal, vat_amount, grand_total, reference, contact_id, contact_snapshot, company_id')
      .eq('id', documentId)
      .eq('company_id', companyId)
      .maybeSingle(),
    supabase
      .from('companies')
      .select('name_th, tax_id, branch_code, address_th, email, phone')
      .eq('id', companyId)
      .maybeSingle(),
  ]);

  if (!doc) return { error: 'ไม่พบเอกสาร' };
  if (!company) return { error: 'ไม่พบข้อมูลบริษัท' };

  const [{ data: lines }, { data: contact }] = await Promise.all([
    supabase
      .from('document_lines')
      .select('line_no, description, quantity, unit, unit_price, line_amount, vat_rate, vat_amount')
      .eq('document_id', documentId)
      .order('line_no'),
    doc.contact_id
      ? supabase
          .from('contacts')
          .select('name, tax_id, branch_code, address, postcode, email')
          .eq('id', doc.contact_id)
          .maybeSingle()
      : Promise.resolve({ data: null as any }),
  ]);

  const snap = (doc.contact_snapshot || {}) as any;

  return {
    input: {
      doc_type_code: ETAX_TYPE_BY_KIND[doc.kind] || '388',
      doc_number: doc.doc_number,
      doc_date: doc.doc_date,
      reference_number: doc.reference || null,
      reference_date: null,
      seller: {
        name: (company as any).name_th,
        tax_id: (company as any).tax_id || '',
        branch_code: (company as any).branch_code || '00000',
        address: (company as any).address_th || '',
        postcode: null,
        email: (company as any).email || null,
        phone: (company as any).phone || null,
      },
      buyer: {
        name: contact?.name || snap.name || '',
        tax_id: contact?.tax_id || snap.tax_id || null,
        branch_code: contact?.branch_code || snap.branch_code || null,
        address: contact?.address || snap.address || null,
        postcode: contact?.postcode || null,
        email: contact?.email || null,
      },
      lines: (lines || []).map((l: any) => ({
        line_no: l.line_no,
        description: l.description,
        quantity: Number(l.quantity),
        unit: l.unit,
        unit_price: Number(l.unit_price),
        line_amount: Number(l.line_amount),
        vat_rate: Number(l.vat_rate),
        vat_amount: Number(l.vat_amount),
      })),
      subtotal: Number(doc.subtotal),
      vat_amount: Number(doc.vat_amount),
      grand_total: Number(doc.grand_total),
      currency: 'THB',
    },
  };
}

/** สร้างไฟล์ XML และเก็บไว้ (ยังไม่ส่งกรมสรรพากร) */
export async function prepareEtax(documentId: string): Promise<Res> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'tax.etax', 'create')) return { ok: false, error: 'คุณไม่มีสิทธิ์จัดทำ e-Tax Invoice' };

  const { input, error } = await loadEtaxInput(ctx.company.id, documentId);
  if (!input) return { ok: false, error };

  const errs = validateEtax(input);
  if (errs.length) return { ok: false, error: 'ข้อมูลยังไม่ครบตามที่กรมสรรพากรกำหนด', errors: errs };

  const xml = buildEtaxXml(input);
  const hash = await hashXml(xml);
  const supabase = createClient();

  const { data, error: e } = await supabase
    .from('etax_documents')
    .upsert(
      {
        company_id: ctx.company.id,
        document_id: documentId,
        doc_type_code: input.doc_type_code,
        status: 'draft',
        xml_payload: xml,
        xml_hash: hash,
        created_by: ctx.userId,
      },
      { onConflict: 'document_id' }
    )
    .select('id')
    .maybeSingle();

  if (e) return { ok: false, error: e.message };

  revalidatePath('/tax/etax');
  return { ok: true, id: data?.id, xml, status: 'draft' };
}

/** ส่งไปลงลายมือชื่อและนำส่งกรมสรรพากรผ่านผู้ให้บริการ */
export async function submitEtax(etaxId: string): Promise<Res> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'tax.etax', 'approve')) return { ok: false, error: 'คุณไม่มีสิทธิ์นำส่ง e-Tax Invoice' };

  const supabase = createClient();
  const { data: row } = await supabase
    .from('etax_documents')
    .select('id, xml_payload, status, document_id, documents(doc_number)')
    .eq('id', etaxId)
    .eq('company_id', ctx.company.id)
    .maybeSingle();

  if (!row) return { ok: false, error: 'ไม่พบรายการ e-Tax' };
  if (!row.xml_payload) return { ok: false, error: 'ยังไม่ได้สร้างไฟล์ XML' };
  if (row.status === 'accepted') return { ok: false, error: 'เอกสารนี้นำส่งสำเร็จแล้ว' };

  if (!isEtaxConfigured()) {
    return {
      ok: false,
      notConfigured: true,
      error:
        'ยังไม่ได้ตั้งค่าผู้ให้บริการ e-Tax Invoice — ต้องมีใบรับรองดิจิทัลจาก CA และผู้ให้บริการที่ ETDA รับรอง ' +
        'จากนั้นตั้งค่า ETAX_API_URL / ETAX_API_KEY / ETAX_CERT_ID ใน .env.local',
    };
  }

  const docNumber = (row as any).documents?.doc_number || '';
  const res = await signAndSubmit(row.xml_payload, docNumber);

  await supabase
    .from('etax_documents')
    .update(
      res.ok
        ? {
            status: 'submitted',
            signed_xml: res.signed_xml || null,
            provider_ref: res.provider_ref || null,
            provider: process.env.ETAX_PROVIDER || null,
            submitted_at: new Date().toISOString(),
            error_message: null,
          }
        : { status: 'rejected', error_message: res.error || 'ส่งไม่สำเร็จ' }
    )
    .eq('id', etaxId);

  revalidatePath('/tax/etax');
  return res.ok ? { ok: true, status: 'submitted' } : { ok: false, error: res.error };
}
