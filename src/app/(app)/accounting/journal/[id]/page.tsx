import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PrintButton } from '@/components/ui/print-button';
import { localeDate, money } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function JournalDetail({ params }: { params: { id: string } }) {
  const ctx = await requirePermission('journal', 'view');
  const d = t();
  const locale = currentLocale();
  const supabase = createClient();

  const { data: entry } = await supabase.from('journal_entries').select('*').eq('id', params.id).maybeSingle();
  if (!entry) notFound();
  const { data: lines } = await supabase
    .from('journal_lines')
    .select('*, accounts(code, name_th), contacts(name)')
    .eq('entry_id', params.id).order('line_no');
  const rows = (lines || []) as any[];

  return (
    <>
      <PageHeader
        title={`${d.nav.journal} ${entry.entry_number}`}
        subtitle={`${ctx.company.name_th} · ${localeDate(entry.entry_date, locale)}`}
        breadcrumb={[{ label: d.nav.accounting }, { label: d.nav.journal, href: '/accounting/journal' }, { label: entry.entry_number }]}
        action={<>
          <Badge tone={entry.status === 'posted' ? 'success' : 'danger'}>{entry.status}</Badge>
          <PrintButton label={d.common.print} />
        </>}
      />
      <Card>
        <div className="border-b border-ink-200 px-5 py-4 text-sm text-ink-600">{entry.description}</div>
        <Table>
          <THead>
            <TR><TH>#</TH><TH>รหัสบัญชี</TH><TH>ชื่อบัญชี</TH><TH>คำอธิบาย</TH><TH>คู่ค้า</TH>
              <TH align="right">เดบิต</TH><TH align="right">เครดิต</TH></TR>
          </THead>
          <TBody>
            {rows.map((l) => (
              <TR key={l.id}>
                <TD className="text-ink-400">{l.line_no}</TD>
                <TD><span className="font-mono text-xs">{l.accounts?.code}</span></TD>
                <TD>{l.accounts?.name_th}</TD>
                <TD className="text-ink-600"><span className="block truncate max-w-[20rem]">{l.description}</span></TD>
                <TD className="text-ink-600">{l.contacts?.name || '–'}</TD>
                <TD align="right">{Number(l.debit) ? money(l.debit) : '–'}</TD>
                <TD align="right">{Number(l.credit) ? money(l.credit) : '–'}</TD>
              </TR>
            ))}
          </TBody>
          <tfoot className="bg-ink-50 font-medium">
            <tr>
              <td className="td-cell" colSpan={5}>{d.common.total}</td>
              <td className="td-cell num">{money(entry.total_debit)}</td>
              <td className="td-cell num">{money(entry.total_credit)}</td>
            </tr>
          </tfoot>
        </Table>
      </Card>
    </>
  );
}
