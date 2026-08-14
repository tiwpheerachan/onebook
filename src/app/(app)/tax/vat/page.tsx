import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card, CardHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { ExportCsvButton } from '@/components/ui/export-csv';
import { PrintButton } from '@/components/ui/print-button';
import { MonthPicker } from '@/components/forms/month-picker';
import { localeDate, money } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function VatPage({ searchParams }: { searchParams: { y?: string; m?: string } }) {
  const ctx = await requirePermission('tax', 'view');
  const d = t();
  const locale = currentLocale();
  const now = new Date();
  const year = Number(searchParams.y) || now.getFullYear();
  const month = Number(searchParams.m) || now.getMonth() + 1;
  const supabase = createClient();

  const [{ data: out }, { data: inp }] = await Promise.all([
    supabase.rpc('rpt_vat', { p_company: ctx.company.id, p_year: year, p_month: month, p_side: 'output' }),
    supabase.rpc('rpt_vat', { p_company: ctx.company.id, p_year: year, p_month: month, p_side: 'input' }),
  ]);
  const sales = (out || []) as any[];
  const purch = (inp || []) as any[];
  const sum = (rows: any[], k: string) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);

  const Section = ({ title, rows, file }: { title: string; rows: any[]; file: string }) => (
    <Card className="mb-6">
      <CardHeader
        title={title}
        right={can(ctx, 'tax', 'export') && (
          <ExportCsvButton label={d.common.export} filename={file}
            rows={[['ลำดับ','วันที่','เลขที่ใบกำกับ','ชื่อผู้ประกอบการ','เลขประจำตัวผู้เสียภาษี','สาขา','มูลค่าสินค้า/บริการ','จำนวนภาษี'],
              ...rows.map((r) => [r.seq, r.doc_date, r.doc_number, r.contact_name, r.tax_id, r.branch, r.base_amount, r.vat_amount])]} />
        )}
      />
      <Table>
        <THead>
          <TR><TH>ลำดับ</TH><TH>วันที่</TH><TH>เลขที่ใบกำกับภาษี</TH><TH>ชื่อผู้ประกอบการ</TH>
            <TH>เลขประจำตัวผู้เสียภาษี</TH><TH>สาขา</TH>
            <TH align="right">มูลค่าสินค้า/บริการ</TH><TH align="right">จำนวนภาษี</TH></TR>
        </THead>
        <TBody>
          {rows.length === 0 && <EmptyRow colSpan={8} label={d.common.noData} />}
          {rows.map((r) => (
            <TR key={String(r.seq) + r.doc_number}>
              <TD className="text-ink-400">{r.seq}</TD>
              <TD>{localeDate(r.doc_date, locale)}</TD>
              <TD className="font-mono text-xs">{r.doc_number}</TD>
              <TD className="max-w-[18rem] truncate">{r.contact_name}</TD>
              <TD className="font-mono text-xs">{r.tax_id || '–'}</TD>
              <TD className="text-xs">{r.branch}</TD>
              <TD align="right">{money(r.base_amount)}</TD>
              <TD align="right">{money(r.vat_amount)}</TD>
            </TR>
          ))}
        </TBody>
        <tfoot className="bg-ink-50 font-medium">
          <tr><td className="td-cell" colSpan={6}>{d.common.total}</td>
            <td className="td-cell num">{money(sum(rows, 'base_amount'))}</td>
            <td className="td-cell num">{money(sum(rows, 'vat_amount'))}</td></tr>
        </tfoot>
      </Table>
    </Card>
  );

  return (
    <>
      <PageHeader
        title={d.nav.vat}
        subtitle={`${ctx.company.name_th} · เดือน ${month}/${year}`}
        action={<><MonthPicker year={year} month={month} /><PrintButton label={d.common.print} /></>}
      />
      <Section title="รายงานภาษีขาย" rows={sales} file={`vat-sales-${year}${String(month).padStart(2,'0')}.csv`} />
      <Section title="รายงานภาษีซื้อ" rows={purch} file={`vat-purchase-${year}${String(month).padStart(2,'0')}.csv`} />
    </>
  );
}
