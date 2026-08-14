import { getSessionContext, can } from '@/lib/session';
import { redirect } from 'next/navigation';
import { t } from '@/i18n/server';
import { PageHeader } from '@/components/ui/page-header';
import { DataImport } from '@/components/forms/data-import';

export const dynamic = 'force-dynamic';

export default async function DataImportPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');

  const allowed = {
    contacts: can(ctx, 'contacts', 'create'),
    products: can(ctx, 'products', 'create'),
    accounts: can(ctx, 'accounting.coa', 'create'),
  };
  if (!allowed.contacts && !allowed.products && !allowed.accounts) {
    return <p className="card card-pad text-sm text-ink-500">{t().security.noPermission}</p>;
  }

  return (
    <>
      <PageHeader
        title={t().nav.dataImport}
        subtitle={`${ctx.company.name_th} · ย้ายข้อมูลจากโปรแกรมเดิมเข้าระบบครั้งเดียวจบ ไม่ต้องคีย์ทีละรายการ`}
      />
      <DataImport allowed={allowed} />
    </>
  );
}
