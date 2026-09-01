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

export default async function PeriodLockPage() {
  const ctx = await requirePermission('period', 'view');
  const d = t();
  const L = d.ui.periodPage;
  const SCOPE_LABEL: Record<string, string> = {
    all: L.scopeAll, sales: L.scopeSales, purchase: L.scopePurchase,
    journal: L.scopeJournal, payroll: L.scopePayroll,
  };
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
        subtitle={`${ctx.company.name_th} · ${L.subtitle}`}
        action={<PeriodLockManager canLock={can(ctx, 'period', 'create')} canUnlock={can(ctx, 'period', 'unlock')} />}
      />

      {ctx.lockedThrough && (
        <div className="mb-5 flex items-center gap-3 rounded-xl bg-amber-50 px-5 py-4 ring-1 ring-inset ring-amber-200">
          <Lock className="h-5 w-5 text-amber-600" strokeWidth={1.8} />
          <div>
            <p className="text-sm font-medium text-amber-900">{L.lockedThrough.replace('{date}', localeDate(ctx.lockedThrough, locale))}</p>
            <p className="text-xs text-amber-700">{L.lockedHint}</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader title={L.history} />
        <Table>
          <THead>
            <TR><TH>{L.through}</TH><TH>{L.scope}</TH><TH>{L.reason}</TH><TH>{L.lockedBy}</TH><TH>{L.when}</TH><TH>{d.common.status}</TH><TH>{L.evidence}</TH><TH /></TR>
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
                <TD>{r.is_active && !r.released_at ? <Badge tone="warn">{L.locked}</Badge> : <Badge>{L.released}</Badge>}</TD>
                <TD className="min-w-[16rem] align-top">
                  {r.snapshot_hash
                    ? <PeriodVerify lockId={r.id} />
                    : <span className="text-xxs text-ink-400">{L.noEvidence}</span>}
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
