import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card, CardHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { MonthPicker } from '@/components/forms/month-picker';
import { ExportCsvButton } from '@/components/ui/export-csv';
import { IssueWhtButton, WhtCertActions } from '@/components/forms/wht-cert-actions';
import { localeDate, money } from '@/lib/format';
import { PND_ATTACHMENT_HEADERS } from '@/lib/wht-form';

export const dynamic = 'force-dynamic';

export default async function WhtPage({ searchParams }: { searchParams: { y?: string; m?: string } }) {
  const ctx = await requirePermission('tax', 'view');
  const d = t();
  const L = d.ui.wht;
  const locale = currentLocale();
  const now = new Date();
  const year = Number(searchParams.y) || now.getFullYear();
  const month = Number(searchParams.m) || now.getMonth() + 1;
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const to = new Date(year, month, 0).toISOString().slice(0, 10);
  const supabase = createClient();

  const { data: types } = await supabase.from('wht_types').select('*').order('sort_order');

  const { data: docs } = await supabase
    .from('documents')
    .select('id, doc_number, doc_date, wht_amount, grand_total, kind, contacts(name, tax_id, is_juristic)')
    .eq('company_id', ctx.company.id)
    .gte('doc_date', from).lte('doc_date', to)
    .gt('wht_amount', 0)
    .neq('status', 'void')
    .order('doc_date');
  const rows = (docs || []) as any[];
  const total = rows.reduce((a, r) => a + Number(r.wht_amount || 0), 0);

  const { data: certRows } = await supabase
    .from('wht_certificates')
    .select('id, cert_number, cert_date, pnd_form, document_id, tax_id, base_total, wht_total, status, payee_snapshot')
    .eq('company_id', ctx.company.id)
    .gte('cert_date', from).lte('cert_date', to)
    .order('cert_number');
  const certs = (certRows || []) as any[];
  const certByDoc = new Map(certs.filter((c) => c.status === 'issued').map((c) => [c.document_id, c]));
  const canIssue = can(ctx, 'tax', 'create');
  const canEditTax = can(ctx, 'tax', 'edit');

  return (
    <>
      <PageHeader
        title={d.nav.wht}
        subtitle={`${ctx.company.name_th} · ${L.monthOf.replace('{m}', String(month)).replace('{y}', String(year))}`}
        action={<>
          <MonthPicker year={year} month={month} />
          {can(ctx, 'tax', 'export') && certs.length > 0 && (
            <ExportCsvButton
              label={L.pndAttachment}
              filename={`pnd-attachment-${year}${String(month).padStart(2, '0')}.csv`}
              rows={[
                PND_ATTACHMENT_HEADERS,
                ...certs
                  .filter((c) => c.status === 'issued')
                  .map((c, i) => {
                    const p = c.payee_snapshot || {};
                    const addr = [p.address, p.district, p.province, p.postcode].filter(Boolean).join(' ');
                    return [
                      i + 1, c.tax_id || p.tax_id || '', p.legal_name || p.name || '', addr,
                      c.cert_date, '', '', Number(c.base_total), Number(c.wht_total),
                      1, c.pnd_form, c.cert_number,
                    ];
                  }),
              ]}
            />
          )}
          {can(ctx, 'tax', 'export') && (
            <ExportCsvButton label={d.common.export} filename={`wht-${year}${String(month).padStart(2,'0')}.csv`}
              rows={[[L.date, L.certNo, L.payee, L.taxId, L.form, L.whtAmount],
                ...rows.map((r) => [r.doc_date, r.doc_number, r.contacts?.name, r.contacts?.tax_id,
                  r.contacts?.is_juristic ? 'ภ.ง.ด.53' : 'ภ.ง.ด.3', r.wht_amount])]} />
          )}
        </>}
      />

      <Card className="mb-6">
        <CardHeader title={L.listTitle} description={L.listHint} />
        <Table>
          <THead>
            <TR><TH>{L.date}</TH><TH>{L.docNumber}</TH><TH>{L.payee}</TH><TH>{L.taxId}</TH>
              <TH>{L.form}</TH><TH align="right">{L.docTotal}</TH><TH align="right">{L.whtAmount}</TH>
              <TH align="right">{L.certificate}</TH></TR>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={8} label={d.common.noData} />}
            {rows.map((r) => (
              <TR key={r.id}>
                <TD>{localeDate(r.doc_date, locale)}</TD>
                <TD className="font-mono text-xs">{r.doc_number}</TD>
                <TD><span className="block truncate max-w-[18rem]">{r.contacts?.name || '–'}</span></TD>
                <TD className="font-mono text-xs">{r.contacts?.tax_id || '–'}</TD>
                <TD><Badge tone="brand">{r.contacts?.is_juristic === false ? 'ภ.ง.ด.3' : 'ภ.ง.ด.53'}</Badge></TD>
                <TD align="right">{money(r.grand_total)}</TD>
                <TD align="right" className="font-medium">{money(r.wht_amount)}</TD>
                <TD align="right">
                  {certByDoc.has(r.id) ? (
                    <WhtCertActions
                      certId={certByDoc.get(r.id)!.id}
                      status="issued"
                      canEdit={canEditTax}
                    />
                  ) : (
                    <IssueWhtButton documentId={r.id} canIssue={canIssue} />
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
          <tfoot className="bg-ink-50 font-medium">
            <tr><td className="td-cell" colSpan={6}>{d.common.total}</td>
              <td className="td-cell num">{money(total)}</td><td /></tr>
          </tfoot>
        </Table>
      </Card>

      <Card className="mb-6">
        <CardHeader
          title={L.certTitle}
          description={L.certHint}
        />
        <Table>
          <THead>
            <TR><TH>{L.certNo}</TH><TH>{L.date}</TH><TH>{L.payeeName}</TH><TH>{L.form}</TH>
              <TH align="right">{L.paidAmount}</TH><TH align="right">{L.taxWithheld}</TH><TH>{d.common.status}</TH>
              <TH align="right">{d.common.actions}</TH></TR>
          </THead>
          <TBody>
            {certs.length === 0 && <EmptyRow colSpan={8} label={L.noCerts} />}
            {certs.map((c) => (
              <TR key={c.id}>
                <TD className="font-mono text-xs">{c.cert_number}</TD>
                <TD>{localeDate(c.cert_date, locale)}</TD>
                <TD><span className="block truncate max-w-[18rem]">{(c.payee_snapshot || {}).legal_name || (c.payee_snapshot || {}).name || '–'}</span></TD>
                <TD><Badge tone="brand">{c.pnd_form}</Badge></TD>
                <TD align="right">{money(c.base_total)}</TD>
                <TD align="right" className="font-medium">{money(c.wht_total)}</TD>
                <TD>
                  {c.status === 'issued'
                    ? <Badge tone="success">{L.issued}</Badge>
                    : <Badge tone="danger">{L.cancelled}</Badge>}
                </TD>
                <TD align="right">
                  <WhtCertActions certId={c.id} status={c.status} canEdit={canEditTax} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <Card>
        <CardHeader title={L.ratesTitle} />
        <Table>
          <THead>
            <TR><TH>{L.code}</TH><TH>{L.incomeType}</TH><TH>{L.form}</TH><TH align="right">{L.rate}</TH><TH>{L.appliesTo}</TH></TR>
          </THead>
          <TBody>
            {(types || []).map((w: any) => (
              <TR key={w.code}>
                <TD className="font-mono text-xs">{w.code}</TD>
                <TD>{w.name_th}</TD>
                <TD>{w.pnd_form}</TD>
                <TD align="right">{Number(w.default_rate).toFixed(2)}%</TD>
                <TD className="text-xs text-ink-500">
                  {w.applies_to === 'both' ? L.both : w.applies_to === 'juristic' ? L.juristic : L.individual}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
