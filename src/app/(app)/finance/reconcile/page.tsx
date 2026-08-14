import Link from 'next/link';
import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';
import { PageHeader, Card, CardHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { StatCard } from '@/components/ui/stat-card';
import { StatementImport } from '@/components/forms/statement-import';
import { BankMatchRow, ReconcileActions } from '@/components/forms/bank-match-row';
import { money, lastDayOfMonth } from '@/lib/format';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

const LINE_STATUS_STYLE: Record<string, string> = {
  matched: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  unmatched: 'bg-amber-50 text-amber-700 ring-amber-200',
  ignored: 'bg-ink-100 text-ink-400 ring-ink-200',
};

export default async function ReconcilePage({
  searchParams,
}: {
  searchParams: { channel?: string; as_of?: string };
}) {
  const ctx = await requirePermission('finance.reconcile', 'view');
  const d = t();
  const supabase = createClient();
  const asOf = searchParams.as_of || lastDayOfMonth();

  const { data: channels } = await supabase
    .from('financial_channels')
    .select('id, code, name, kind, account_no, bank_name')
    .eq('company_id', ctx.company.id)
    .eq('is_active', true)
    .order('code');

  const list = (channels || []) as any[];
  const channel = list.find((c) => c.id === searchParams.channel) || list[0];

  if (!channel) {
    return (
      <>
        <PageHeader title={d.nav.reconcile} subtitle={ctx.company.name_th} />
        <Card>
          <div className="px-5 py-10 text-center text-sm text-ink-500">
            {d.rec.noChannel}{' '}
            <Link href="/finance/channels" className="text-brand-700 underline underline-offset-4">
              {d.nav.channels}
            </Link>
          </div>
        </Card>
      </>
    );
  }

  const [{ data: summary }, { data: statements }, { data: lines }, { data: payments }] = await Promise.all([
    supabase.rpc('rpt_bank_reconcile', { p_company: ctx.company.id, p_channel: channel.id, p_as_of: asOf }),
    supabase
      .from('bank_statements')
      .select('id, file_name, period_from, period_to, line_count, created_at')
      .eq('company_id', ctx.company.id)
      .eq('channel_id', channel.id)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('bank_statement_lines')
      .select('id, line_no, txn_date, description, reference, deposit, withdrawal, balance, status, match_score, payment_id')
      .eq('company_id', ctx.company.id)
      .eq('channel_id', channel.id)
      .lte('txn_date', asOf)
      .order('txn_date', { ascending: false })
      .order('line_no', { ascending: false })
      .limit(300),
    supabase
      .from('payments')
      .select('id, direction, doc_number, doc_date, amount, note')
      .eq('company_id', ctx.company.id)
      .eq('channel_id', channel.id)
      .neq('status', 'void')
      .lte('doc_date', asOf)
      .order('doc_date', { ascending: false })
      .limit(300),
  ]);

  const s = (summary || {}) as any;
  const rows = (lines || []) as any[];
  const pays = (payments || []) as any[];
  const matchedPaymentIds = new Set(rows.filter((r) => r.payment_id).map((r) => r.payment_id));
  const openPayments = pays.filter((p) => !matchedPaymentIds.has(p.id));
  const latestStatement = (statements || [])[0];
  const editable = can(ctx, 'finance.reconcile', 'edit');

  const candidates = openPayments.map((p: any) => ({
    id: p.id,
    label: `${p.doc_date} · ${p.direction === 'receive' ? d.rec.in : d.rec.out} ${money(p.amount)} · ${p.doc_number}`,
  }));

  const importLabels = {
    import: d.rec.import, close: d.common.close, file: d.rec.file, fileHint: d.rec.fileHint,
    mapping: d.rec.mapping, notUsed: d.rec.notUsed, preview: d.rec.preview,
    date: d.common.date, description: d.doc.description, in: d.rec.in, out: d.rec.out,
    importCount: d.rec.importCount, imported: d.rec.imported, showingFirst: d.rec.showingFirst,
  };
  const rowLabels = {
    match: d.rec.match, unmatch: d.rec.unmatch, ignore: d.rec.ignore, undo: d.rec.undo,
    choosePayment: d.rec.choosePayment, confirm: d.common.confirm,
  };
  const actionLabels = {
    autoMatch: d.rec.autoMatch, closeRec: d.rec.closeRec, closed: d.rec.closed,
    matchedCount: d.rec.matchedCount, difference: d.rec.difference,
  };

  return (
    <>
      <PageHeader
        title={d.nav.reconcile}
        subtitle={`${channel.name}${channel.account_no ? ' · ' + channel.account_no : ''} · ${d.inv.asOf} ${asOf}`}
        action={
          <>
            <form className="flex items-center gap-2">
              <select name="channel" defaultValue={channel.id} className="input h-9 py-1.5 text-sm">
                {list.map((c) => (
                  <option key={c.id} value={c.id}>{c.code} · {c.name}</option>
                ))}
              </select>
              <input type="date" name="as_of" defaultValue={asOf} className="input h-9 w-40 py-1.5 text-sm" />
              <button className="btn-secondary" type="submit">{d.common.filter}</button>
            </form>
            {editable && (
              <>
                <ReconcileActions
                  statementId={latestStatement?.id}
                  channelId={channel.id}
                  asOf={asOf}
                  labels={actionLabels}
                />
                <StatementImport channelId={channel.id} channelName={channel.name} labels={importLabels} />
              </>
            )}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={d.rec.bookBalance} value={Number(s.book_balance || 0)} suffix={d.common.baht} />
        <StatCard label={d.rec.statementBalance} value={Number(s.statement_balance || 0)} suffix={d.common.baht} tone="brand" />
        <StatCard
          label={d.rec.difference}
          value={Number(s.difference || 0)}
          suffix={d.common.baht}
          tone={Number(s.difference || 0) === 0 ? 'positive' : 'negative'}
          hint={Number(s.difference || 0) === 0 ? d.rec.balanced : d.rec.notBalanced}
        />
        <StatCard
          label={d.rec.unmatched}
          value={`${s.unmatched_bank_count || 0} / ${s.unmatched_book_count || 0}`}
          isCurrency={false}
          hint={d.rec.unmatchedHint}
        />
      </div>

      <Card className="mb-5">
        <CardHeader
          title={d.rec.bankLines}
          description={d.rec.bankLinesHint}
          right={<span className="text-xxs text-ink-400">{rows.length} {d.assets.items}</span>}
        />
        <Table>
          <THead>
            <TR>
              <TH>{d.common.date}</TH>
              <TH>{d.doc.description}</TH>
              <TH className="num">{d.rec.in}</TH>
              <TH className="num">{d.rec.out}</TH>
              <TH className="num">{d.rec.balance}</TH>
              <TH>{d.common.status}</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={7} label={d.rec.noLines} />}
            {rows.map((r) => (
              <TR key={r.id} className={cn(r.status === 'ignored' && 'opacity-50')}>
                <TD className="whitespace-nowrap">{r.txn_date}</TD>
                <TD className="max-w-[22rem] truncate" >{r.description || '—'}</TD>
                <TD className="num text-emerald-600">{Number(r.deposit) ? money(r.deposit) : '—'}</TD>
                <TD className="num text-rose-600">{Number(r.withdrawal) ? money(r.withdrawal) : '—'}</TD>
                <TD className="num text-ink-500">{r.balance != null ? money(r.balance) : '—'}</TD>
                <TD>
                  <span className={`chip ${LINE_STATUS_STYLE[r.status]}`}>{d.rec.status[r.status as 'matched']}</span>
                </TD>
                <TD>
                  {editable ? (
                    <BankMatchRow line={r} candidates={candidates} labels={rowLabels} />
                  ) : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <Card>
        <CardHeader title={d.rec.openPayments} description={d.rec.openPaymentsHint} />
        <Table>
          <THead>
            <TR>
              <TH>{d.common.date}</TH>
              <TH>{d.doc.number}</TH>
              <TH>{d.rec.direction}</TH>
              <TH>{d.common.notes}</TH>
              <TH className="num">{d.common.amount}</TH>
            </TR>
          </THead>
          <TBody>
            {openPayments.length === 0 && <EmptyRow colSpan={5} label={d.rec.allMatched} />}
            {openPayments.map((p) => (
              <TR key={p.id}>
                <TD className="whitespace-nowrap">{p.doc_date}</TD>
                <TD className="font-mono text-xxs">{p.doc_number}</TD>
                <TD className={p.direction === 'receive' ? 'text-emerald-600' : 'text-rose-600'}>
                  {p.direction === 'receive' ? d.rec.in : d.rec.out}
                </TD>
                <TD className="text-ink-500">{p.note || '—'}</TD>
                <TD className="num font-medium">{money(p.amount)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
