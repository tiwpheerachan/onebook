import Link from 'next/link';
import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader } from '@/components/ui/page-header';
import { SearchBox } from '@/components/forms/search-box';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { NewCheque, ChequeActions } from '@/components/forms/cheque-panel';
import { localeDate, money } from '@/lib/format';
import { cn } from '@/lib/cn';
import { AlertTriangle } from 'lucide-react';

export const dynamic = 'force-dynamic';

const TONE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  cleared: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  bounced: 'bg-rose-50 text-rose-700 ring-rose-200',
  cancelled: 'bg-ink-100 text-ink-500 ring-ink-200',
};

export default async function ChequesPage({
  searchParams,
}: {
  searchParams: { f?: string; q?: string };
}) {
  const ctx = await requirePermission('finance.payments', 'view');
  const d = t();
  const L = d.ui.cheque;
  const locale = currentLocale();
  const canEdit = can(ctx, 'finance.payments', 'edit');
  const filter = searchParams.f || 'pending';
  const supabase = createClient();

  const [{ data }, { data: contacts }, { data: channels }] = await Promise.all([
    supabase.rpc('rpt_cheques', {
      p_company: ctx.company.id, p_filter: filter, p_q: searchParams.q || null,
    }),
    supabase.from('contacts').select('id, code, name')
      .eq('company_id', ctx.company.id).eq('is_active', true).order('name').limit(500),
    supabase.from('financial_channels').select('id, code, name, kind')
      .eq('company_id', ctx.company.id).eq('is_active', true).order('sort_order').order('code'),
  ]);

  const res = (data || {}) as any;
  const rows = (res.rows || []) as any[];
  const sum = (res.summary || {}) as Record<string, number>;
  // เช็คขึ้นเงินต้องเข้าบัญชีธนาคารจริง ไม่ใช่ช่องทางชนิดเช็คด้วยกันเอง
  const bankish = (channels || []).filter((c: any) => c.kind !== 'cheque');
  const st: Record<string, string> = {
    pending: L.pending, cleared: L.cleared, bounced: L.bounced, cancelled: d.common.void,
  };

  const TABS = [
    { key: 'pending', label: L.pending, n: sum.pending_count },
    { key: 'due_soon', label: L.dueSoon, n: sum.due_soon },
    { key: 'overdue', label: L.overdue, n: sum.overdue },
    { key: 'bounced', label: L.bounced, n: sum.bounced },
    { key: 'cleared', label: L.cleared, n: null as number | null },
    { key: 'all', label: L.all, n: null as number | null },
  ];

  const link = (f: string) => {
    const p = new URLSearchParams();
    if (f !== 'pending') p.set('f', f);
    if (searchParams.q) p.set('q', searchParams.q);
    const s = p.toString();
    return s ? `/finance/cheques?${s}` : '/finance/cheques';
  };

  return (
    <>
      <PageHeader
        title={L.title}
        subtitle={`${ctx.company.name_th} · ${L.subtitle}`}
        action={
          <NewCheque
            contacts={(contacts || []).map((c: any) => ({ id: c.id, label: `${c.code} · ${c.name}` }))}
            channels={bankish.map((c: any) => ({ id: c.id, label: `${c.code} · ${c.name}` }))}
            d={d}
            canEdit={canEdit}
          />
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-xxs uppercase tracking-wide text-ink-400">{L.pendingIn}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-brand-700">{money(sum.pending_in)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xxs uppercase tracking-wide text-ink-400">{L.pendingOut}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-ink-900">{money(sum.pending_out)}</p>
        </div>
        <div className={cn('card p-4', Number(sum.overdue || 0) > 0 && 'ring-1 ring-inset ring-amber-300')}>
          <p className="text-xxs uppercase tracking-wide text-ink-400">{L.overdue}</p>
          <p className={cn('mt-1 text-lg font-semibold tabular-nums',
            Number(sum.overdue || 0) > 0 ? 'text-amber-700' : 'text-ink-900')}>{sum.overdue ?? 0}</p>
        </div>
        <div className={cn('card p-4', Number(sum.bounced || 0) > 0 && 'ring-1 ring-inset ring-rose-300')}>
          <p className="text-xxs uppercase tracking-wide text-ink-400">{L.bounced}</p>
          <p className={cn('mt-1 text-lg font-semibold tabular-nums',
            Number(sum.bounced || 0) > 0 ? 'text-rose-700' : 'text-ink-900')}>{sum.bounced ?? 0}</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((tb) => (
          <Link key={tb.key} href={link(tb.key)}
            className={cn('chip transition', filter === tb.key
              ? 'bg-brand-600 text-white ring-brand-600'
              : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50')}>
            {tb.label}{tb.n != null && ` · ${tb.n}`}
          </Link>
        ))}
        <div className="ml-auto min-w-[15rem]">
          <SearchBox placeholder={d.common.search} defaultValue={searchParams.q} />
        </div>
      </div>

      <div className="card overflow-hidden">
        <Table>
          <THead>
            <TR>
              <TH>{L.number}</TH>
              <TH>{L.direction}</TH>
              <TH>{L.contact}</TH>
              <TH>{L.dueDate}</TH>
              <TH className="text-right">{L.amount}</TH>
              <TH>{d.common.status}</TH>
              <TH className="text-right">{d.common.actions}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={7} label={L.empty} />}
            {rows.map((c) => (
              <TR key={c.id}>
                <TD>
                  <span className="font-mono text-xs text-ink-800">{c.cheque_number}</span>
                  {c.bank_name && <span className="block text-xxs text-ink-400">{c.bank_name}</span>}
                </TD>
                <TD className="text-ink-600">{c.direction === 'receive' ? L.dReceive : L.dPay}</TD>
                <TD className="text-ink-700">{c.contact_name || '—'}</TD>
                <TD className="whitespace-nowrap text-ink-600">
                  {localeDate(c.due_date, locale)}
                  {c.status === 'pending' && c.days_late > 0 && (
                    <span className="ml-1.5 inline-flex items-center gap-0.5 text-xxs text-amber-700">
                      <AlertTriangle className="h-3 w-3" strokeWidth={2} />
                      {L.daysLate.replace('{n}', String(c.days_late))}
                    </span>
                  )}
                </TD>
                <TD className="text-right tabular-nums font-medium text-ink-900">{money(c.amount)}</TD>
                <TD>
                  <span className={cn('chip', TONE[c.status])}>{st[c.status] || c.status}</span>
                  {c.status === 'cleared' && c.cleared_date && (
                    <span className="block text-xxs text-ink-400">
                      {L.clearedOn} {localeDate(c.cleared_date, locale)}
                    </span>
                  )}
                  {c.bounce_reason && <span className="block truncate text-xxs text-rose-600">{c.bounce_reason}</span>}
                </TD>
                <TD className="text-right">
                  {c.status === 'pending' && (
                    <ChequeActions
                      id={c.id}
                      channels={bankish.map((x: any) => ({ id: x.id, label: `${x.code} · ${x.name}` }))}
                      d={d}
                      canEdit={canEdit}
                    />
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-ink-400">{L.warnHint}</p>
    </>
  );
}
