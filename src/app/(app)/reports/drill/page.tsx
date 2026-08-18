import Link from 'next/link';
import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { docKindLabel } from '@/lib/search-meta';
import { firstDayOfYear, lastDayOfMonth, localeDate, money } from '@/lib/format';
import { ChevronLeft, Network, FileText, PenLine, Bot } from 'lucide-react';

export const dynamic = 'force-dynamic';

/**
 * เจาะดูที่มาของยอดในงบ
 *
 * ปลายทางของการกดตัวเลขในงบกำไรขาดทุน งบแสดงฐานะการเงิน และงบทดลอง
 * ทุกบรรทัดในนี้ต่อไปยังเอกสารต้นทางได้ และจากเอกสารกดต่อไปดูแผนภาพได้อีกชั้น
 * ครบวง : ยอดในงบ → บรรทัดบัญชี → เอกสาร → แผนภาพทั้งสายธาร
 */
export default async function DrillPage({
  searchParams,
}: {
  searchParams: { code?: string; from?: string; to?: string; back?: string };
}) {
  const ctx = await requirePermission('report', 'view');
  const d = t();
  const L = d.ui.drill;
  const locale = currentLocale();

  const code = searchParams.code || '';
  const from = searchParams.from || firstDayOfYear();
  const to = searchParams.to || lastDayOfMonth();

  const supabase = createClient();
  const { data, error } = await supabase.rpc('rpt_account_drill_by_code', {
    p_company: ctx.company.id, p_code: code, p_from: from, p_to: to,
  });

  if (error || !data) {
    return (
      <>
        <PageHeader title={L.title} subtitle={L.notFound} />
        <Link href={searchParams.back || '/reports/trial-balance'} className="btn-secondary">
          <ChevronLeft className="h-4 w-4" strokeWidth={1.8} /> {L.backToReport}
        </Link>
      </>
    );
  }

  const r = data as any;
  const acc = r.account || {};
  const lines = (r.lines || []) as any[];
  const opening = Number(r.opening || 0);
  const totalDebit = Number(r.total_debit || 0);
  const totalCredit = Number(r.total_credit || 0);
  // ด้านปกติของบัญชีเป็นตัวกำหนดว่าเดบิตทำให้ยอดเพิ่มหรือลด
  const sign = acc.normal_side === 'C' ? -1 : 1;
  const movement = sign * (totalDebit - totalCredit);
  const closing = opening + movement;

  let running = opening;

  return (
    <>
      <PageHeader
        title={`${L.title} · ${acc.code} ${acc.name}`}
        subtitle={`${ctx.company.name_th} · ${localeDate(from, locale)} – ${localeDate(to, locale)} · ${L.subtitle}`}
        breadcrumb={[{ label: d.nav.reports }, { label: L.title }]}
        action={
          <Link href={searchParams.back || '/reports/trial-balance'} className="btn-secondary">
            <ChevronLeft className="h-4 w-4" strokeWidth={1.8} /> {L.backToReport}
          </Link>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: L.opening, value: opening },
          { label: L.totalDebit, value: totalDebit },
          { label: L.totalCredit, value: totalCredit },
          { label: L.closing, value: closing, strong: true },
        ].map((c) => (
          <div key={c.label} className="card p-4">
            <p className="text-xxs uppercase tracking-wide text-ink-400">{c.label}</p>
            <p className={c.strong
              ? 'mt-1 text-lg font-semibold tabular-nums text-brand-700'
              : 'mt-1 text-lg font-semibold tabular-nums text-ink-900'}>
              {money(c.value)}
            </p>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <Table>
          <THead>
            <TR>
              <TH>{d.common.date}</TH>
              <TH>{L.entry}</TH>
              <TH>{L.description}</TH>
              <TH>{L.source}</TH>
              <TH className="text-right">{L.debit}</TH>
              <TH className="text-right">{L.credit}</TH>
              <TH className="text-right">{L.running}</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {lines.length === 0 && <EmptyRow colSpan={8} label={L.empty} />}

            {lines.map((l, i) => {
              running += sign * (Number(l.debit || 0) - Number(l.credit || 0));
              const src = l.source || {};
              const isDoc = src.id && src.kind && src.kind !== 'manual' && src.kind !== 'auto';
              return (
                <TR key={`${l.entry_id}-${i}`}>
                  <TD className="whitespace-nowrap text-ink-600">{localeDate(l.entry_date, locale)}</TD>
                  <TD>
                    <Link
                      href={`/accounting/journal?q=${encodeURIComponent(l.entry_number)}`}
                      className="font-mono text-xs text-brand-700 hover:underline"
                    >
                      {l.entry_number}
                    </Link>
                    <span className="ml-2 text-xxs text-ink-400">{l.book}</span>
                  </TD>
                  <TD>
                    <span className="text-ink-700">{l.description || '—'}</span>
                    {l.contact && <span className="block truncate text-xxs text-ink-400">{l.contact}</span>}
                  </TD>
                  <TD>
                    {isDoc ? (
                      <span className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-ink-400" strokeWidth={1.8} />
                        <span className="font-mono text-xs text-ink-700">{src.doc_number}</span>
                        <span className="text-xxs text-ink-400">{docKindLabel(d, src.kind)}</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xxs text-ink-400">
                        {src.kind === 'auto'
                          ? <><Bot className="h-3.5 w-3.5" strokeWidth={1.8} />{L.auto}</>
                          : <><PenLine className="h-3.5 w-3.5" strokeWidth={1.8} />{L.manual}</>}
                      </span>
                    )}
                  </TD>
                  <TD className="text-right tabular-nums text-ink-700">
                    {Number(l.debit) ? money(l.debit) : '—'}
                  </TD>
                  <TD className="text-right tabular-nums text-ink-700">
                    {Number(l.credit) ? money(l.credit) : '—'}
                  </TD>
                  <TD className="text-right tabular-nums font-medium text-ink-900">{money(running)}</TD>
                  <TD className="text-right">
                    {isDoc && (
                      <Link
                        href={`/documents/trace/${src.id}`}
                        title={d.ui.graph.title}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-500 hover:bg-brand-50 hover:text-brand-700"
                      >
                        <Network className="h-3.5 w-3.5" strokeWidth={1.8} />
                        {L.viewMap}
                      </Link>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </div>
    </>
  );
}
