import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader } from '@/components/ui/page-header';
import { LandedCostEditor } from '@/components/forms/landed-cost-panel';
import { localeDate } from '@/lib/format';
import { ChevronLeft, BookOpen } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function LandedCostPage({ params }: { params: { id: string } }) {
  const ctx = await requirePermission('products.inventory', 'view');
  const d = t();
  const L = d.ui.landed;
  const locale = currentLocale();
  const supabase = createClient();

  const { data: lc } = await supabase
    .from('landed_costs')
    .select('*, documents(doc_number, doc_date)')
    .eq('id', params.id)
    .eq('company_id', ctx.company.id)
    .maybeSingle();
  if (!lc) notFound();

  const [{ data: charges }, { data: baseData }, { data: accounts }] = await Promise.all([
    supabase.from('landed_cost_charges')
      .select('id, description, amount, accounts(code, name_th)')
      .eq('landed_id', params.id).order('created_at'),
    supabase.rpc('rpt_landed_cost_base', {
      p_company: ctx.company.id,
      p_document: (lc as any).source_document_id,
      p_method: (lc as any).method,
    }),
    // บัญชีค่าใช้จ่ายที่ค่าขนส่ง/อากร มักนอนอยู่
    supabase.from('accounts')
      .select('id, code, name_th, type')
      .eq('company_id', ctx.company.id)
      .in('type', ['cost_of_sales', 'expense', 'other_expense', 'liability'])
      .order('code').limit(300),
  ]);

  const base = (baseData || {}) as any;
  const editable = (lc as any).status === 'draft' && can(ctx, 'products.inventory', 'edit');
  const mt: Record<string, string> = { value: L.mValue, qty: L.mQty, weight: L.mWeight };

  return (
    <>
      <Link href="/inventory/landed-costs" className="mb-3 inline-flex items-center gap-1 text-xs text-ink-500 hover:text-brand-600">
        <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} /> {L.back}
      </Link>

      <PageHeader
        title={`${L.title} · ${(lc as any).doc_number}`}
        subtitle={`${L.sourceDoc} ${(lc as any).documents?.doc_number || '—'} · ${mt[(lc as any).method]} · ${localeDate((lc as any).doc_date, locale)}`}
      />

      <LandedCostEditor
        landedId={params.id}
        charges={(charges || []) as any[]}
        base={(base.rows || []) as any[]}
        totalBasis={Number(base.total_basis || 0)}
        accounts={(accounts || []).map((a: any) => ({ id: a.id, label: `${a.code} ${a.name_th}` }))}
        editable={editable}
        d={d}
      />

      {(lc as any).journal_entry_id && (
        <Link
          href={`/accounting/journal/${(lc as any).journal_entry_id}`}
          className="mt-4 inline-flex items-center gap-1 text-xxs text-brand-600 hover:underline"
        >
          <BookOpen className="h-3 w-3" strokeWidth={2} /> {L.journal}
        </Link>
      )}
    </>
  );
}
