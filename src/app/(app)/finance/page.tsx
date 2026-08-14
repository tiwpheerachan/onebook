import Link from 'next/link';
import { Wallet, ArrowDownLeft, ArrowUpRight, Scale, ChevronRight } from 'lucide-react';
import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { FinanceTabs } from '@/components/finance/finance-tabs';
import { money, localeDate, firstDayOfMonth, lastDayOfMonth } from '@/lib/format';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

/** ภาพรวมการเงิน : เงินมีเท่าไร ต้องเก็บเท่าไร ต้องจ่ายเท่าไร */
export default async function FinanceOverviewPage() {
  const ctx = await requirePermission('finance.channels', 'view');
  const d = t();
  const locale = currentLocale();
  const supabase = createClient();

  const [{ data: board }, { data: stats }] = await Promise.all([
    supabase.rpc('rpt_channel_balances', { p_company: ctx.company.id, p_as_of: null }),
    supabase.rpc('rpt_dashboard', {
      p_company: ctx.company.id, p_from: firstDayOfMonth(), p_to: lastDayOfMonth(),
    }),
  ]);

  const b = (board || {}) as any;
  const s = (stats || {}) as any;
  const groups: any[] = b.groups || [];
  const cash = Number(b.grand_total || 0);
  const ar = Number(s.ar_outstanding || 0);
  const ap = Number(s.ap_outstanding || 0);
  const net = cash + ar - ap;

  const cards = [
    { label: 'เงินสด/ธนาคาร/e-Wallet', value: cash, icon: Wallet, tone: cash < 0 ? 'text-rose-600' : 'text-ink-900',
      note: `${b.account_count || 0} บัญชี`, href: '/finance/channels' },
    { label: 'ลูกหนี้คงค้าง (ต้องเก็บ)', value: ar, icon: ArrowDownLeft, tone: 'text-emerald-600',
      note: 'ยังเก็บเงินไม่ได้', href: '/reports/ar-aging' },
    { label: 'เจ้าหนี้คงค้าง (ต้องจ่าย)', value: ap, icon: ArrowUpRight, tone: 'text-rose-600',
      note: 'ยังไม่ได้จ่าย', href: '/reports/ap-aging' },
    { label: 'สภาพคล่องสุทธิ', value: net, icon: Scale, tone: net < 0 ? 'text-rose-600' : 'text-brand-700',
      note: 'เงินสด + ลูกหนี้ − เจ้าหนี้' },
  ];

  return (
    <>
      <PageHeader
        title={d.nav.finance}
        subtitle={`${ctx.company.name_th} · ข้อมูล ณ วันที่ ${localeDate(b.as_of, locale)}`}
      />

      <FinanceTabs />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => {
          const body = (
            <div className="card card-pad h-full transition hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <c.icon className="h-4 w-4 text-ink-400" strokeWidth={1.8} />
                {c.href && <ChevronRight className="h-3.5 w-3.5 text-ink-300" strokeWidth={2} />}
              </div>
              <p className={cn('mt-2 text-xl font-semibold tabular-nums', c.tone)}>{money(c.value)}</p>
              <p className="mt-0.5 text-xs text-ink-600">{c.label}</p>
              <p className="text-xxs text-ink-400">{c.note}</p>
            </div>
          );
          return c.href ? <Link key={c.label} href={c.href}>{body}</Link> : <div key={c.label}>{body}</div>;
        })}
      </div>

      <Card className="mt-5">
        <div className="border-b border-ink-200 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-ink-900">ยอดคงเหลือแยกตามประเภทช่องทาง</h2>
          <p className="mt-0.5 text-xs text-ink-500">อ่านจากบัญชีแยกประเภท จึงตรงกับงบแสดงฐานะการเงิน</p>
        </div>
        {groups.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-400">
            ยังไม่มีช่องทางการเงิน —{' '}
            <Link href="/finance/channels" className="text-brand-700 hover:underline">เพิ่มบัญชีแรก</Link>
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ink-50">
                <th className="th-cell">ประเภท</th>
                <th className="th-cell text-right">จำนวนบัญชี</th>
                <th className="th-cell text-right">ยอดคงเหลือ</th>
                <th className="th-cell text-right">สัดส่วน</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {groups.map((g) => {
                const amt = Number(g.total || 0);
                const pct = cash !== 0 ? (amt / cash) * 100 : 0;
                return (
                  <tr key={g.key} className="hover:bg-ink-50">
                    <td className="td-cell font-medium text-ink-800">{g.label}</td>
                    <td className="td-cell num text-ink-500">{g.count}</td>
                    <td className={cn('td-cell num font-medium', amt < 0 ? 'text-rose-600' : 'text-ink-900')}>
                      {money(amt)}
                    </td>
                    <td className="td-cell num">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-ink-100">
                          <span className="block h-full rounded-full bg-brand-500"
                                style={{ width: `${Math.min(100, Math.abs(pct))}%` }} />
                        </span>
                        <span className="w-12 text-right text-xxs text-ink-500">{pct.toFixed(1)}%</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-ink-50 font-semibold">
              <tr>
                <td className="td-cell">รวมทั้งหมด</td>
                <td className="td-cell num">{b.account_count || 0}</td>
                <td className={cn('td-cell num', cash < 0 ? 'text-rose-600' : 'text-ink-900')}>{money(cash)}</td>
                <td className="td-cell num">100%</td>
              </tr>
            </tfoot>
          </table>
        )}
      </Card>
    </>
  );
}
