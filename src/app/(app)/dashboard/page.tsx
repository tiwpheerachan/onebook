import Link from 'next/link';
import { requireSession, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card, CardHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { firstDayOfMonth, lastDayOfMonth, localeDate, money } from '@/lib/format';
import { SLUG_BY_KIND } from '@/lib/constants';
import { FileText, ShoppingCart, UserPlus, BookOpen } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({ searchParams }: { searchParams: { from?: string; to?: string; denied?: string } }) {
  const ctx = await requireSession();
  const d = t();
  const locale = currentLocale();
  const supabase = createClient();

  const from = searchParams.from || firstDayOfMonth();
  const to = searchParams.to || lastDayOfMonth();

  // ยิงพร้อมกัน : สรุปตัวเลขกับรายการเอกสารล่าสุดไม่ขึ้นต่อกัน
  const [{ data: stats }, { data: recent }] = await Promise.all([
    supabase.rpc('rpt_dashboard', { p_company: ctx.company.id, p_from: from, p_to: to }),
    supabase
      .from('documents')
      .select('id, kind, doc_number, doc_date, grand_total, status, contact_id, contacts(name)')
      .eq('company_id', ctx.company.id)
      .order('created_at', { ascending: false })
      .limit(8),
  ]);
  const s = (stats || {}) as any;

  const profit = Number(s.revenue || 0) - Number(s.expense || 0);

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
        subtitle={`${ctx.company.name_th} · ${localeDate(from, locale)} – ${localeDate(to, locale)}`}
      />

      {searchParams.denied && (
        <div className="mb-5 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {d.security.noPermission} ({searchParams.denied})
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={d.dash.revenue} value={Number(s.revenue || 0)} suffix={d.common.baht} tone="brand" />
        <StatCard label={d.dash.expense} value={Number(s.expense || 0)} suffix={d.common.baht} />
        <StatCard label={d.dash.profit} value={profit} suffix={d.common.baht} tone={profit >= 0 ? 'positive' : 'negative'} />
        <StatCard label={d.dash.cash} value={Number(s.cash_balance || 0)} suffix={d.common.baht} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={d.dash.ar} value={Number(s.ar_outstanding || 0)} suffix={d.common.baht} />
        <StatCard label={d.dash.ap} value={Number(s.ap_outstanding || 0)} suffix={d.common.baht} />
        <StatCard label={d.dash.vatPayable} value={Number(s.vat_payable || 0)} suffix={d.common.baht} />
        <StatCard
          label={d.dash.overdueDocs}
          value={String(s.doc_overdue ?? 0)}
          isCurrency={false}
          tone={Number(s.doc_overdue || 0) > 0 ? 'negative' : 'neutral'}
          hint={`${d.dash.draftDocs}: ${s.doc_draft ?? 0}`}
        />
      </div>

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
              const section = slug && ['bills','expenses','purchase-orders','purchase-requests','goods-receipts','purchase-credit-notes','purchase-debit-notes','deposit-payments'].includes(slug) ? 'purchase' : 'sales';
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
