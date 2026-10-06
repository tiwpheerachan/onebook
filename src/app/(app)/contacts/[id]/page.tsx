import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, TrendingUp, TrendingDown, AlertTriangle, FileText } from 'lucide-react';
import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ContactFilters } from '@/components/forms/contact-filters';
import { docHref, docKindLabel, contactKindLabel } from '@/lib/search-meta';
import { money, localeDate, toDateStr, firstDayOfYear } from '@/lib/format';
import { SLUG_BY_KIND, STATUS_STYLE, type DocKind } from '@/lib/constants';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

const BUCKETS = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'] as const;
const TABS = ['ledger', 'open', 'payments', 'profile'] as const;
type Tab = (typeof TABS)[number];

interface Row {
  date: string; type: 'document' | 'payment'; id: string; kind: string;
  number: string; due_date: string | null; status: string; side: 'ar' | 'ap' | 'none';
  reference: string | null; notes: string | null;
  total: number; net: number; paid: number; outstanding: number; wht: number;
  fx_currency: string | null; fx_total: number | null;
  is_ledger: boolean; delta: number; bucket: string | null; balance: number;
}

export default async function ContactFilePage({
  params, searchParams,
}: {
  params: { id: string };
  searchParams: Record<string, string | undefined>;
}) {
  const ctx = await requirePermission('contacts', 'view');
  const d = t();
  const L = d.ui.contactFile;
  const T = d.ui.contactTable;
  const locale = currentLocale();
  const supabase = createClient();

  const today = toDateStr(new Date());
  // ค่าตั้งต้นคือตั้งแต่ต้นปีถึงวันนี้ ครอบคลุมรอบบัญชีที่กำลังทำอยู่
  const from = searchParams.from || firstDayOfYear();
  const to = searchParams.to || today;
  const tab: Tab = TABS.includes(searchParams.tab as Tab) ? (searchParams.tab as Tab) : 'ledger';
  const side = ['ar', 'ap'].includes(searchParams.side || '') ? searchParams.side! : 'both';

  const filters: Record<string, unknown> = {};
  if (searchParams.kind) filters.kinds = [searchParams.kind];
  if (searchParams.st) filters.status = searchParams.st;
  if (searchParams.min) filters.min = Number(searchParams.min);
  if (searchParams.max) filters.max = Number(searchParams.max);
  if (searchParams.bucket) filters.bucket = searchParams.bucket;
  if (searchParams.cur) filters.currency = searchParams.cur;
  if (searchParams.q) filters.q = searchParams.q;
  if (searchParams.wht === '1') filters.with_wht = true;
  if (searchParams.none === '0') filters.show_none = false;
  // แท็บเอกสารค้างคือมุมมองเดียวกันที่บังคับตัวกรองไว้ ไม่ต้องมีคิวรีแยก
  if (tab === 'open') { filters.status = 'open'; filters.show_none = false; }

  const [{ data: sum }, { data: stmt }, { data: pays }] = await Promise.all([
    supabase.rpc('rpt_contact_summary', { p_contact: params.id, p_as_of: to }),
    supabase.rpc('rpt_contact_statement', {
      p_contact: params.id, p_from: from, p_to: to, p_side: side, p_filters: filters,
    }),
    tab === 'payments'
      ? supabase.rpc('rpt_contact_payments', { p_contact: params.id, p_from: from, p_to: to })
      : Promise.resolve({ data: [] }),
  ]);

  if (!sum) notFound();

  const s = sum as any;
  const c = s.contact;
  const st = (stmt || { rows: [] }) as any;
  const rows = (st.rows || []) as Row[];
  const net = Number(s.net || 0);
  const usedRatio = Number(c.credit_limit) > 0
    ? Number(s.ar.outstanding) / Number(c.credit_limit) : null;

  const kindLabels = Object.fromEntries(
    Object.keys(SLUG_BY_KIND).map((k) => [k, docKindLabel(d, k)]),
  );

  const tabHref = (x: Tab) => {
    const p = new URLSearchParams(searchParams as Record<string, string>);
    p.set('tab', x);
    return `/contacts/${params.id}?${p.toString()}`;
  };
  const bucketHref = (b: string) => {
    const p = new URLSearchParams(searchParams as Record<string, string>);
    if (p.get('bucket') === b) p.delete('bucket'); else p.set('bucket', b);
    p.set('tab', 'ledger');
    return `/contacts/${params.id}?${p.toString()}`;
  };

  const dayLate = (due: string | null, date: string) => {
    const ref = new Date(due || date);
    return Math.floor((new Date(to).getTime() - ref.getTime()) / 86400000);
  };

  return (
    <>
      <PageHeader
        title={c.name}
        subtitle={`${c.code} · ${contactKindLabel(d, c.kind)}${c.tax_id ? ` · ${c.tax_id}` : ''}`}
        action={
          <span className="flex items-center gap-2">
            <Link href={`/statement/${params.id}?from=${from}&to=${to}`} target="_blank" className="btn-secondary">
              <FileText className="h-4 w-4 text-ink-400" strokeWidth={1.8} />{L.statement}
            </Link>
            <Link href="/contacts" className="btn-secondary">
              <ArrowLeft className="h-4 w-4 text-ink-400" strokeWidth={1.8} />{L.back}
            </Link>
          </span>
        }
      />

      {/* สองฝั่งแยกกันเสมอ ยอดสุทธิเป็นการ์ดที่สามซึ่งจงใจทำให้เบากว่า */}
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="card-pad border-l-4 border-l-brand-500">
          <p className="text-xxs text-ink-500">{L.theyOweUs}</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-ink-900">
            {money(s.ar.outstanding)}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xxs text-ink-500">
            <span>{L.docsOpen.replace('{n}', String(s.ar.doc_count))}</span>
            {Number(s.ar.overdue_count) > 0 && (
              <span className="flex items-center gap-1 font-medium text-rose-600">
                <AlertTriangle className="h-3 w-3" strokeWidth={2} />
                {L.overdue} {s.ar.overdue_count} · {money(s.ar.overdue_amount)}
              </span>
            )}
            {Number(s.ar.deposit) > 0 && <span>{L.deposit} {money(s.ar.deposit)}</span>}
          </p>
          {usedRatio !== null && (
            <p className="mt-2 text-xxs text-ink-500">
              {L.creditUsed} {money(s.ar.outstanding)} / {money(c.credit_limit)}
              <span className={cn('ml-1 font-medium',
                usedRatio >= 1 ? 'text-rose-600' : usedRatio >= 0.8 ? 'text-amber-600' : 'text-ink-600')}>
                ({(usedRatio * 100).toFixed(0)}%)
              </span>
            </p>
          )}
        </Card>

        <Card className="card-pad border-l-4 border-l-amber-500">
          <p className="text-xxs text-ink-500">{L.weOweThem}</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-ink-900">
            {money(s.ap.outstanding)}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xxs text-ink-500">
            <span>{L.docsOpen.replace('{n}', String(s.ap.doc_count))}</span>
            {Number(s.ap.overdue_count) > 0 && (
              <span className="font-medium text-rose-600">
                {L.overdue} {s.ap.overdue_count} · {money(s.ap.overdue_amount)}
              </span>
            )}
            {Number(s.ap.due_soon_count) > 0 && (
              <span className="text-amber-700">
                {L.dueSoon} · {money(s.ap.due_soon_amount)}
              </span>
            )}
            {Number(s.ap.deposit) > 0 && <span>{L.deposit} {money(s.ap.deposit)}</span>}
          </p>
        </Card>

        <Card className="card-pad bg-ink-50/60">
          <p className="text-xxs text-ink-500">{L.net}</p>
          <p className={cn('mt-1 flex items-center gap-1.5 text-2xl font-semibold tabular-nums',
            net > 0 ? 'text-brand-700' : net < 0 ? 'text-amber-700' : 'text-ink-600')}>
            {net > 0 ? <TrendingUp className="h-5 w-5" strokeWidth={2} />
              : net < 0 ? <TrendingDown className="h-5 w-5" strokeWidth={2} /> : null}
            {money(Math.abs(net))}
          </p>
          <p className="mt-0.5 text-xxs font-medium text-ink-600">
            {net > 0 ? L.netTheyOwe : net < 0 ? L.netWeOwe : L.netEven}
          </p>
          <p className="mt-2 text-xxs leading-relaxed text-ink-400">{L.netHint}</p>
        </Card>
      </div>

      {/* แถบอายุหนี้ กดเพื่อกรองตารางด้านล่าง */}
      <Card className="card-pad mb-4">
        <p className="mb-2 text-xxs font-medium text-ink-500">{L.aging}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {BUCKETS.map((b) => {
            const v = Number(s.ar.aging?.[b] || 0) + Number(s.ap.aging?.[b] || 0);
            const active = searchParams.bucket === b;
            const late = b !== 'current' && v !== 0;
            return (
              <Link key={b} href={bucketHref(b)}
                    className={cn('rounded-lg px-3 py-2 text-center transition',
                      active ? 'bg-brand-600 text-white'
                        : late ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                          : 'bg-ink-50 text-ink-600 hover:bg-ink-100')}>
                <p className="text-xxs">{b === 'current' ? L.agingCurrent : (L as Record<string, string>)[b]}</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums">{money(v)}</p>
              </Link>
            );
          })}
        </div>
      </Card>

      <div className="mb-4 flex flex-wrap gap-1 border-b border-ink-200">
        {TABS.map((x) => (
          <Link key={x} href={tabHref(x)}
                className={cn('-mb-px border-b-2 px-3 py-2 text-sm transition',
                  tab === x ? 'border-brand-600 font-medium text-brand-700'
                    : 'border-transparent text-ink-500 hover:text-ink-800')}>
            {x === 'ledger' ? L.tabLedger : x === 'open' ? L.tabOpen
              : x === 'payments' ? L.tabPayments : L.tabProfile}
          </Link>
        ))}
      </div>

      {tab === 'profile' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="card-pad">
            <h2 className="mb-3 text-sm font-semibold text-ink-900">{L.tabProfile}</h2>
            <dl className="grid grid-cols-[9rem_1fr] gap-y-2 text-sm">
              <dt className="text-ink-500">{T.code}</dt><dd className="font-mono text-xs">{c.code}</dd>
              <dt className="text-ink-500">{T.taxId}</dt><dd className="font-mono text-xs">{c.tax_id || '–'}</dd>
              <dt className="text-ink-500">{T.phone}</dt><dd>{c.phone || '–'}</dd>
              <dt className="text-ink-500">{L.email}</dt><dd>{c.email || '–'}</dd>
              <dt className="text-ink-500">{L.person}</dt><dd>{c.contact_person || '–'}</dd>
              <dt className="text-ink-500">{T.credit}</dt><dd>{T.nDays.replace('{n}', String(c.credit_days))}</dd>
              <dt className="text-ink-500">{L.creditLimit}</dt>
              <dd className="tabular-nums">
                {Number(c.credit_limit) > 0 ? money(c.credit_limit) : L.noCreditLimit}
              </dd>
              <dt className="text-ink-500">{L.address}</dt>
              <dd className="leading-relaxed">
                {[c.address, c.district, c.province, c.postcode].filter(Boolean).join(' ') || '–'}
              </dd>
            </dl>
          </Card>

          <Card className="card-pad">
            <h2 className="mb-3 text-sm font-semibold text-ink-900">{L.lifetime}</h2>
            {s.lifetime?.first_doc_date && (
              <p className="mb-3 text-xxs text-ink-500">
                {L.sinceFirst.replace('{date}', localeDate(s.lifetime.first_doc_date, locale))}
              </p>
            )}
            <dl className="grid grid-cols-2 gap-3">
              {[
                [L.salesTotal, s.lifetime?.sales_total], [L.purchaseTotal, s.lifetime?.purchase_total],
                [L.salesYtd, s.lifetime?.sales_ytd], [L.purchaseYtd, s.lifetime?.purchase_ytd],
              ].map(([label, v]) => (
                <div key={String(label)} className="rounded-lg bg-ink-50 px-3 py-2">
                  <dt className="text-xxs text-ink-500">{String(label)}</dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink-900">{money(v as number)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xxs text-ink-500">
              <span>{L.lastReceive} : {s.last_receive ? localeDate(s.last_receive, locale) : L.never}</span>
              <span>{L.lastPay} : {s.last_pay ? localeDate(s.last_pay, locale) : L.never}</span>
            </p>
          </Card>
        </div>
      ) : tab === 'payments' ? (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>{L.date}</TH><TH>{L.document}</TH><TH>{L.channel}</TH>
                <TH>{L.allocatedTo}</TH><TH align="right">{d.common.amount}</TH>
              </TR>
            </THead>
            <TBody>
              {(pays || []).length === 0 && <EmptyRow colSpan={5} label={L.empty} />}
              {((pays || []) as any[]).map((p) => (
                <TR key={p.id}>
                  <TD>{localeDate(p.doc_date, locale)}</TD>
                  <TD>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs">{p.doc_number}</span>
                      <Badge tone={p.direction === 'receive' ? 'success' : 'warn'}>
                        {p.direction === 'receive' ? L.paymentIn : L.paymentOut}
                      </Badge>
                    </span>
                  </TD>
                  <TD className="text-xs text-ink-500">{p.channel || '–'}</TD>
                  <TD>
                    <span className="flex flex-col gap-0.5">
                      {p.allocations.map((a: any) => (
                        <Link key={a.document_id} href={docHref(a.kind as DocKind, a.document_id)}
                              className="font-mono text-xxs text-brand-700 hover:underline">
                          {a.doc_number} · {money(a.amount)}
                        </Link>
                      ))}
                      {Number(p.unallocated) > 0 && (
                        <span className="text-xxs text-amber-700">
                          {L.unallocated} {money(p.unallocated)}
                        </span>
                      )}
                    </span>
                  </TD>
                  <TD align="right" className="font-medium tabular-nums">{money(p.amount)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : (
        <>
          <ContactFilters docKindLabels={kindLabels} />

          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>{L.date}</TH>
                  <TH>{L.document}</TH>
                  <TH>{L.detail}</TH>
                  <TH align="right">{L.increase}</TH>
                  <TH align="right">{L.decrease}</TH>
                  <TH align="right">{tab === 'open' ? L.outstanding : L.balance}</TH>
                </TR>
              </THead>
              <TBody>
                {/* ยอดยกมาโชว์เฉพาะมุมมองเดินบัญชี ซึ่งเป็นมุมมองเดียวที่ยอดสะสมมีความหมาย */}
                {tab === 'ledger' && (
                  <TR className="bg-ink-50/60">
                    <TD>{localeDate(from, locale)}</TD>
                    <TD className="text-xs text-ink-500" colSpan={4}>{L.opening}</TD>
                    <TD align="right" className="font-medium tabular-nums">
                      {money(Number(st.opening?.ar || 0) + Number(st.opening?.ap || 0))}
                    </TD>
                  </TR>
                )}

                {rows.length === 0 && <EmptyRow colSpan={6} label={L.empty} />}

                {rows.map((r) => {
                  const late = r.is_ledger && r.outstanding !== 0
                    && dayLate(r.due_date, r.date) > 0 && r.type === 'document';
                  return (
                    <TR key={`${r.type}-${r.id}`} className={cn(!r.is_ledger && 'bg-ink-50/40')}>
                      <TD>{localeDate(r.date, locale)}</TD>
                      <TD>
                        <span className="flex flex-wrap items-center gap-1.5">
                          {r.type === 'document' ? (
                            <Link href={docHref(r.kind as DocKind, r.id)}
                                  className="font-mono text-xs text-brand-700 hover:underline">
                              {r.number}
                            </Link>
                          ) : (
                            <span className="font-mono text-xs text-ink-700">{r.number}</span>
                          )}
                          <span className={cn('chip',
                            r.side === 'ap' ? 'bg-amber-50 text-amber-700 ring-amber-200'
                              : r.side === 'ar' ? 'bg-brand-50 text-brand-700 ring-brand-200'
                                : 'bg-ink-100 text-ink-500 ring-ink-200')}>
                            {r.type === 'payment'
                              ? (r.kind === 'receive' ? L.paymentIn : L.paymentOut)
                              : kindLabels[r.kind] || r.kind}
                          </span>
                          {!r.is_ledger && (
                            <span className="chip bg-ink-100 text-ink-500 ring-ink-200">{L.notLedger}</span>
                          )}
                        </span>
                      </TD>
                      <TD className="text-xs text-ink-500">
                        <span className="flex flex-wrap items-center gap-2">
                          {r.type === 'document' && (
                            <span className={cn('chip', STATUS_STYLE[r.status] || '')}>
                              {(d.status as Record<string, string>)[r.status] || r.status}
                            </span>
                          )}
                          {r.due_date && (
                            <span>{L.dueDate} {localeDate(r.due_date, locale)}</span>
                          )}
                          {late && (
                            <span className="font-medium text-rose-600">
                              {L.overdueDays.replace('{n}', String(dayLate(r.due_date, r.date)))}
                            </span>
                          )}
                          {r.fx_currency && (
                            <span className="font-mono">{money(r.fx_total || 0)} {r.fx_currency}</span>
                          )}
                          {r.reference && <span className="truncate">{r.reference}</span>}
                        </span>
                      </TD>
                      <TD align="right" className="tabular-nums">
                        {r.delta > 0 ? money(r.delta) : ''}
                      </TD>
                      <TD align="right" className="tabular-nums">
                        {r.delta < 0 ? money(-r.delta) : ''}
                      </TD>
                      <TD align="right" className="font-medium tabular-nums">
                        {tab === 'open'
                          ? money(r.outstanding)
                          : r.is_ledger ? money(r.balance) : <span className="text-ink-300">–</span>}
                      </TD>
                    </TR>
                  );
                })}

                {tab === 'ledger' && rows.length > 0 && (
                  <TR className="bg-ink-50/60 font-medium">
                    <TD colSpan={3}>{L.closing}</TD>
                    <TD align="right" className="tabular-nums">
                      {money(Number(st.totals?.ar_increase || 0) + Number(st.totals?.ap_increase || 0))}
                    </TD>
                    <TD align="right" className="tabular-nums">
                      {money(Number(st.totals?.ar_decrease || 0) + Number(st.totals?.ap_decrease || 0))}
                    </TD>
                    <TD align="right" className="tabular-nums">
                      {money(Number(st.closing?.ar || 0) + Number(st.closing?.ap || 0))}
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}
