import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DateRangeFilter } from '@/components/forms/date-range-filter';
import { ExportCsvButton } from '@/components/ui/export-csv';
import { PrintButton } from '@/components/ui/print-button';
import { lastDayOfMonth, firstDayOfYear, localeDate, money } from '@/lib/format';

export const dynamic = 'force-dynamic';

const BUCKETS = [
  { key: 'current', label: 'ยังไม่ครบกำหนด', tone: 'success' as const },
  { key: 'd1_30', label: '1-30 วัน', tone: 'neutral' as const },
  { key: 'd31_60', label: '31-60 วัน', tone: 'warn' as const },
  { key: 'd61_90', label: '61-90 วัน', tone: 'warn' as const },
  { key: 'd90_plus', label: 'เกิน 90 วัน', tone: 'danger' as const },
];

export default async function AgingPage({ searchParams }: { searchParams: { to?: string; from?: string } }) {
  const ctx = await requirePermission('report', 'view');
  const d = t();
  const locale = currentLocale();
  const asOf = searchParams.to || lastDayOfMonth();
  const supabase = createClient();
  const { data } = await supabase.rpc('rpt_aging', { p_company: ctx.company.id, p_as_of: asOf, p_side: 'ar' });
  const rows = (data || []) as any[];
  const bucketTotal = (k: string) => rows.filter((r) => r.bucket === k).reduce((a, r) => a + Number(r.outstanding || 0), 0);
  const grand = rows.reduce((a, r) => a + Number(r.outstanding || 0), 0);

  return (
    <>
      <PageHeader
        title={d.nav.arAging}
        subtitle={`${ctx.company.name_th} · ณ ${localeDate(asOf, locale)}`}
        action={<>
          <DateRangeFilter from={searchParams.from || firstDayOfYear()} to={asOf} singleDate
            labels={{ from: d.common.from, to: 'ณ วันที่', apply: d.common.filter }} />
          {can(ctx, 'report', 'export') && (
            <ExportCsvButton label={d.common.export} filename="ar-aging.csv"
              rows={[['ลูกหนี้','เลขที่','วันที่','ครบกำหนด','คงค้าง','ช่วงอายุ'],
                ...rows.map((r) => [r.contact_name, r.doc_number, r.doc_date, r.due_date, r.outstanding, r.bucket])]} />
          )}
          <PrintButton label={d.common.print} />
        </>}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {BUCKETS.map((b) => (
          <div key={b.key} className="card px-4 py-3">
            <p className="text-xxs text-ink-500">{b.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-ink-900">{money(bucketTotal(b.key))}</p>
          </div>
        ))}
      </div>
      <Card>
        <Table>
          <THead>
            <TR><TH>ลูกหนี้</TH><TH>เลขที่</TH><TH>วันที่</TH><TH>ครบกำหนด</TH>
              <TH align="right">คงค้าง</TH><TH>ช่วงอายุ</TH></TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={6} label={d.common.noData} />}
            {rows.map((r, i) => {
              const b = BUCKETS.find((x) => x.key === r.bucket);
              return (
                <TR key={i}>
                  <TD className="max-w-[20rem] truncate">{r.contact_name}</TD>
                  <TD className="font-mono text-xs">{r.doc_number}</TD>
                  <TD>{localeDate(r.doc_date, locale)}</TD>
                  <TD>{r.due_date ? localeDate(r.due_date, locale) : '–'}</TD>
                  <TD align="right" className="font-medium">{money(r.outstanding)}</TD>
                  <TD><Badge tone={b?.tone || 'neutral'}>{b?.label}</Badge></TD>
                </TR>
              );
            })}
          </TBody>
          <tfoot className="bg-ink-50 font-medium">
            <tr><td className="td-cell" colSpan={4}>{d.common.total}</td>
              <td className="td-cell num">{money(grand)}</td><td className="td-cell" /></tr>
          </tfoot>
        </Table>
      </Card>
    </>
  );
}
