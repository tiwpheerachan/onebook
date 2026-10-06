import Link from 'next/link';
import QRCode from 'qrcode';
import { notFound } from 'next/navigation';
import { ArrowLeft, FileText, ExternalLink } from 'lucide-react';
import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card, CardHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { StatCard } from '@/components/ui/stat-card';
import { money, localeDate } from '@/lib/format';
import { buildSchedule } from '@/lib/asset-depreciation';
import { AssetManager } from '@/components/forms/asset-manager';
import { AssetDispose } from '@/components/forms/asset-dispose';

export const dynamic = 'force-dynamic';

const TABS = ['overview', 'accounting', 'depreciation', 'documents', 'history'] as const;
type Tab = (typeof TABS)[number];

export default async function AssetDetailPage({
  params, searchParams,
}: { params: { id: string }; searchParams: { tab?: string } }) {
  const ctx = await requirePermission('accounting.assets', 'view');
  const d = t();
  const locale = currentLocale();
  const tab: Tab = (TABS as readonly string[]).includes(searchParams.tab || '') ? (searchParams.tab as Tab) : 'overview';
  const supabase = createClient();

  const { data: a } = await supabase.from('fixed_assets').select('*').eq('id', params.id).maybeSingle();
  if (!a) notFound();

  const [{ data: accs }, { data: deps }, { data: src }, { data: siblings }] = await Promise.all([
    supabase.from('accounts').select('id, code, name_th').eq('company_id', ctx.company.id).eq('is_active', true).order('code').limit(500),
    supabase.from('asset_depreciations').select('period_end, amount, accum_after, book_value').eq('asset_id', a.id).order('period_end'),
    a.document_id
      ? supabase.from('documents').select('id, doc_number, kind').eq('id', a.document_id).maybeSingle()
      : Promise.resolve({ data: null } as any),
    a.document_id
      ? supabase.from('fixed_assets').select('id, code, name, serial_no').eq('document_id', a.document_id).order('code')
      : Promise.resolve({ data: [] } as any),
  ]);
  let supplier: string | null = null;
  if (a.supplier_id) {
    const { data: c } = await supabase.from('contacts').select('name').eq('id', a.supplier_id).maybeSingle();
    supplier = c?.name ?? null;
  }

  const accById = new Map((accs || []).map((x: any) => [x.id, `${x.code} ${x.name_th}`]));
  const accName = (id?: string | null) => (id ? accById.get(id) || '—' : '—');

  const posted = (deps || []) as any[];
  const schedule = buildSchedule(a, posted);
  const accum = posted.length ? Number(posted[posted.length - 1].accum_after) : Number(a.opening_accum_dep || 0);
  const nbv = Math.round((Number(a.cost) - accum) * 100) / 100;
  const remaining = schedule.filter((r) => !r.posted).length;
  const monthly = a.useful_life_months > 0 ? Math.round(((Number(a.cost) - Number(a.salvage_value)) / a.useful_life_months) * 100) / 100 : 0;
  const endPeriod = schedule.length ? schedule[schedule.length - 1].period : '—';

  const origin = (process.env.APP_ORIGIN || '').replace(/\/+$/, '');
  const qrSvg = await QRCode.toString(`${origin}/scan/${a.id}`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });

  const dd = d.ui.assetDetail;
  const accOptions = (accs || []).map((x: any) => ({ id: x.id, label: `${x.code} ${x.name_th}` }));
  const managerLabels = {
    create: d.assets.create, edit: d.common.edit, save: d.common.save, cancel: d.common.cancel,
    code: d.assets.code, name: d.assets.name, category: d.assets.category, serialNo: d.assets.serialNo, location: d.assets.location,
    acquiredDate: d.assets.acquiredDate, inServiceDate: d.assets.inServiceDate, cost: d.assets.cost, salvage: d.assets.salvage,
    method: d.assets.method, straightLine: d.assets.straightLine, declining: d.assets.declining, noDep: d.assets.noDep,
    lifeMonths: d.assets.lifeMonths, decliningRate: d.assets.decliningRate, openingAccum: d.assets.openingAccum,
    assetAccount: d.assets.assetAccount, accumAccount: d.assets.accumAccount, depExpenseAccount: d.assets.depExpenseAccount,
    auto: d.assets.auto, note: d.common.notes, monthlyPreview: d.assets.monthlyPreview,
  };

  const tabLabel: Record<Tab, string> = {
    overview: dd.tabOverview, accounting: dd.tabAccounting, depreciation: dd.tabDepreciation, documents: dd.tabDocuments, history: dd.tabHistory,
  };

  return (
    <>
      <PageHeader
        title={locale === 'en' && a.name_en ? a.name_en : a.name}
        subtitle={`${a.code} · ${(d.assets.status as any)[a.status] || a.status}`}
        breadcrumb={[
          { label: d.nav.accounting },
          { label: d.nav.assets, href: '/accounting/assets' },
          { label: a.code },
        ]}
        action={
          <>
            <Link href="/accounting/assets" className="btn-secondary"><ArrowLeft className="h-4 w-4" /> {dd.back}</Link>
            {a.status !== 'disposed' && (
              <a href={`/asset-label/${a.id}`} target="_blank" rel="noopener" className="btn-secondary">{d.assets.printLabel}</a>
            )}
            <AssetManager canCreate={false} canEdit={can(ctx, 'accounting.assets', 'edit') && a.status !== 'disposed'} editRow={a} accounts={accOptions} labels={managerLabels} />
            {can(ctx, 'accounting.assets', 'post') && a.status !== 'disposed' && (
              <AssetDispose
                asset={{ id: a.id, code: a.code, name: a.name, book_value: nbv }}
                labels={{ dispose: d.assets.dispose, cancel: d.common.cancel, confirm: d.common.save, disposedDate: d.assets.disposedDate, proceeds: d.assets.proceeds, note: d.common.notes, bookValue: d.assets.bookValue, gain: d.assets.gain, loss: d.assets.loss }}
              />
            )}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={d.assets.cost} value={Number(a.cost)} suffix={d.common.baht} />
        <StatCard label={d.assets.accumDep} value={accum} suffix={d.common.baht} tone="negative" />
        <StatCard label={d.assets.bookValue} value={nbv} suffix={d.common.baht} tone="brand" />
        <StatCard label={dd.remaining} value={remaining} suffix={`/ ${a.useful_life_months} ${dd.months}`} />
      </div>

      {/* แท็บ (ใช้ query param — ไม่ต้องมี client) */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-ink-200">
        {TABS.map((tb) => (
          <Link
            key={tb}
            href={`/accounting/assets/${a.id}?tab=${tb}`}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] ${tb === tab ? 'border-brand-600 font-semibold text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-800'}`}
          >
            {tabLabel[tb]}
          </Link>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
          <div className="space-y-4">
            <Card>
              <div className="p-4">
                <div className="mb-2 text-[12px] font-medium text-ink-500">QR</div>
                <div className="flex items-center gap-3">
                  <div className="rounded border border-ink-200 bg-white p-1.5 [&>svg]:h-[88px] [&>svg]:w-[88px]" dangerouslySetInnerHTML={{ __html: qrSvg }} />
                  <p className="text-[12px] leading-snug text-ink-500">{dd.qrHint}</p>
                </div>
              </div>
            </Card>
          </div>
          <div className="space-y-5">
            <Card>
              <CardHeader title={dd.general} />
              <DL rows={[
                [d.assets.code, a.code], [d.assets.name, a.name], ['EN', a.name_en || '—'],
                [d.assets.category, a.category || '—'], [d.assets.serialNo, a.serial_no || '—'],
                [d.assets.location, a.location || '—'], [dd.supplier, supplier || '—'],
                [d.assets.acquiredDate, localeDate(a.acquired_date, locale)],
                [d.assets.inServiceDate, a.in_service_date ? localeDate(a.in_service_date, locale) : '—'],
              ]} />
            </Card>
            {src && (
              <Card>
                <CardHeader title={dd.source} />
                <div className="px-4 pb-4 text-[13px]">
                  <Link href={`/purchase/${slugOf(src.kind)}/${src.id}`} className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                    <FileText className="h-3.5 w-3.5" /> {src.doc_number} <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </Card>
            )}
            {Array.isArray(siblings) && siblings.length > 1 && (
              <Card>
                <CardHeader title={dd.splitGroup} />
                <div className="flex flex-wrap gap-1.5 px-4 pb-4">
                  {siblings.map((s: any, i: number) => (
                    <Link key={s.id} href={`/accounting/assets/${s.id}`}
                      className={`chip ${s.id === a.id ? 'bg-brand-600 text-white ring-brand-600' : 'bg-ink-100 text-ink-600 ring-ink-200 hover:bg-brand-50'}`}>
                      <span className="font-mono text-xxs">{s.code}</span> #{i + 1}{s.serial_no ? ` · ${s.serial_no}` : ''}
                    </Link>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === 'accounting' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title={dd.costInfo} />
            <DL rows={[
              [d.assets.cost, money(Number(a.cost))], [d.assets.salvage, money(Number(a.salvage_value))],
              [d.assets.accumDep, money(accum)], [d.assets.bookValue, money(nbv)],
            ]} />
          </Card>
          <Card>
            <CardHeader title={dd.policy} />
            <DL rows={[
              [d.assets.method, (d.assets as any)[a.method === 'declining_balance' ? 'declining' : a.method === 'none' ? 'noDep' : 'straightLine']],
              [d.assets.lifeMonths, `${a.useful_life_months} ${dd.months}`],
              [d.assets.monthlyPreview, money(monthly)], [dd.endDate, endPeriod],
            ]} />
          </Card>
          <Card>
            <CardHeader title={dd.glMapping} />
            <DL rows={[
              [d.assets.assetAccount, accName(a.asset_account_id)],
              [d.assets.accumAccount, accName(a.accum_dep_account_id)],
              [d.assets.depExpenseAccount, accName(a.expense_account_id)],
            ]} />
          </Card>
        </div>
      )}

      {tab === 'depreciation' && (
        <Card>
          <CardHeader title={dd.schedule} description={dd.scheduleHint} />
          {schedule.length === 0 ? (
            <EmptyBox label={dd.noSchedule} />
          ) : (
            <Table>
              <THead><TR>
                <TH>{dd.period}</TH><TH className="num">{d.assets.depAmount}</TH>
                <TH className="num">{d.assets.accumDep}</TH><TH className="num">{d.assets.bookValue}</TH><TH>{d.common.status}</TH>
              </TR></THead>
              <TBody>
                {schedule.map((r) => (
                  <TR key={r.period}>
                    <TD className="whitespace-nowrap">{r.period}</TD>
                    <TD className="num">{money(r.depreciation)}</TD>
                    <TD className="num text-ink-500">{money(r.accumulated)}</TD>
                    <TD className="num font-medium">{money(r.bookValue)}</TD>
                    <TD><span className={`chip ${r.posted ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-ink-100 text-ink-400 ring-ink-200'}`}>{r.posted ? dd.posted : dd.planned}</span></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      )}

      {tab === 'documents' && (
        <Card>
          <CardHeader title={dd.tabDocuments} description={dd.docsHint} />
          <div className="px-4 pb-4 text-[13px] text-ink-500">
            {src ? (
              <Link href={`/purchase/${slugOf(src.kind)}/${src.id}`} className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                <FileText className="h-3.5 w-3.5" /> {dd.openSourceDoc}: {src.doc_number}
              </Link>
            ) : <span className="text-ink-400">{d.ui.capitalize?.none ?? '—'}</span>}
          </div>
        </Card>
      )}

      {tab === 'history' && (
        <Card>
          <CardHeader title={dd.tabHistory} />
          {posted.length === 0 ? (
            <EmptyBox label={dd.noHistory} />
          ) : (
            <Table>
              <THead><TR><TH>{dd.period}</TH><TH className="num">{d.assets.depAmount}</TH><TH className="num">{d.assets.accumDep}</TH><TH className="num">{d.assets.bookValue}</TH></TR></THead>
              <TBody>
                {posted.slice().reverse().map((p: any) => (
                  <TR key={p.period_end}>
                    <TD className="whitespace-nowrap">{p.period_end}</TD>
                    <TD className="num">{money(Number(p.amount))}</TD>
                    <TD className="num text-ink-500">{money(Number(p.accum_after))}</TD>
                    <TD className="num font-medium">{money(Number(p.book_value))}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      )}
    </>
  );
}

function slugOf(kind: string): string {
  const m: Record<string, string> = { bill: 'bills', goods_receipt: 'goods-receipts', expense: 'expenses', purchase_order: 'purchase-orders', purchase_request: 'purchase-requests' };
  return m[kind] || 'bills';
}

function DL({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="divide-y divide-ink-100">
      {rows.map(([label, value], i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-2.5">
          <dt className="w-32 shrink-0 text-[12.5px] text-ink-400">{label}</dt>
          <dd className="min-w-0 flex-1 text-[13.5px] text-ink-800">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function EmptyBox({ label }: { label: string }) {
  return <div className="px-4 py-10 text-center text-[13px] text-ink-400">{label}</div>;
}
