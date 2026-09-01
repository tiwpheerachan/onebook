import Link from 'next/link';
import { requireSession, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card, CardHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { firstDayOfMonth, lastDayOfMonth, localeDate, money, currencyLabel } from '@/lib/format';
import { SLUG_BY_KIND } from '@/lib/constants';
import { isPurchase } from '@/components/documents/doc-meta';
import { FileText, ShoppingCart, UserPlus, BookOpen, BellRing, AlertTriangle } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({ searchParams }: { searchParams: { from?: string; to?: string; denied?: string } }) {
  const ctx = await requireSession();
  const d = t();
  const locale = currentLocale();
  const supabase = createClient();

  const from = searchParams.from || firstDayOfMonth();
  const to = searchParams.to || lastDayOfMonth();

  // ยิงพร้อมกัน : สรุปตัวเลขกับรายการเอกสารล่าสุดไม่ขึ้นต่อกัน
  const seesContacts = can(ctx, 'contacts', 'view');
  const seesReport = can(ctx, 'report', 'view');
  const [{ data: stats }, { data: recent }, { data: cycles }, { data: kpi }, { data: unread }] = await Promise.all([
    supabase.rpc('rpt_dashboard', { p_company: ctx.company.id, p_from: from, p_to: to }),
    supabase
      .from('documents')
      .select('id, kind, doc_number, doc_date, grand_total, status, contact_id, contacts(name)')
      .eq('company_id', ctx.company.id)
      .order('created_at', { ascending: false })
      .limit(8),
    // ลูกค้าที่หลุดรอบหรือใกล้หลุด — เตือนตั้งแต่หน้าแรกก่อนจะสายเกินไป
    seesContacts
      ? supabase.rpc('rpt_customer_cycles', {
          p_company: ctx.company.id, p_filter: 'overdue', p_q: null, p_limit: 5,
        })
      : Promise.resolve({ data: null }),
    // ตัวชี้วัดสุขภาพกิจการ ดึงจากตัวเดียวกับหน้ารายงาน ไม่คำนวณซ้ำ
    seesReport
      ? supabase.rpc('rpt_kpi', { p_company: ctx.company.id, p_from: from, p_to: to })
      : Promise.resolve({ data: null }),
    supabase.rpc('rpt_unread_count', { p_company: ctx.company.id }),
  ]);
  const s = (stats || {}) as any;

  const profit = Number(s.revenue || 0) - Number(s.expense || 0);
  const profitPrev = Number(s.revenue_prev || 0) - Number(s.expense_prev || 0);
  const k = (kpi || {}) as any;
  const cur = currencyLabel(ctx.company.base_currency, locale);

  /** สัดส่วนการเปลี่ยนแปลง คืน null เมื่องวดก่อนเป็นศูนย์ เพราะหารไม่ได้ */
  const delta = (now: number, prev: number) =>
    Math.abs(prev) < 0.005 ? null : (now - prev) / Math.abs(prev);

  // สิ่งที่ต้องลงมือทำ รวมไว้แถบเดียว ไม่ปนกับตัวเลขผลประกอบการ
  const attention = [
    { n: Number(s.doc_overdue || 0), label: d.ui.dashUi.overdueDocs, href: '/reports/ar-aging' },
    { n: Number(s.awaiting_approval || 0), label: d.ui.dashUi.awaitingApproval, href: '/approvals' },
    { n: Number(unread || 0), label: d.ui.dashUi.unreadAlerts, href: '/notifications' },
    { n: Number(s.doc_draft || 0), label: d.ui.dashUi.draftDocs, href: '/documents/library' },
  ].filter((x) => x.n > 0);

  const cyc = (cycles || {}) as any;
  const cycleRows = (cyc.rows || []) as any[];
  const cycleSummary = (cyc.summary || {}) as Record<string, number>;

  const quick = [
    { href: '/sales/tax-invoices?new=1', label: d.nav.taxInvoices, icon: FileText, resource: 'documents' },
    { href: '/purchase/expenses?new=1', label: d.nav.expenses, icon: ShoppingCart, resource: 'documents' },
    { href: '/contacts?new=1', label: d.nav.contacts, icon: UserPlus, resource: 'contacts' },
    { href: '/accounting/journal?new=1', label: d.nav.journal, icon: BookOpen, resource: 'journal' },
  ].filter((q) => can(ctx, q.resource, 'create'));

  return (
    <>
      <PageHeader
        title={d.nav.dashboard}
        subtitle={`${ctx.company.name_th} · ${localeDate(from, locale)} – ${localeDate(to, locale)} · ${cur}`}
      />

      {searchParams.denied && (
        <div className="mb-5 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {d.security.noPermission} ({searchParams.denied})
        </div>
      )}

      {attention.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 ring-1 ring-inset ring-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" strokeWidth={2} />
          <span className="text-sm font-medium text-amber-900">{d.ui.dashUi.needAttention}</span>
          {attention.map((a) => (
            <Link key={a.label} href={a.href}
                  className="chip bg-white text-amber-900 ring-amber-300 transition hover:bg-amber-100">
              {a.label} <b className="ml-1 tabular-nums">{a.n}</b>
            </Link>
          ))}
        </div>
      )}

      {cycleRows.length > 0 && (
        <div className="mb-5 card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-ink-200 px-5 py-3">
            <BellRing className="h-4 w-4 text-amber-500" strokeWidth={1.8} />
            <h2 className="text-sm font-semibold text-ink-900">{d.ui.cycles.insight}</h2>
            <span className="chip bg-rose-50 text-rose-700 ring-rose-200">
              {cycleSummary.overdue ?? 0}
            </span>
            <Link href="/contacts/cycles?f=overdue" className="ml-auto text-xs text-brand-600 hover:underline">
              {d.ui.cycles.insightMore}
            </Link>
          </div>
          <ul className="divide-y divide-ink-100">
            {cycleRows.map((c: any) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm text-ink-800">{c.name}</span>
                <span className="text-xxs text-ink-500">
                  {d.ui.cycles.lastOrder} {c.last_order ? localeDate(c.last_order, locale) : '—'}
                </span>
                <span className="chip bg-rose-50 text-rose-700 ring-rose-200">
                  {d.ui.cycles.daysLate.replace('{n}', String(c.days_late))}
                </span>
                {can(ctx, 'documents', 'create') && (
                  <Link
                    href={`/sales/invoices?new=1&contact=${c.id}`}
                    className="text-xs text-brand-600 hover:underline"
                  >
                    {d.ui.cycles.createDoc}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* สามตัวนี้คือผลประกอบการ ให้น้ำหนักมากกว่าตัวอื่น */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard size="lg" href="/reports/profit-loss"
          label={d.dash.revenue} value={Number(s.revenue || 0)} tone="brand"
          delta={delta(Number(s.revenue || 0), Number(s.revenue_prev || 0))}
          deltaLabel={d.ui.dashUi.vsPrev} />
        <StatCard size="lg" href="/reports/profit-loss"
          label={d.dash.expense} value={Number(s.expense || 0)}
          delta={delta(Number(s.expense || 0), Number(s.expense_prev || 0))}
          deltaLabel={d.ui.dashUi.vsPrev} />
        <StatCard size="lg" href="/reports/profit-loss"
          label={d.dash.profit} value={profit}
          tone={profit >= 0 ? 'positive' : 'negative'}
          delta={delta(profit, profitPrev)} deltaLabel={d.ui.dashUi.vsPrev} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={d.dash.cash} value={Number(s.cash_balance || 0)} href="/finance" />
        <StatCard label={d.dash.ar} value={Number(s.ar_outstanding || 0)} href="/reports/ar-aging" />
        <StatCard label={d.dash.ap} value={Number(s.ap_outstanding || 0)} href="/reports/ap-aging" />
        <StatCard label={d.dash.vatPayable} value={Number(s.vat_payable || 0)} href="/tax/pp30" />
      </div>

      {/* ตัวชี้วัดสุขภาพกิจการ — ตัวเลขที่บอกทิศทาง ไม่ใช่แค่ยอดคงเหลือ */}
      {seesReport && k.dso != null && (
        <div className="mt-4">
          <p className="section-title mb-2">{d.ui.dashUi.health}</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard isCurrency={false} href="/reports/kpi"
              label={d.ui.kpi.grossMargin}
              value={k.gross_margin == null ? '–' : `${k.gross_margin}%`} />
            <StatCard isCurrency={false} href="/reports/kpi"
              label={d.ui.kpi.dso} value={`${k.dso} ${d.ui.kpi.days}`} />
            <StatCard isCurrency={false} href="/reports/kpi"
              label={d.ui.kpi.ccc}
              value={k.cash_conversion_cycle == null ? '–' : `${k.cash_conversion_cycle} ${d.ui.kpi.days}`} />
            <StatCard isCurrency={false} href="/reports/credit-watch"
              label={d.ui.kpi.arOverdue}
              value={k.ar_overdue_pct == null ? '–' : `${k.ar_overdue_pct}%`}
              tone={Number(k.ar_overdue_pct || 0) > 25 ? 'negative' : 'neutral'} />
          </div>
        </div>
      )}

      {quick.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {quick.map((q) => (
            <Link key={q.href} href={q.href} className="btn-secondary">
              <q.icon className="h-4 w-4 text-ink-400" strokeWidth={1.8} />
              {q.label}
            </Link>
          ))}
        </div>
      )}

      <Card className="mt-6">
        <CardHeader title={d.dash.recentDocs} />
        <Table>
          <THead>
            <TR>
              <TH>{d.doc.number}</TH>
              <TH>{d.common.date}</TH>
              <TH>{d.doc.contact}</TH>
              <TH align="right">{d.common.amount}</TH>
              <TH>{d.common.status}</TH>
            </TR>
          </THead>
          <TBody>
            {(recent || []).length === 0 && <EmptyRow colSpan={5} label={d.common.noData} />}
            {(recent || []).map((r: any) => {
              const slug = SLUG_BY_KIND[r.kind];
              const section = isPurchase(slug) ? 'purchase' : 'sales';
              return (
                <TR key={r.id}>
                  <TD>
                    <Link href={`/${section}/${slug}/${r.id}`} className="font-medium text-brand-700 hover:underline">
                      {r.doc_number}
                    </Link>
                  </TD>
                  <TD>{localeDate(r.doc_date, locale)}</TD>
                  <TD>{r.contacts?.name || '-'}</TD>
                  <TD align="right">{money(r.grand_total)}</TD>
                  <TD><StatusBadge status={r.status} label={(d.status as any)[r.status]} /></TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
