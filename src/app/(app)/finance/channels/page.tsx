import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { money } from '@/lib/format';
import { ChannelManager } from '@/components/forms/channel-manager';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = {
  cash: 'เงินสด', bank: 'ธนาคาร', e_wallet: 'กระเป๋าเงินอิเล็กทรอนิกส์', credit_card: 'บัตรเครดิต', cheque: 'เช็ค',
};

export default async function ChannelsPage() {
  const ctx = await requirePermission('finance.channels', 'view');
  const d = t();
  const supabase = createClient();
  const { data } = await supabase.from('financial_channels').select('*, accounts(code, name_th)')
    .eq('company_id', ctx.company.id).order('code');
  const rows = (data || []) as any[];
  const { data: accounts } = await supabase.from('accounts').select('id, code, name_th')
    .eq('company_id', ctx.company.id).in('system_key', ['cash', 'bank']).order('code');

  return (
    <>
      <PageHeader
        title={d.nav.channels}
        subtitle={ctx.company.name_th}
        action={<ChannelManager canCreate={can(ctx, 'finance.channels', 'create')} canEdit={can(ctx, 'finance.channels', 'edit')}
          accounts={(accounts || []).map((a: any) => ({ id: a.id, label: `${a.code} ${a.name_th}` }))}
          labels={{ create: d.common.create, edit: d.common.edit, save: d.common.save, cancel: d.common.cancel, required: d.common.required }} />}
      />
      <Card>
        <Table>
          <THead>
            <TR><TH>รหัส</TH><TH>ชื่อ</TH><TH>ประเภท</TH><TH>ธนาคาร</TH><TH>เลขที่บัญชี</TH><TH>บัญชีแยกประเภท</TH><TH align="right">ยอดยกมา</TH><TH /></TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={8} label={d.common.noData} />}
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="font-mono text-xs">{r.code}</TD>
                <TD className="font-medium text-ink-900">{r.name}</TD>
                <TD><Badge tone={r.kind === 'cash' ? 'success' : 'brand'}>{KIND_LABEL[r.kind]}</Badge></TD>
                <TD>{r.bank_name || '–'}</TD>
                <TD className="font-mono text-xs">{r.account_no || '–'}</TD>
                <TD className="text-xs text-ink-500">{r.accounts ? `${r.accounts.code} ${r.accounts.name_th}` : '–'}</TD>
                <TD align="right">{money(r.opening_balance)}</TD>
                <TD>
                  <ChannelManager canCreate={false} canEdit={can(ctx, 'finance.channels', 'edit')} editRow={r}
                    accounts={(accounts || []).map((a: any) => ({ id: a.id, label: `${a.code} ${a.name_th}` }))}
                    labels={{ create: d.common.create, edit: d.common.edit, save: d.common.save, cancel: d.common.cancel, required: d.common.required }} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
