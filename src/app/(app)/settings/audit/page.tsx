import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ExportCsvButton } from '@/components/ui/export-csv';

export const dynamic = 'force-dynamic';

const ACTION_TONE: Record<string, any> = { insert: 'success', update: 'warn', delete: 'danger' };
const ACTION_LABEL: Record<string, string> = { insert: 'สร้าง', update: 'แก้ไข', delete: 'ลบ', login: 'เข้าสู่ระบบ', export: 'ส่งออก' };

export default async function AuditPage({ searchParams }: { searchParams: { resource?: string } }) {
  const ctx = await requirePermission('settings.audit', 'view');
  const d = t();
  const locale = currentLocale();
  const supabase = createClient();

  let q = supabase.from('audit_logs').select('*')
    .eq('company_id', ctx.company.id)
    .order('created_at', { ascending: false }).limit(300);
  if (searchParams.resource) q = q.eq('resource', searchParams.resource);
  const { data } = await q;
  const rows = (data || []) as any[];

  const fmt = (ts: string) =>
    new Date(ts).toLocaleString(locale === 'zh' ? 'zh-CN' : locale === 'en' ? 'en-GB' : 'th-TH',
      { dateStyle: 'short', timeStyle: 'medium' });

  return (
    <>
      <PageHeader
        title={d.nav.audit}
        subtitle={`${ctx.company.name_th} · บันทึกทุกการสร้าง แก้ไข และลบข้อมูล ไม่สามารถแก้ไขหรือลบได้`}
        action={can(ctx, 'settings.audit', 'export') && (
          <ExportCsvButton label={d.common.export} filename="audit-log.csv"
            rows={[['เวลา','ผู้ใช้','การกระทำ','ตาราง','รหัสรายการ'],
              ...rows.map((r) => [r.created_at, r.user_email || '', r.action, r.resource, r.record_id || ''])]} />
        )}
      />
      <Card>
        <Table>
          <THead>
            <TR><TH>เวลา</TH><TH>ผู้ใช้</TH><TH>การกระทำ</TH><TH>ตาราง</TH><TH>รหัสรายการ</TH><TH>รายละเอียด</TH></TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={6} label={d.common.noData} />}
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="text-xs text-ink-500">{fmt(r.created_at)}</TD>
                <TD className="text-ink-700">{r.user_email || '–'}</TD>
                <TD><Badge tone={ACTION_TONE[r.action] || 'neutral'}>{ACTION_LABEL[r.action] || r.action}</Badge></TD>
                <TD className="font-mono text-xs">{r.resource}</TD>
                <TD className="font-mono text-xxs text-ink-400"><span className="block truncate max-w-[12rem]">{r.record_id || '–'}</span></TD>
                <TD className="text-xxs text-ink-500"><span className="block truncate max-w-[24rem]">{r.action === 'update' && r.before_data && r.after_data
                    ? diffSummary(r.before_data, r.after_data)
                    : r.action === 'insert' ? summarise(r.after_data) : summarise(r.before_data)}</span></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}

function summarise(obj: any): string {
  if (!obj) return '–';
  const keys = ['doc_number', 'entry_number', 'code', 'name', 'name_th', 'grand_total', 'locked_through'];
  const parts = keys.filter((k) => obj[k] !== undefined && obj[k] !== null).map((k) => `${k}=${obj[k]}`);
  return parts.join(' · ') || '–';
}

function diffSummary(before: any, after: any): string {
  const changed: string[] = [];
  for (const k of Object.keys(after || {})) {
    if (k === 'updated_at') continue;
    if (JSON.stringify(before?.[k]) !== JSON.stringify(after[k])) {
      changed.push(`${k}: ${JSON.stringify(before?.[k])} → ${JSON.stringify(after[k])}`);
    }
  }
  return changed.slice(0, 4).join(' · ') || '–';
}
