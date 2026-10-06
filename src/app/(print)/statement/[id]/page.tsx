import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { PrintButton } from '@/components/ui/print-button';
import { t, currentLocale } from '@/i18n/server';
import { docKindLabel } from '@/lib/search-meta';
import { money, localeDate, toDateStr, firstDayOfYear } from '@/lib/format';

export const dynamic = 'force-dynamic';

interface Row {
  date: string; type: string; kind: string; number: string;
  due_date: string | null; side: 'ar' | 'ap' | 'none';
  outstanding: number; is_ledger: boolean; delta: number; balance: number;
}

/**
 * ใบแจ้งยอดคงค้างสำหรับส่งคู่ค้า
 *
 * ต่างจากหน้าแฟ้มตรงที่ตัดทุกอย่างที่เป็นมุมมองภายในออก — ไม่มีตัวกรอง
 * ไม่มีวงเงินเครดิต ไม่มีหมายเหตุภายใน เหลือเฉพาะสิ่งที่คู่ค้าต้องเห็น
 * เพื่อกระทบยอดกับบัญชีฝั่งเขา
 *
 * เอกสารที่ยังไม่เป็นหนี้ (ใบเสนอราคา ใบสั่ง) ถูกตัดออกทั้งหมด
 * เพราะใบแจ้งยอดต้องบวกลบแล้วลงตัวพอดี ไม่ใช่ไทม์ไลน์ความสัมพันธ์
 */
