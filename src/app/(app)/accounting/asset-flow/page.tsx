import Link from 'next/link';
import {
  FileText, ShoppingCart, PackageCheck, Receipt, Boxes, TrendingDown, Archive,
  ArrowRight, AlertTriangle, CalendarClock,
} from 'lucide-react';
import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { money } from '@/lib/format';

export const dynamic = 'force-dynamic';

// นับจำนวนเดือนแบบคร่าว ๆ จากวันที่ได้มาถึงวันนี้ (ใช้ประเมินค่าเสื่อมใกล้หมด)
function monthsElapsed(from: string): number {
  if (!from) return 0;
  const a = new Date(from);
  const now = new Date();
  return (now.getFullYear() - a.getFullYear()) * 12 + (now.getMonth() - a.getMonth());
}

export default async function AssetFlowPage() {
  const ctx = await requirePermission('accounting.assets', 'view');
  const d = t();
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: docs }, { data: reg }] = await Promise.all([
    supabase.from('documents').select('kind, status')
      .eq('company_id', ctx.company.id)
      .in('kind', ['purchase_request', 'purchase_order', 'goods_receipt', 'bill'])
      .neq('status', 'void'),
    supabase.rpc('rpt_asset_register', { p_company: ctx.company.id, p_as_of: today }),
  ]);

  const docCount = (kind: string) => (docs || []).filter((x: any) => x.kind === kind).length;
  const rows = (reg || []) as any[];

  let cost = 0, accum = 0, nbv = 0;
  let active = 0, fully = 0, disposed = 0, expiring = 0;
  for (const r of rows) {
    if (r.status === 'disposed') { disposed++; continue; }
    cost += Number(r.cost || 0);
    accum += Number(r.accum_dep || 0);
    nbv += Number(r.book_value || 0);
    if (r.status === 'fully_depreciated') { fully++; continue; }
    active++;
    // ใกล้หมดอายุค่าเสื่อม: เหลือ ≤ 6 เดือน (จากอายุใช้งาน - เดือนที่ผ่านไป)
    const life = Number(r.useful_life_months || 0);
    if (life > 0) {
      const remain = life - monthsElapsed(r.acquired_date);
      if (remain > 0 && remain <= 6) expiring++;
    }
  }
  const depPct = cost > 0 ? (accum / cost) * 100 : 0;
  const nbvPct = cost > 0 ? (nbv / cost) * 100 : 0;

  const k = d.ui.assetFlow;
  const flow = [
    { label: k.nPR, count: docCount('purchase_request'), icon: FileText, href: '/purchase/purchase-requests', accent: 'bg-ink-300' },
    { label: k.nPO, count: docCount('purchase_order'), icon: ShoppingCart, href: '/purchase/purchase-orders', accent: 'bg-ink-300' },
    { label: k.nGR, count: docCount('goods_receipt'), icon: PackageCheck, href: '/purchase/goods-receipts', accent: 'bg-ink-300' },
    { label: k.nBill, count: docCount('bill'), icon: Receipt, href: '/purchase/bills', accent: 'bg-brand-400' },
    { label: k.nActive, count: active, icon: Boxes, href: '/accounting/assets', accent: 'bg-emerald-500' },
    { label: k.nDep, count: active, icon: TrendingDown, href: '/accounting/assets', accent: 'bg-brand-500' },
    { label: k.nEnd, count: fully + disposed, icon: Archive, href: '/accounting/assets', accent: 'bg-ink-400' },
  ];

  return (
    <>
      <PageHeader title={k.title} subtitle={`${ctx.company.name_th} · ${k.subtitle}`} />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={k.kTotal} value={active + fully} suffix={k.items} />
        <StatCard label={k.kCost} value={cost} suffix={d.common.baht} />
        <StatCard label={k.kAccum} value={accum} suffix={`${d.common.baht} · ${depPct.toFixed(1)}${k.ofCost}`} tone="negative" />
        <StatCard label={k.kNbv} value={nbv} suffix={`${d.common.baht} · ${nbvPct.toFixed(1)}${k.ofCost}`} tone="brand" />
      </div>

      <Card className="mb-5">
        <div className="p-5">
          <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
            {flow.map((n, i) => (
              <div key={i} className="flex items-stretch gap-1">
                <Link href={n.href}
                  className="group relative flex min-w-[140px] flex-col overflow-hidden rounded-lg border border-ink-200 bg-white p-3.5 transition hover:border-brand-400 hover:shadow-sm">
                  <span className={`absolute inset-x-0 top-0 h-1 ${n.accent}`} />
                  <n.icon className="mt-1 h-[18px] w-[18px] text-ink-400 group-hover:text-brand-600" strokeWidth={1.8} />
                  <div className="mt-2 text-[24px] font-semibold leading-none tabular-nums text-ink-900">{n.count}</div>
                  <div className="mt-1.5 text-[12.5px] font-medium text-ink-700">{n.label}</div>
                </Link>
                {i < flow.length - 1 && <div className="flex items-center text-ink-300"><ArrowRight className="h-[18px] w-[18px]" /></div>}
              </div>
            ))}
          </div>
          <div className="mt-3 text-[11.5px] text-ink-400">{k.flowHint}</div>
        </div>
      </Card>

      <Card className="max-w-xl">
        <div className="p-5">
          <div className="mb-3 flex items-center gap-2 text-[13.5px] font-semibold text-ink-800">
            <CalendarClock className="h-4 w-4 text-brand-600" /> {k.depStatus}
          </div>
          <div className="space-y-2.5">
            <Link href="/accounting/assets"
              className={`flex items-center justify-between rounded-md px-3 py-2.5 transition ${expiring ? 'bg-amber-50 hover:bg-amber-100' : 'bg-ink-50'}`}>
              <span className="flex items-center gap-2 text-[13px] text-ink-700">
                {expiring > 0 && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                {k.expiring}
              </span>
              <span className={`text-[14px] font-semibold tabular-nums ${expiring ? 'text-amber-700' : 'text-ink-800'}`}>{expiring} {k.items}</span>
            </Link>
            <div className="flex items-center justify-between rounded-md bg-ink-50 px-3 py-2.5">
              <span className="text-[13px] text-ink-700">{k.fully}</span>
              <span className="text-[14px] font-semibold tabular-nums text-ink-800">{fully} {k.items}</span>
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}
