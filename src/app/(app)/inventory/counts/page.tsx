import Link from 'next/link';
import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { OpenCount } from '@/components/forms/stock-count-sheet';
import { localeDate } from '@/lib/format';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

const TONE: Record<string, string> = {
  counting: 'bg-amber-50 text-amber-700 ring-amber-200',
  confirmed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cancelled: 'bg-ink-100 text-ink-500 ring-ink-200',
  draft: 'bg-ink-100 text-ink-600 ring-ink-200',
};

export default async function StockCountsPage() {
  const ctx = await requirePermission('products.inventory', 'view');
  const d = t();
  const L = d.ui.count;
  const locale = currentLocale();
  const supabase = createClient();

  const [{ data: counts }, { data: whs }] = await Promise.all([
    supabase.from('stock_counts')
      .select('*, warehouses(code, name)')
      .eq('company_id', ctx.company.id)
      .order('count_date', { ascending: false })
      .limit(100),
    supabase.from('warehouses').select('id, code, name')
      .eq('company_id', ctx.company.id).eq('is_active', true)
      .order('sort_order').order('code'),
  ]);

  const rows = (counts || []) as any[];
  const statusLabel: Record<string, string> = {
    draft: L.stDraft, counting: L.stCounting, confirmed: L.stConfirmed, cancelled: L.stCancelled,
  };

  return (
    <>
      <PageHeader
        title={L.title}
        subtitle={`${ctx.company.name_th} · ${L.subtitle}`}
        action={
          <OpenCount
            warehouses={(whs || []).map((w: any) => ({ id: w.id, label: `${w.code} · ${w.name}` }))}
            d={d}
            canEdit={can(ctx, 'products.inventory', 'edit')}
          />
        }
      />

      <div className="card overflow-hidden">
        <Table>
          <THead>
            <TR>
              <TH>{L.number}</TH>
              <TH>{L.date}</TH>
              <TH>{L.warehouse}</TH>
              <TH>{L.status}</TH>
              <TH>{d.common.notes}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={5} label={L.empty} />}
            {rows.map((c) => (
              <TR key={c.id}>
                <TD>
                  <Link href={`/inventory/counts/${c.id}`} className="font-mono text-xs text-brand-700 hover:underline">
                    {c.count_number}
                  </Link>
                </TD>
                <TD className="whitespace-nowrap text-ink-600">{localeDate(c.count_date, locale)}</TD>
                <TD className="text-ink-700">{c.warehouses?.code} · {c.warehouses?.name}</TD>
                <TD><span className={cn('chip', TONE[c.status])}>{statusLabel[c.status] || c.status}</span></TD>
                <TD className="text-xs text-ink-500">{c.note || '—'}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </>
  );
}
