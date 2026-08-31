import Link from 'next/link';
import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { money, currencyLabel } from '@/lib/format';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

interface Row {
  contact_id: string; code: string; name: string;
  credit_limit: number; outstanding: number; available: number;
  used_ratio: number; over: boolean;
}

export default async function CreditWatchPage() {
  const ctx = await requirePermission('report', 'view');
  const d = t();
  const L = d.ui.credit;
  const locale = currentLocale();

  const supabase = createClient();
  const { data } = await supabase.rpc('rpt_credit_watch', {
    p_company: ctx.company.id, p_threshold: 0.8,
  });
  const rows = (data || []) as Row[];

  return (
    <>
      <PageHeader
        title={L.watchTitle}
        subtitle={`${ctx.company.name_th} · ${L.watchSubtitle} · ${currencyLabel(ctx.company.base_currency, locale)}`}
      />

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>{d.doc.contact}</TH>
              <TH align="right">{L.limit}</TH>
              <TH align="right">{L.outstanding}</TH>
              <TH align="right">{L.available}</TH>
              <TH align="right">{L.used}</TH>
              <TH>{d.common.status}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={6} label={L.watchEmpty} />}
            {rows.map((r) => (
              <TR key={r.contact_id}>
                <TD>
                  <Link href={`/contacts?q=${encodeURIComponent(r.code)}`}
                        className="font-medium text-brand-700 hover:underline">
                    {r.name}
                  </Link>
                  <span className="block font-mono text-xxs text-ink-400">{r.code}</span>
                </TD>
                <TD align="right">{money(r.credit_limit)}</TD>
                <TD align="right" className="text-ink-600">{money(r.outstanding)}</TD>
                <TD align="right" className={cn('font-medium', r.over ? 'text-rose-600' : 'text-ink-900')}>
                  {money(r.available)}
                </TD>
                <TD align="right" className="text-ink-500">
                  {(Number(r.used_ratio || 0) * 100).toFixed(0)}%
                </TD>
                <TD>
                  {r.over
                    ? <Badge tone="danger">{L.over}</Badge>
                    : <Badge tone="warn">{L.near}</Badge>}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
