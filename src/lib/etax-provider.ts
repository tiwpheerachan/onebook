import 'server-only';
import { t } from '@/i18n/server';

/**
 * จุดเชื่อมต่อผู้ให้บริการ e-Tax Invoice
 *
 * กฎหมายไทยกำหนดว่าใบกำกับภาษีอิเล็กทรอนิกส์ต้องลงลายมือชื่อดิจิทัลด้วยใบรับรอง
 * จากผู้ให้บริการออกใบรับรอง (CA) ที่ได้รับการรับรอง และนำส่งกรมสรรพากรผ่าน
 * ผู้ให้บริการที่ ETDA รับรอง จึงลงลายมือชื่อเองในแอปไม่ได้
 *
 * ตั้งค่าใน .env.local เมื่อได้ข้อมูลจากผู้ให้บริการแล้ว
 *   ETAX_PROVIDER=<ชื่อผู้ให้บริการ>
 *   ETAX_API_URL=<ปลายทาง API>
 *   ETAX_API_KEY=<กุญแจ>
 *   ETAX_CERT_ID=<รหัสใบรับรองที่ผูกกับนิติบุคคล>
 */

export interface SignResult {
  ok: boolean;
  signed_xml?: string;
  provider_ref?: string;
  error?: string;
  /** true = ยังไม่ได้ตั้งค่าผู้ให้บริการ ไม่ใช่ความผิดพลาดของข้อมูล */
  not_configured?: boolean;
}

export function etaxConfig() {
  return {
    provider: process.env.ETAX_PROVIDER || '',
    url: process.env.ETAX_API_URL || '',
    key: process.env.ETAX_API_KEY || '',
    certId: process.env.ETAX_CERT_ID || '',
  };
}

export function isEtaxConfigured(): boolean {
  const c = etaxConfig();
  return !!(c.url && c.key);
}

/**
 * ส่ง XML ไปลงลายมือชื่อและนำส่งกรมสรรพากร
 * รูปแบบ request/response ต่างกันไปตามผู้ให้บริการ — ปรับ mapping ตรงนี้จุดเดียว
 */
export async function signAndSubmit(xml: string, docNumber: string): Promise<SignResult> {
  const c = etaxConfig();
  if (!isEtaxConfigured()) {
    return {
      ok: false,
      not_configured: true,
      error: t().ui.misc.etaxNotConfigured,
    };
  }

  try {
    const res = await fetch(`${c.url.replace(/\/$/, '')}/sign-and-submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${c.key}`,
      },
      body: JSON.stringify({ certificate_id: c.certId, document_number: docNumber, xml }),
      cache: 'no-store',
    });

    if (!res.ok) {
      return { ok: false, error: t().ui.misc.etaxProviderStatus.replace('{status}', String(res.status)).replace('{detail}', (await res.text()).slice(0, 300)) };
    }

    const data = (await res.json()) as any;
    return {
      ok: true,
      signed_xml: data.signed_xml || data.signedXml,
      provider_ref: data.reference || data.provider_ref || data.id,
    };
  } catch (e: any) {
    return { ok: false, error: t().ui.misc.etaxConnectFailed.replace('{detail}', String(e?.message || e)) };
  }
}
