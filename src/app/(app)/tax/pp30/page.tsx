import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';
import { PageHeader, Card } from '@/components/ui/page-header';
import { MonthPicker } from '@/components/forms/month-picker';
import { PrintButton } from '@/components/ui/print-button';
import { money } from '@/lib/format';
import { calcPP30 } from '@/lib/tax';

export const dynamic = 'force-dynamic';

export default async function PP30Page({ searchParams }: { searchParams: { y?: string; m?: string } }) {
  const ctx = await requirePermission('tax', 'view');
  const d = t();
  const L = d.ui.pp30;
  const now = new Date();
  const year = Number(searchParams.y) || now.getFullYear();
  const month = Number(searchParams.m) || now.getMonth() + 1;
  const supabase = createClient();

  const [{ data: out }, { data: inp }] = await Promise.all([
    supabase.rpc('rpt_vat', { p_company: ctx.company.id, p_year: year, p_month: month, p_side: 'output' }),
    supabase.rpc('rpt_vat', { p_company: ctx.company.id, p_year: year, p_month: month, p_side: 'input' }),
  ]);
  const sales = (out || []) as any[];
  const purch = (inp || []) as any[];
  const s = (rows: any[], k: string) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);
  const result = calcPP30(s(sales, 'vat_amount'), s(purch, 'vat_amount'));

  const Line = ({ n, label, value, bold }: { n: string; label: string; value: number; bold?: boolean }) => (
    <div className={'flex items-center justify-between border-b border-ink-100 py-2.5 text-sm ' + (bold ? 'font-semibold text-ink-900' : 'text-ink-700')}>
      <span><span className="mr-3 inline-flex h-5 w-5 items-center justify-center rounded bg-ink-100 text-xxs text-ink-500">{n}</span>{label}</span>
      <span className="tabular-nums">{money(value)}</span>
    </div>
  );

  return (
    <>
      <PageHeader
        title={d.nav.pp30}
        subtitle={`${ctx.company.name_th} · ${L.subtitle.replace('{m}', String(month)).replace('{y}', String(year))}`}
        action={<><MonthPicker year={year} month={month} /><PrintButton label={d.common.print} /></>}
      />
      <Card className="mx-auto max-w-2xl">
        <div className="px-6 py-5">
          <div className="mb-6 text-center">
            <p className="text-base font-semibold text-ink-900">{L.formTitle}</p>
            <p className="text-sm text-ink-600">{ctx.company.name_th}</p>
            <p className="text-xs text-ink-500">
              เลขประจำตัวผู้เสียภาษี {ctx.company.tax_id || '–'} · เดือนภาษี {month}/{year}
            </p>
          </div>
          <Line n="1" label={L.line1} value={s(sales, 'base_amount')} />
          <Line n="7" label={L.line7} value={result.output_vat} />
          <Line n="8" label={L.line8} value={s(purch, 'base_amount')} />
          <Line n="9" label={L.line9} value={result.input_vat} />
          <div className="mt-4 rounded-lg bg-brand-50 px-4 py-3">
            {result.payable > 0 ? (
              <div className="flex justify-between text-base font-semibold text-brand-800">
                <span>{L.payable}</span><span className="tabular-nums">{money(result.payable)}</span>
              </div>
            ) : (
              <div className="flex justify-between text-base font-semibold text-emerald-700">
                <span>{L.carryForward}</span><span className="tabular-nums">{money(result.carry_forward)}</span>
              </div>
            )}
          </div>
          <p className="mt-4 text-xxs leading-relaxed text-ink-400">
            หมายเหตุ: ตัวเลขนี้คำนวณจากเอกสารที่บันทึกในระบบ ยังไม่รวมรายการปรับปรุงพิเศษ เช่น ภาษีซื้อต้องห้าม
            ภาษีขายจากการนำเข้า หรือเครดิตภาษียกมา กรุณาสอบทานก่อนยื่นแบบกับกรมสรรพากร
          </p>
        </div>
      </Card>
    </>
  );
}
