import { redirect } from 'next/navigation';
import { getSessionContext, can } from '@/lib/session';
import { t, currentLocale } from '@/i18n/server';
import { buildNav } from '@/components/layout/nav-config';
import { Sidebar } from '@/components/layout/sidebar';
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

  return (
    <div className="flex min-h-screen">
      <Sidebar groups={groups} appName={d.app.name} />

      <div className="flex min-w-0 flex-1 flex-col">
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

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>

        <footer className="no-print border-t border-ink-200 bg-white px-6 py-3 text-center text-xxs text-ink-400">
          {d.app.name} · {d.app.tagline} · ระบบภายในองค์กร ห้ามเผยแพร่ข้อมูลออกภายนอก
        </footer>
      </div>
    </div>
  );
}
