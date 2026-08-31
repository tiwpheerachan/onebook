import Link from 'next/link';
import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader } from '@/components/ui/page-header';
import { SearchBox } from '@/components/forms/search-box';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { VatMonthEditor } from '@/components/forms/vat-month-editor';
import { docKindLabel, docHref } from '@/lib/search-meta';
import { localeDate, money, currencyLabel } from '@/lib/format';
import { cn } from '@/lib/cn';
import { AlertTriangle, PauseCircle, CalendarClock } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function VatPendingPage({
  searchParams,
}: {
  searchParams: { f?: string; q?: string };
}) {
  const ctx = await requirePermission('tax', 'view');
  const d = t();
  const L = d.ui.vatPending;
  const locale = currentLocale();
  const canEdit = can(ctx, 'tax', 'edit');
  const filter = searchParams.f || 'all';

  const supabase = createClient();
  const { data } = await supabase.rpc('rpt_vat_pending', {
    p_company: ctx.company.id,
    p_filter: filter,
    p_q: searchParams.q || null,
  });

  const res = (data || {}) as any;
  const rows = (res.rows || []) as any[];
  const sum = (res.summary || {}) as Record<string, number>;

  const TABS = [
    { key: 'all', label: L.all, n: sum.count },
    { key: 'deferred', label: L.deferred, n: sum.deferred },
    { key: 'moved', label: L.moved, n: sum.moved },
  ];

  const link = (f: string) => {
    const p = new URLSearchParams();
    if (f !== 'all') p.set('f', f);
    if (searchParams.q) p.set('q', searchParams.q);
    const s = p.toString();
    return s ? `/tax/pending?${s}` : '/tax/pending';
  };

  return (
    <>
      <PageHeader
        title={L.title}
        subtitle={`${ctx.company.name_th} · ${L.subtitle} · ${currencyLabel(ctx.company.base_currency, locale)}`}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="card p-4">
          <p className="text-xxs uppercase tracking-wide text-ink-400">{L.count}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-ink-900">{sum.count ?? 0}</p>
        </div>
        <div className="card p-4">
          <p className="text-xxs uppercase tracking-wide text-ink-400">{d.doc.vatBase}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-ink-900">{money(sum.base_total)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xxs uppercase tracking-wide text-ink-400">{L.vatTotal}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-brand-700">{money(sum.vat_total)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xxs uppercase tracking-wide text-ink-400">{d.doc.grandTotal}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-ink-900">{money(sum.gross_total)}</p>
        </div>
        <div className={cn('card p-4', Number(sum.over_six || 0) > 0 && 'ring-1 ring-inset ring-amber-300')}>
          <p className="text-xxs uppercase tracking-wide text-ink-400">{L.overSix}</p>
          <p className={cn('mt-1 text-lg font-semibold tabular-nums',
            Number(sum.over_six || 0) > 0 ? 'text-amber-700' : 'text-ink-900')}>
            {sum.over_six ?? 0}
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((tb) => (
          <Link
            key={tb.key}
            href={link(tb.key)}
            className={cn('chip transition',
              filter === tb.key
                ? 'bg-brand-600 text-white ring-brand-600'
                : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50')}
          >
            {tb.label} · {tb.n ?? 0}
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
              <TH>{L.docNumber}</TH>
              <TH>{L.docDate}</TH>
              <TH>{L.vendor}</TH>
              <TH className="text-right">{L.base}</TH>
              <TH className="text-right">{L.vat}</TH>
              <TH className="text-right">{d.doc.grandTotal}</TH>
              <TH>{L.taxMonth}</TH>
              <TH className="text-right">{d.common.actions}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={8} label={L.empty} />}

            {rows.map((r) => (
              <TR key={r.id}>
                <TD>
                  <Link href={docHref(r.kind, r.id)} className="font-mono text-xs text-brand-700 hover:underline">
                    {r.doc_number}
                  </Link>
                  <span className="block text-xxs text-ink-400">{docKindLabel(d, r.kind)}</span>
                  {/* ตั้งบิลจากใบแจ้งหนี้ เลขที่ใบกำกับจึงเป็นคนละเลขกับเลขที่เอกสาร */}
                  {r.tax_invoice_number && (
                    <span className="block font-mono text-xxs text-ink-500">
                      {L.taxInvoiceNo} {r.tax_invoice_number}
                    </span>
                  )}
                </TD>
                <TD className="whitespace-nowrap text-ink-600">
                  {localeDate(r.tax_invoice_date || r.doc_date, locale)}
                  {r.months_aged > 6 && (
                    <span
                      title={L.sixMonthWarn}
                      className="ml-1.5 inline-flex items-center gap-0.5 text-xxs text-amber-700"
                    >
                      <AlertTriangle className="h-3 w-3" strokeWidth={2} />{r.months_aged}
                    </span>
                  )}
                </TD>
                <TD>
                  <span className="truncate text-ink-700">{r.contact_name || '—'}</span>
                  {r.tax_id && <span className="block font-mono text-xxs text-ink-400">{r.tax_id}</span>}
                </TD>
                <TD className="text-right tabular-nums text-ink-600">{money(r.vat_base)}</TD>
                <TD className="text-right tabular-nums text-brand-700">{money(r.vat_amount)}</TD>
                <TD className="text-right tabular-nums font-medium text-ink-900">
                  {money(Number(r.vat_base || 0) + Number(r.vat_amount || 0))}
                </TD>
                <TD>
                  {r.vat_deferred ? (
                    <span className="chip bg-ink-100 text-ink-600 ring-ink-200">
                      <PauseCircle className="mr-1 h-3 w-3" strokeWidth={2} />{L.deferred}
                    </span>
                  ) : r.vat_tax_month ? (
                    <span className="chip bg-sky-50 text-sky-700 ring-sky-200">
                      <CalendarClock className="mr-1 h-3 w-3" strokeWidth={2} />
                      {String(r.vat_tax_month).slice(0, 7)}
                    </span>
                  ) : (
                    <span className="text-xxs text-ink-400">{L.pending}</span>
                  )}
                  {r.vat_note && <span className="block truncate text-xxs text-ink-400">{r.vat_note}</span>}
                </TD>
                <TD className="text-right">
                  <VatMonthEditor
                    row={{
                      id: r.id, doc_number: r.doc_number, doc_date: r.doc_date,
                      contact_name: r.contact_name, vat_amount: r.vat_amount,
                      vat_deferred: r.vat_deferred, vat_tax_month: r.vat_tax_month,
                      vat_note: r.vat_note, months_aged: r.months_aged,
                      tax_invoice_number: r.tax_invoice_number,
                      tax_invoice_date: r.tax_invoice_date,
                    }}
                    d={d}
                    canEdit={canEdit}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-ink-400">{L.sixMonthNote}</p>
    </>
  );
}
