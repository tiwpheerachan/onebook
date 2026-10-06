import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { localeDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

// หน้าสแกน QR ของทรัพย์สิน — เปิดดูได้โดยไม่ต้องล็อกอิน (ดู middleware PUBLIC_PATHS)
// ดึงผ่าน rpt_asset_public (security definer) จึงได้เฉพาะข้อมูลระบุตัว ไม่มีราคาทุน/ค่าเสื่อม
export default async function AssetScanPage({ params }: { params: { id: string } }) {
  const d = t();
  const locale = currentLocale();
  const supabase = createClient();
  const { data } = await supabase.rpc('rpt_asset_public', { p_id: params.id });
  const a = Array.isArray(data) ? data[0] : null;

  if (!a) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center">
        <div className="text-[15px] font-semibold text-ink-800">{d.ui.scan.notFound}</div>
        <div className="text-[13px] text-ink-400">{d.ui.scan.notFoundHint}</div>
      </div>
    );
  }

  const statusLabel = (d.assets.status as any)[a.status] || a.status;
  const rows: { label: string; value: string }[] = [
    { label: d.assets.category, value: a.category || '—' },
    { label: d.assets.serialNo, value: a.serial_no || '—' },
    { label: d.assets.location, value: a.location || '—' },
    { label: d.ui.scan.supplier, value: a.supplier_name || '—' },
    { label: d.assets.inServiceDate, value: a.in_service_date ? localeDate(a.in_service_date, locale) : '—' },
  ];

  return (
    <div className="min-h-screen bg-ink-50 px-4 py-6">
      <div className="mx-auto max-w-md">
        <div className="mb-3 text-center">
          <div className="text-[13px] font-semibold text-ink-700">ONEBOOK</div>
          <div className="text-[11.5px] text-ink-400">{a.company_name}</div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
          <div className="bg-brand-600 px-5 py-5 text-white">
            <div className="text-[11px] uppercase tracking-wide text-white/70">{d.ui.scan.title}</div>
            <div className="mt-1 font-mono text-[20px] font-bold tracking-tight">{a.code}</div>
            <div className="mt-1 text-[15px] font-medium leading-snug">
              {locale === 'en' && a.name_en ? a.name_en : a.name}
            </div>
            <div className="mt-3 inline-block rounded-full bg-white/15 px-2.5 py-0.5 text-[12px] font-medium">
              {statusLabel}
            </div>
          </div>
          <dl className="divide-y divide-ink-100">
            {rows.map((r) => (
              <div key={r.label} className="flex items-start gap-3 px-5 py-3">
                <dt className="w-28 shrink-0 text-[12.5px] text-ink-400">{r.label}</dt>
                <dd className="min-w-0 flex-1 text-[13.5px] text-ink-800">{r.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="mt-3 text-center text-[11px] text-ink-400">{d.ui.scan.footer}</p>
      </div>
    </div>
  );
}