export default async function StatementPrintPage({
  params, searchParams,
}: {
  params: { id: string };
  searchParams: { from?: string; to?: string; side?: string };
}) {
  const ctx = await requirePermission('contacts', 'view');
  const d = t();
  const L = d.ui.contactFile;
  const locale = currentLocale();
  const supabase = createClient();

  const to = searchParams.to || toDateStr(new Date());
  const from = searchParams.from || firstDayOfYear(new Date(to));
  const side = searchParams.side === 'ap' ? 'ap' : 'ar';

  const [{ data: sum }, { data: stmt }] = await Promise.all([
    supabase.rpc('rpt_contact_summary', { p_contact: params.id, p_as_of: to }),
    supabase.rpc('rpt_contact_statement', {
      p_contact: params.id, p_from: from, p_to: to, p_side: side,
      p_filters: { show_none: false },
    }),
  ]);
  if (!sum) notFound();

  const s = sum as any;
  const c = s.contact;
  const st = (stmt || { rows: [] }) as any;
  const rows = ((st.rows || []) as Row[]).filter((r) => r.is_ledger);
  const opening = Number(st.opening?.[side] || 0);
  const closing = Number(st.closing?.[side] || 0);
  const company = ctx.company as any;

  return (
    <>
      {/* ใบแจ้งยอดไม่ใช่เอกสารในทะเบียน จึงไม่บันทึกประวัติการพิมพ์เหมือนใบกำกับภาษี */}
      <div className="no-print mx-auto mb-4 flex w-[210mm] max-w-full justify-end">
        <PrintButton label={d.common.print} />
      </div>
      <div className="mx-auto w-[210mm] bg-white p-[15mm] text-[10pt] leading-relaxed text-ink-900 shadow print:w-auto print:p-0 print:shadow-none">
        <header className="mb-6 flex items-start justify-between gap-6">
          <div>
            <h1 className="text-[13pt] font-bold">{company.name_th}</h1>
            {company.address && (
              <p className="mt-1 max-w-[95mm] text-[8pt] leading-snug text-ink-600">
                {[company.address, company.district, company.province, company.postcode]
                  .filter(Boolean).join(' ')}
              </p>
            )}
            {company.tax_id && (
              <p className="text-[8pt] text-ink-600">{d.ui.contactTable.taxId} {company.tax_id}</p>
            )}
          </div>
          <div className="text-right">
            <h2 className="text-[13pt] font-bold">{L.statementTitle}</h2>
            <p className="text-[9pt] text-ink-600">
              {L.statementAsOf.replace('{date}', localeDate(to, locale))}
            </p>
            <p className="text-[8pt] text-ink-500">
              {localeDate(from, locale)} – {localeDate(to, locale)}
            </p>
          </div>
        </header>

        <section className="mb-5 rounded border border-ink-300 p-3">
          <p className="text-[8pt] text-ink-500">{L.statementSide}</p>
          <p className="mt-0.5 font-semibold">{c.name}</p>
          {(c.address || c.province) && (
            <p className="text-[8pt] leading-snug text-ink-600">
              {[c.address, c.district, c.province, c.postcode].filter(Boolean).join(' ')}
            </p>
          )}
          <p className="text-[8pt] text-ink-600">
            {c.tax_id && <>{d.ui.contactTable.taxId} {c.tax_id}</>}
            {c.phone && <> · {d.ui.contactTable.phone} {c.phone}</>}
          </p>
        </section>

        <table className="w-full border-collapse text-[9pt]">
          <thead>
            <tr className="border-y border-ink-400">
              <th className="py-1.5 text-left font-semibold">{L.date}</th>
              <th className="py-1.5 text-left font-semibold">{L.document}</th>
              <th className="py-1.5 text-left font-semibold">{L.dueDate}</th>
              <th className="py-1.5 text-right font-semibold">{L.increase}</th>
              <th className="py-1.5 text-right font-semibold">{L.decrease}</th>
              <th className="py-1.5 text-right font-semibold">{L.balance}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-ink-200">
              <td className="py-1">{localeDate(from, locale)}</td>
              <td className="py-1 text-ink-600" colSpan={4}>{L.opening}</td>
              <td className="py-1 text-right tabular-nums">{money(opening)}</td>
            </tr>

            {rows.length === 0 && (
              <tr><td className="py-3 text-center text-ink-500" colSpan={6}>{L.empty}</td></tr>
            )}

            {rows.map((r, i) => (
              <tr key={i} className="border-b border-ink-100">
                <td className="py-1">{localeDate(r.date, locale)}</td>
                <td className="py-1">
                  <span className="font-mono text-[8pt]">{r.number}</span>
                  <span className="ml-1.5 text-[8pt] text-ink-500">
                    {r.type === 'payment'
                      ? (r.kind === 'receive' ? L.paymentIn : L.paymentOut)
                      : docKindLabel(d, r.kind)}
                  </span>
                </td>
                <td className="py-1 text-ink-600">{r.due_date ? localeDate(r.due_date, locale) : '–'}</td>
                <td className="py-1 text-right tabular-nums">{r.delta > 0 ? money(r.delta) : ''}</td>
                <td className="py-1 text-right tabular-nums">{r.delta < 0 ? money(-r.delta) : ''}</td>
                <td className="py-1 text-right tabular-nums">{money(r.balance)}</td>
              </tr>
            ))}

            <tr className="border-y border-ink-400 font-semibold">
              <td className="py-1.5" colSpan={5}>{L.closing}</td>
              <td className="py-1.5 text-right tabular-nums">{money(closing)}</td>
            </tr>
          </tbody>
        </table>

        {/* ช่องอายุหนี้ช่วยให้ฝั่งเขาเห็นทันทีว่าก้อนไหนค้างนาน */}
        <section className="mt-5 grid grid-cols-5 gap-2 text-center text-[8pt]">
          {(['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'] as const).map((b) => (
            <div key={b} className="rounded border border-ink-200 py-1.5">
              <p className="text-ink-500">
                {b === 'current' ? L.agingCurrent : (L as Record<string, string>)[b]}
              </p>
              <p className="mt-0.5 font-semibold tabular-nums">
                {money(Number(s[side]?.aging?.[b] || 0))}
              </p>
            </div>
          ))}
        </section>

        <p className="mt-6 text-[8pt] text-ink-500">{L.statementNote}</p>
      </div>
    </>
  );
}
