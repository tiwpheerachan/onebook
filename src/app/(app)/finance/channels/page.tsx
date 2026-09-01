import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader } from '@/components/ui/page-header';
import { PrintButton } from '@/components/ui/print-button';
import { ChannelManager } from '@/components/forms/channel-manager';
import { FinanceTabs } from '@/components/finance/finance-tabs';
import { ChannelBoard, type ChannelGroup } from '@/components/finance/channel-board';
import { money, localeDate } from '@/lib/format';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

export default async function ChannelsPage() {
  const ctx = await requirePermission('finance.channels', 'view');
  const d = t();
  const M = d.ui.misc;
  const locale = currentLocale();
  const supabase = createClient();

  const [{ data: board, error }, { data: rows }, { data: accounts }] = await Promise.all([
    supabase.rpc('rpt_channel_balances', { p_company: ctx.company.id, p_as_of: null }),
    supabase.from('financial_channels').select('*').eq('company_id', ctx.company.id).order('code'),
    supabase.from('accounts').select('id, code, name_th')
      .eq('company_id', ctx.company.id).in('system_key', ['cash', 'bank']).order('code'),
  ]);

  const b = (board || {}) as any;
  const groups: ChannelGroup[] = b.groups || [];
  const total = Number(b.grand_total || 0);
  const canEditChannel = can(ctx, 'finance.channels', 'edit');

  const managerLabels = {
    create: d.common.create, edit: d.common.edit, save: d.common.save,
    cancel: d.common.cancel, required: d.common.required,
  };
  const accountOptions = (accounts || []).map((a: any) => ({ id: a.id, label: `${a.code} ${a.name_th}` }));

  return (
    <>
      <PageHeader
        title={d.nav.finance}
        subtitle={ctx.company.name_th}
        breadcrumb={[{ label: d.nav.finance }, { label: M.channelsCrumb }]}
      />

      <FinanceTabs />

      {error ? (
        <p className="card card-pad text-sm text-rose-700">{M.balanceFailed} : {error.message}</p>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-ink-900">
                เงินสด/ธนาคาร/e-Wallet ทั้งหมด {b.account_count || 0} บัญชี
              </h2>
              <p className="mt-0.5 text-xs text-ink-500">
                แสดงยอดตามบัญชีแยกประเภท ณ วันที่ {localeDate(b.as_of, locale)} — ตรงกับงบแสดงฐานะการเงิน
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <ChannelManager
                canCreate={can(ctx, 'finance.channels', 'create')}
                canEdit={can(ctx, 'finance.channels', 'edit')}
                accounts={accountOptions}
                labels={managerLabels}
              />
              <PrintButton label={M.printReport} />
              <span className="ml-2 text-sm text-ink-600">
                รวม{' '}
                <b className={cn('text-lg tabular-nums', total < 0 ? 'text-rose-600' : 'text-ink-900')}>
                  {money(total)}
                </b>{' '}
                บาท
              </span>
            </div>
          </div>

          <ChannelBoard
            groups={groups}
            hasShared={!!b.has_shared}
            editSlots={Object.fromEntries(
              (rows || []).map((r: any) => [
                r.id,
                <ChannelManager
                  key={r.id}
                  canCreate={false}
                  canEdit={canEditChannel}
                  editRow={r}
                  accounts={accountOptions}
                  labels={managerLabels}
                />,
              ])
            )}
          />
        </>
      )}
    </>
  );
}
