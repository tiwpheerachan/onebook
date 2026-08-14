import { redirect } from 'next/navigation';
import { getSessionContext, can } from '@/lib/session';
import { t, currentLocale } from '@/i18n/server';
import { buildNav } from '@/components/layout/nav-config';
import { AppShell, type QuickAction } from '@/components/layout/app-shell';
import { CompanySwitcher, LanguageSwitcher, UserMenu, LockBanner } from '@/components/layout/switchers';
import { localeDate } from '@/lib/format';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');

  const d = t();
  const locale = currentLocale();
  const groups = buildNav(d)
    .map((g) => ({ ...g, items: g.items.filter((i) => can(ctx, i.resource, i.action || 'view')) }))
    .filter((g) => g.items.length > 0);

  // รายชื่อหน้าสำหรับช่องค้นหา — กรองสิทธิ์แล้วตั้งแต่ตรงนี้ จึงกระโดดไปหน้าที่ไม่มีสิทธิ์ไม่ได้
  const pages = groups.flatMap((g) => g.items.map((i) => ({ href: i.href, label: i.label, group: g.label })));

  // แถบนวัตกรรม : ทางลัดไปงานที่ทำบ่อยและช่วยให้ทำงานเร็วขึ้น
  const actions: QuickAction[] = ([

    { href: '/tasks', label: 'ตารางงาน', hint: 'งานที่ต้องทำและงานที่ตกหล่น', icon: 'CalendarCheck', resource: 'tasks' },
    { href: '/accounting/close-check', label: 'ตรวจก่อนปิดงบ', hint: 'ไล่เช็ก 15 จุดก่อนปิดงวด', icon: 'ClipboardCheck', resource: 'report' },
    { href: '/documents/ai-import', label: 'อ่านเอกสารด้วย AI', hint: 'แปลงใบกำกับ/บิลเป็นรายการอัตโนมัติ', icon: 'ScanLine', resource: 'documents.ai_import' },
    { href: '/sales', label: 'ภาพรวมรายรับ', hint: 'ยอดขายและลูกหนี้ล่าสุด', icon: 'TrendingUp', resource: 'report' },
    { href: '/finance', label: 'ภาพรวมการเงิน', hint: 'ยอดคงเหลือทุกช่องทาง', icon: 'Wallet', resource: 'finance.channels' },
  ] as (QuickAction & { resource: string })[])
    .filter((a) => can(ctx, a.resource, 'view'))
    .map(({ resource, ...a }) => a);

  const header = (
    <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-ink-200 bg-white/90 px-4 backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <CompanySwitcher companies={ctx.companies} current={ctx.company.id} />
        {ctx.lockedThrough && <LockBanner date={localeDate(ctx.lockedThrough, locale)} />}
      </div>
      <div className="flex items-center gap-2">
        <LanguageSwitcher locale={locale} />
        <UserMenu name={ctx.fullName} email={ctx.email} isGroupAdmin={ctx.isGroupAdmin} />
      </div>
    </header>
  );

  const footer = (
    <footer className="no-print border-t border-ink-200 bg-white px-6 py-3 text-center text-xxs text-ink-400">
      {d.app.name} · {d.app.tagline} · ระบบภายในองค์กร ห้ามเผยแพร่ข้อมูลออกภายนอก
    </footer>
  );

  return (
    <AppShell
      groups={groups}
      appName={d.app.name}
      pages={pages}
      actions={actions}
      header={header}
      footer={footer}
    >
      {children}
    </AppShell>
  );
}
