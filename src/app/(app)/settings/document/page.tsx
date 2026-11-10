import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/page-header';
import DocSettingsForm from './DocSettingsForm';

export const dynamic = 'force-dynamic';

export default async function DocSettingsPage() {
  const ctx = await requirePermission('settings.companies', 'view');
  const supabase = createClient();
  const { data } = await supabase.from('companies').select('*').eq('id', ctx.company.id).maybeSingle();
  const row = (data ?? {}) as Record<string, any>;
  const settings = (row.settings ?? {}) as Record<string, any>;
  const hasColumn = 'settings' in row;

  return (
    <>
      <PageHeader
        title="ตั้งค่าเอกสารและนโยบาย"
        subtitle={`${ctx.company?.name_th ?? 'บริษัท'} · เครดิตเทอม · หมายเหตุเอกสาร · ประเภทราคา · ชื่อซ้ำ · การแสดงข้อมูลสาธารณะ`}
      />
      <DocSettingsForm initial={settings} hasColumn={hasColumn} />
    </>
  );
}
