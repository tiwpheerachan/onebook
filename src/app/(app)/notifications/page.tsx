import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';
import { PageHeader } from '@/components/ui/page-header';
import { NotificationList, type NotificationRow } from '@/components/layout/notification-list';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  // ทุกคนที่เข้าถึงบริษัทได้เห็นหน้านี้ ส่วนจะเห็นรายการไหนบ้าง RLS คัดให้เอง
  const ctx = await requirePermission('documents', 'view');
  const d = t();
  const L = d.ui.notify;

  const supabase = createClient();
  const { data } = await supabase.rpc('rpt_notifications', {
    p_company: ctx.company.id, p_unread_only: false, p_limit: 200,
  });
  const rows = (data || []) as NotificationRow[];

  return (
    <>
      <PageHeader title={L.title} subtitle={`${ctx.company.name_th} · ${L.subtitle}`} />
      <NotificationList rows={rows} />
    </>
  );
}
