import QRCode from 'qrcode';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';
import { PrintButton } from '@/components/ui/print-button';

export const dynamic = 'force-dynamic';

// ป้ายทรัพย์สินสำหรับพิมพ์ (70×35 มม.) — QR ชี้ไปหน้าสแกนสาธารณะ /scan/{id}
// อยู่หลัง auth (เจ้าหน้าที่พิมพ์) ส่วนหน้าที่ QR ชี้ไปเปิดสาธารณะได้
export default async function AssetLabelPage({ params }: { params: { id: string } }) {
  const d = t();
  const supabase = createClient();
  const { data } = await supabase.rpc('rpt_asset_public', { p_id: params.id });
  const a = Array.isArray(data) ? data[0] : null;
  if (!a) return <div className="p-8 text-sm">{d.ui.scan.notFound}</div>;

  const origin = (process.env.APP_ORIGIN || '').replace(/\/+$/, '');
  const url = `${origin}/scan/${params.id}`;
  const qrSvg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });

  return (
    <div className="mx-auto max-w-2xl px-4">
      <div className="no-print mb-4 flex items-center gap-3">
        <h1 className="text-[16px] font-semibold text-ink-800">{d.assets.printLabel}</h1>
        <span className="font-mono text-[13px] text-ink-400">{a.code}</span>
        <div className="ml-auto"><PrintButton label={d.common.print} /></div>
      </div>

      <div
        className="flex items-stretch gap-3 rounded border border-ink-400 bg-white p-[3mm]"
        style={{ width: '70mm', height: '35mm' }}
      >
        <div
          className="flex shrink-0 items-center [&>svg]:h-[27mm] [&>svg]:w-[27mm]"
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
        <div className="flex min-w-0 flex-1 flex-col justify-between py-[0.5mm]">
          <div>
            <div className="text-[7pt] uppercase tracking-wide text-ink-400">{d.ui.scan.title}</div>
            <div className="truncate text-[8pt] font-semibold leading-tight text-ink-900">{a.company_name}</div>
          </div>
          <div className="font-mono text-[11pt] font-bold leading-none tracking-tight text-ink-900">{a.code}</div>
          <div className="line-clamp-2 text-[7.5pt] leading-tight text-ink-700">{a.name}</div>
          <div className="text-[6pt] text-ink-400">{d.ui.scan.scanHint}</div>
        </div>
      </div>
    </div>
  );
}
