import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card, CardHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PeriodVerify } from '@/components/forms/period-verify';
import { PeriodLockManager } from '@/components/forms/period-lock-manager';
import { localeDate } from '@/lib/format';
import { Lock } from 'lucide-react';

export const dynamic = 'force-dynamic';

const SCOPE_LABEL: Record<string, string> = {
  all: 'ทุกโมดูล', sales: 'ด้านรายรับ', purchase: 'ด้านรายจ่าย', journal: 'สมุดรายวัน', payroll: 'เงินเดือน',
};

export default async function PeriodLockPage() {
  const ctx = await requirePermission('period', 'view');
  const d = t();
  const locale = currentLocale();
  const supabase = createClient();
  const { data } = await supabase
    .from('period_locks')
    .select('*, locked_profile:profiles!period_locks_locked_by_fkey(full_name)')
    .eq('company_id', ctx.company.id)
    .order('locked_at', { ascending: false }).limit(100);
  const rows = (data || []) as any[];

  return (
    <>
      <PageHeader
        title={d.nav.periodLock}
        subtitle={`${ctx.company.name_th} · เมื่อปิดงวดแล้ว ข้อมูลย้อนหลังจะถูกล็อกที่ระดับฐานข้อมูล ไม่มีใครแก้ไขได้แม้ผ่าน API`}
        action={<PeriodLockManager canLock={can(ctx, 'period', 'create')} canUnlock={can(ctx, 'period', 'unlock')} />}
      />

      {ctx.lockedThrough && (
        <div className="mb-5 flex items-center gap-3 rounded-xl bg-amber-50 px-5 py-4 ring-1 ring-inset ring-amber-200">
          <Lock className="h-5 w-5 text-amber-600" strokeWidth={1.8} />
          <div>
            <p className="text-sm font-medium text-amber-900">งวดบัญชีถูกปิดถึงวันที่ {localeDate(ctx.lockedThrough, locale)}</p>
            <p className="text-xs text-amber-700">รายการที่มีวันที่ก่อนหรือเท่ากับวันดังกล่าวจะบันทึก แก้ไข หรือลบไม่ได้</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader title="ประวัติการปิดงวด" />
        <Table>
          <THead>
            <TR><TH>ปิดถึงวันที่</TH><TH>ขอบเขต</TH><TH>เหตุผล</TH><TH>ผู้ปิด</TH><TH>เมื่อ</TH><TH>สถานะ</TH><TH>หลักฐาน</TH><TH /></TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={8} label={d.common.noData} />}
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="font-medium">{localeDate(r.locked_through, locale)}</TD>
                <TD><Badge tone="brand">{SCOPE_LABEL[r.scope]}</Badge></TD>
                <TD className="text-ink-600"><span className="block truncate max-w-[20rem]">{r.reason || '–'}</span></TD>
                <TD>{r.locked_profile?.full_name || '–'}</TD>
                <TD className="text-xs text-ink-500">{localeDate(r.locked_at, locale)}</TD>
                <TD>{r.is_active && !r.released_at ? <Badge tone="warn">ล็อกอยู่</Badge> : <Badge>ปลดแล้ว</Badge>}</TD>
                <TD className="min-w-[16rem] align-top">
                  {r.snapshot_hash
                    ? <PeriodVerify lockId={r.id} />
                    : <span className="text-xxs text-ink-400">ปิดก่อนมีระบบเก็บหลักฐาน</span>}
                </TD>
                <TD>
                  {r.is_active && !r.released_at && can(ctx, 'period', 'unlock') && (
                    <PeriodLockManager canLock={false} canUnlock releaseId={r.id} />
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
