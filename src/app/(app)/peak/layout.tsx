import { requirePermission } from '@/lib/session';
import { PageHeader } from '@/components/ui/page-header';
import { PeakTabs } from '@/components/finance/peak-tabs';
import { peakFin } from '@/lib/peak-fin';

export const dynamic = 'force-dynamic';

export default async function PeakLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePermission('report', 'view');
  const f = peakFin();
  return (
    <>
      <PageHeader
        title="การเงิน PEAK"
        subtitle={`${ctx.company?.name_th ?? 'บริษัท'} · กระจกเงินจากระบบบัญชี PEAK (อ่านอย่างเดียว) · งวด ${f.period} · ดึงเมื่อ ${f.pulled}`}
      />
      <PeakTabs />
      {children}
    </>
  );
}
