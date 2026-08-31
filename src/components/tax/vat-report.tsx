import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card, CardHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { ExportCsvButton } from '@/components/ui/export-csv';
import { PrintButton } from '@/components/ui/print-button';
import { MonthPicker } from '@/components/forms/month-picker';
import { localeDate, money, currencyLabel } from '@/lib/format';

/**
 * รายงานภาษีซื้อและภาษีขายใช้โครงเดียวกันทั้งหมด ต่างกันแค่ฝั่งที่ดึงมา
 * แยกเป็นคนละหน้าเพราะเวลายื่นจริงต้องพิมพ์และส่งออกทีละฉบับอยู่แล้ว
 *
 * หัวคอลัมน์เป็นถ้อยคำตามแบบรายงานภาษีที่กรมสรรพากรกำหนด จึงคงเป็นภาษาไทยตามแบบ
 */
export async function VatReport({
  side,
  searchParams,
}: {
  side: 'output' | 'input';
  searchParams: { y?: string; m?: string };
}) {
  const ctx = await requirePermission('tax', 'view');
  const d = t();
  const locale = currentLocale();
  const now = new Date();
  const year = Number(searchParams.y) || now.getFullYear();
  const month = Number(searchParams.m) || now.getMonth() + 1;
  const supabase = createClient();

  const { data } = await supabase.rpc('rpt_vat', {
    p_company: ctx.company.id, p_year: year, p_month: month, p_side: side,
  });
  const rows = (data || []) as any[];

  const sum = (k: string) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);
  const base = sum('base_amount');
  const vat = sum('vat_amount');

  const title = side === 'output' ? 'รายงานภาษีขาย' : 'รายงานภาษีซื้อ';
  const file = `vat-${side === 'output' ? 'sales' : 'purchase'}-${year}${String(month).padStart(2, '0')}.csv`;

  return (
    <>
      <PageHeader
        title={title}
        subtitle={`${ctx.company.name_th} · ${d.common.period} ${month}/${year} · ${currencyLabel(ctx.company.base_currency, locale)}`}
        action={<><MonthPicker year={year} month={month} /><PrintButton label={d.common.print} /></>}
      />

      <Card>
        <CardHeader
          title={title}
          right={can(ctx, 'tax', 'export') && (
            <ExportCsvButton label={d.common.export} filename={file}
              rows={[['ลำดับ','วันที่','เลขที่ใบกำกับ','ชื่อผู้ประกอบการ','เลขประจำตัวผู้เสียภาษี','สาขา','มูลค่าสินค้า/บริการ','จำนวนภาษี','รวมเป็นเงิน'],
                ...rows.map((r) => [r.seq, r.doc_date, r.doc_number, r.contact_name, r.tax_id, r.branch,
                  r.base_amount, r.vat_amount, Number(r.base_amount || 0) + Number(r.vat_amount || 0)])]} />
          )}
        />

        {/* ยอดสามตัวที่ต้องเห็นก่อนเลื่อนดูรายการ */}
        <div className="grid grid-cols-1 divide-y divide-ink-200 border-b border-ink-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            { label: d.doc.vatBase, value: base, tone: 'text-ink-900' },
            { label: d.doc.vat, value: vat, tone: 'text-brand-700' },
            { label: d.doc.grandTotal, value: base + vat, tone: 'text-ink-900' },
          ].map((x) => (
            <div key={x.label} className="px-5 py-3.5">
              <p className="text-xxs uppercase tracking-wide text-ink-400">{x.label}</p>
              <p className={'mt-0.5 text-lg font-semibold tabular-nums ' + x.tone}>{money(x.value)}</p>
            </div>
          ))}
        </div>

        <Table>
          <THead>
            <TR><TH>ลำดับ</TH><TH>วันที่</TH><TH>เลขที่ใบกำกับภาษี</TH><TH>ชื่อผู้ประกอบการ</TH>
              <TH>เลขประจำตัวผู้เสียภาษี</TH><TH>สาขา</TH>
              <TH align="right">มูลค่าสินค้า/บริการ</TH><TH align="right">จำนวนภาษี</TH>
              <TH align="right">รวมเป็นเงิน</TH></TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={9} label={d.common.noData} />}
            {rows.map((r) => (
              <TR key={String(r.seq) + r.doc_number}>
                <TD className="text-ink-400">{r.seq}</TD>
                <TD>{localeDate(r.doc_date, locale)}</TD>
                <TD className="font-mono text-xs">{r.doc_number}</TD>
                <TD><span className="block truncate max-w-[18rem]">{r.contact_name}</span></TD>
                <TD className="font-mono text-xs">{r.tax_id || '–'}</TD>
                <TD className="text-xs">{r.branch}</TD>
                <TD align="right">{money(r.base_amount)}</TD>
                <TD align="right">{money(r.vat_amount)}</TD>
                <TD align="right" className="font-medium text-ink-900">
                  {money(Number(r.base_amount || 0) + Number(r.vat_amount || 0))}
                </TD>
              </TR>
            ))}
          </TBody>
          <tfoot className="bg-ink-50 font-medium">
            <tr><td className="td-cell" colSpan={6}>{d.common.total}</td>
              <td className="td-cell num">{money(base)}</td>
              <td className="td-cell num">{money(vat)}</td>
              <td className="td-cell num">{money(base + vat)}</td></tr>
          </tfoot>
        </Table>
      </Card>
    </>
  );
}
