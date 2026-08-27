import Link from 'next/link';
import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { NewReservation, ReleaseButtons } from '@/components/forms/reservation-panel';
import { localeDate } from '@/lib/format';
import { cn } from '@/lib/cn';
import { AlertTriangle } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ReservationsPage() {
  const ctx = await requirePermission('products.inventory', 'view');
  const d = t();
  const L = d.ui.reserve;
  const locale = currentLocale();
  const canEdit = can(ctx, 'products.inventory', 'edit');
  const supabase = createClient();

  const [{ data }, { data: products }, { data: whs }] = await Promise.all([
    supabase.rpc('rpt_reservations', { p_company: ctx.company.id, p_only_active: true }),
    supabase.from('products').select('id, sku, name')
      .eq('company_id', ctx.company.id).eq('track_inventory', true).eq('is_active', true)
      .order('sku').limit(500),
    supabase.from('warehouses').select('id, code, name')
      .eq('company_id', ctx.company.id).eq('is_active', true).order('sort_order').order('code'),
  ]);

  const rows = (data || []) as any[];

  return (
    <>
      <PageHeader
        title={L.title}
        subtitle={`${ctx.company.name_th} · ${L.subtitle}`}
        action={
          <NewReservation
            products={(products || []).map((p: any) => ({ id: p.id, label: `${p.sku} · ${p.name}` }))}
            warehouses={(whs || []).map((w: any) => ({ id: w.id, label: `${w.code} · ${w.name}` }))}
            d={d}
            canEdit={canEdit}
          />
        }
      />

      <div className="card overflow-hidden">
        <Table>
          <THead>
            <TR>
              <TH>{L.product}</TH>
              <TH>{L.warehouse}</TH>
              <TH className="text-right">{L.qty}</TH>
              <TH>{L.document}</TH>
              <TH>{L.expires}</TH>
              <TH className="text-right">{d.common.actions}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={6} label={L.empty} />}
            {rows.map((r) => (
              <TR key={r.id} className={cn(r.expired && 'bg-amber-50/40')}>
                <TD>
                  <span className="font-mono text-xs text-ink-500">{r.sku}</span>
                  <span className="ml-2 text-ink-800">{r.product_name}</span>
                  {r.note && <span className="block truncate text-xxs text-ink-400">{r.note}</span>}
                </TD>
                <TD className="text-ink-600">{r.warehouse_code}</TD>
                <TD className="text-right tabular-nums font-medium text-ink-900">
                  {Number(r.qty).toLocaleString()} <span className="text-xxs text-ink-400">{r.unit}</span>
                </TD>
                <TD>
                  {r.document_id ? (
                    <Link href={`/documents/trace/${r.document_id}`} className="font-mono text-xs text-brand-700 hover:underline">
                      {r.doc_number}
                    </Link>
                  ) : <span className="text-xxs text-ink-400">—</span>}
                  {r.contact_name && <span className="block truncate text-xxs text-ink-400">{r.contact_name}</span>}
                </TD>
                <TD className="whitespace-nowrap text-ink-600">
                  {r.expires_at ? localeDate(r.expires_at, locale) : '—'}
                  {r.expired && (
                    <span className="ml-1.5 inline-flex items-center gap-0.5 text-xxs text-amber-700">
                      <AlertTriangle className="h-3 w-3" strokeWidth={2} />{L.expired}
                    </span>
                  )}
                </TD>
                <TD className="text-right"><ReleaseButtons id={r.id} d={d} canEdit={canEdit} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-ink-400">{L.hint}</p>
    </>
  );
}
