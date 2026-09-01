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

/** ช่วงอายุหนี้ — โครงสร้างและสี ส่วนชื่ออยู่ในพจนานุกรม (ui.aging) */
const BUCKETS = [
  { key: 'current' as const, tone: 'success' as const },
  { key: 'd1_30' as const, tone: 'neutral' as const },
  { key: 'd31_60' as const, tone: 'warn' as const },
  { key: 'd61_90' as const, tone: 'warn' as const },
  { key: 'd90_plus' as const, tone: 'danger' as const },
];

export default async function AgingPage({ searchParams }: { searchParams: { to?: string; from?: string } }) {
  const ctx = await requirePermission('report', 'view');
  const d = t();
  const L = d.ui.aging;
  const locale = currentLocale();
  const asOf = searchParams.to || lastDayOfMonth();
  const supabase = createClient();
  const { data } = await supabase.rpc('rpt_aging', { p_company: ctx.company.id, p_as_of: asOf, p_side: 'ap' });
  const rows = (data || []) as any[];
  const bucketTotal = (k: string) => rows.filter((r) => r.bucket === k).reduce((a, r) => a + Number(r.outstanding || 0), 0);
  const grand = rows.reduce((a, r) => a + Number(r.outstanding || 0), 0);

  return (
    <>
      <PageHeader
        title={d.nav.apAging}
        subtitle={`${ctx.company.name_th} · ${L.asOf} ${localeDate(asOf, locale)}`}
        action={<>
          <DateRangeFilter from={searchParams.from || firstDayOfYear()} to={asOf} singleDate
            labels={{ from: d.common.from, to: L.asOf, apply: d.common.filter }} />
          {can(ctx, 'report', 'export') && (
            <ExportCsvButton label={d.common.export} filename="ap-aging.csv"
              rows={[[L.vendor, L.docNumber, L.docDate, L.dueDate, L.outstanding, L.bucket],
                ...rows.map((r) => [r.contact_name, r.doc_number, r.doc_date, r.due_date, r.outstanding, r.bucket])]} />
          )}
          <PrintButton label={d.common.print} />
        </>}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {BUCKETS.map((b) => (
          <div key={b.key} className="card px-4 py-3">
            <p className="text-xxs text-ink-500">{L[b.key]}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-ink-900">{money(bucketTotal(b.key))}</p>
          </div>
        ))}
      </div>
      <Card>
        <Table>
          <THead>
            <TR><TH>{L.vendor}</TH><TH>{L.docNumber}</TH><TH>{L.docDate}</TH><TH>{L.dueDate}</TH>
              <TH align="right">{L.outstanding}</TH><TH>{L.bucket}</TH></TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={6} label={d.common.noData} />}
            {rows.map((r, i) => {
              const b = BUCKETS.find((x) => x.key === r.bucket);
              return (
                <TR key={i}>
                  <TD><span className="block truncate max-w-[20rem]">{r.contact_name}</span></TD>
                  <TD className="font-mono text-xs">{r.doc_number}</TD>
                  <TD>{localeDate(r.doc_date, locale)}</TD>
                  <TD>{r.due_date ? localeDate(r.due_date, locale) : '–'}</TD>
                  <TD align="right" className="font-medium">{money(r.outstanding)}</TD>
                  <TD><Badge tone={b?.tone || 'neutral'}>{b ? L[b.key] : r.bucket}</Badge></TD>
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
