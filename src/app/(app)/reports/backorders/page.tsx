import Link from 'next/link';
import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { localeDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

interface Line {
  product_id: string; sku: string; name: string;
  ordered: number; delivered: number; remaining: number;
}
interface Row {
  so_id: string; doc_number: string; doc_date: string;
  contact_name: string | null; lines: Line[];
}

/** ของค้างส่ง : ใบสั่งขายที่ยังส่งไม่ครบ อ่านจาก rpt_open_deliveries */
export default async function BackordersPage() {
  const ctx = await requirePermission('report', 'view');
  const d = t();
  const L = d.ui.delivery;
  const locale = currentLocale();

  const supabase = createClient();
  const { data } = await supabase.rpc('rpt_open_deliveries', { p_company: ctx.company.id });
  const rows = (data || []) as Row[];

  const qty = (n: number) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 4 });

  return (
    <>
      <PageHeader title={L.backorderTitle} subtitle={`${ctx.company.name_th} · ${L.backorderSubtitle}`} />

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>{L.soNumber}</TH>
              <TH>{L.customer}</TH>
              <TH>{L.product}</TH>
              <TH align="right">{L.ordered}</TH>
              <TH align="right">{L.delivered}</TH>
              <TH align="right">{L.remaining}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={6} label={L.allDelivered} />}
            {rows.map((r) =>
              r.lines.map((l, i) => (
                <TR key={`${r.so_id}-${l.product_id}`}>
                  {/* เลขที่กับชื่อลูกค้าแสดงเฉพาะบรรทัดแรกของแต่ละใบ ให้อ่านเป็นกลุ่มได้ */}
                  <TD>
                    {i === 0 && (
                      <>
                        <Link href={`/sales/sales-orders/${r.so_id}`}
                              className="font-mono text-xs font-medium text-brand-700 hover:underline">
                          {r.doc_number}
                        </Link>
                        <span className="block text-xxs text-ink-400">{localeDate(r.doc_date, locale)}</span>
                      </>
                    )}
                  </TD>
                  <TD className="text-ink-600">{i === 0 ? r.contact_name || '–' : ''}</TD>
                  <TD>
                    <span className="block truncate max-w-[16rem]">{l.name}</span>
                    <span className="block font-mono text-xxs text-ink-400">{l.sku}</span>
                  </TD>
                  <TD align="right" className="text-ink-500">{qty(l.ordered)}</TD>
                  <TD align="right" className="text-ink-500">{qty(l.delivered)}</TD>
                  <TD align="right" className="font-medium text-amber-700">{qty(l.remaining)}</TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
