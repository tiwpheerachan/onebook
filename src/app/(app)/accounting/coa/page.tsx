import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ExportCsvButton } from '@/components/ui/export-csv';
import { currentLocale } from '@/i18n/server';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = {
  asset: 'สินทรัพย์', liability: 'หนี้สิน', equity: 'ส่วนของผู้ถือหุ้น',
  revenue: 'รายได้', cost_of_sales: 'ต้นทุนขาย', expense: 'ค่าใช้จ่าย',
  other_income: 'รายได้อื่น', other_expense: 'ค่าใช้จ่ายอื่น', tax: 'ภาษี',
};

export default async function CoaPage() {
  const ctx = await requirePermission('accounting.coa', 'view');
  const d = t();
  const locale = currentLocale();
  const supabase = createClient();
  const { data } = await supabase
    .from('accounts')
    .select('*').eq('company_id', ctx.company.id).order('code').limit(1000);
  const rows = (data || []) as any[];

  const name = (r: any) => (locale === 'en' ? r.name_en || r.name_th : locale === 'zh' ? r.name_zh || r.name_th : r.name_th);

  return (
    <>
      <PageHeader
        title={d.nav.coa}
        subtitle={`${ctx.company.name_th} · ${rows.length} บัญชี · ผังบัญชีมาตรฐานไทย (DBD)`}
        action={can(ctx, 'accounting.coa', 'export') && (
          <ExportCsvButton label={d.common.export} filename="chart-of-accounts.csv"
            rows={[['รหัส','ชื่อบัญชี','ชื่อ (EN)','หมวด','ด้านปกติ'],
              ...rows.map((r) => [r.code, r.name_th, r.name_en || '', TYPE_LABEL[r.type], r.normal_side])]} />
        )}
      />
      <Card>
        <Table>
          <THead>
            <TR><TH>รหัส</TH><TH>ชื่อบัญชี</TH><TH>หมวด</TH><TH>ด้านปกติ</TH><TH>สถานะ</TH></TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={5} label={d.common.noData} />}
            {rows.map((r) => (
              <TR key={r.id}>
                <TD><span className="font-mono text-xs">{r.code}</span></TD>
                <TD className={r.is_header ? 'font-semibold text-ink-900' : 'pl-6 text-ink-700'}>
                  {name(r)}
                  {r.system_key && <span className="ml-2 font-mono text-xxs text-brand-500">{r.system_key}</span>}
                </TD>
                <TD className="text-xs text-ink-500">{TYPE_LABEL[r.type]}</TD>
                <TD className="text-xs">{r.normal_side === 'D' ? 'เดบิต' : 'เครดิต'}</TD>
                <TD>{r.is_active ? <Badge tone="success">ใช้งาน</Badge> : <Badge>ปิด</Badge>}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
