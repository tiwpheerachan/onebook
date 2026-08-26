import { redirect } from 'next/navigation';
import { getSessionContext, can } from '@/lib/session';
import { t, currentLocale } from '@/i18n/server';
import { buildNav } from '@/components/layout/nav-config';
import { AppShell, type QuickAction } from '@/components/layout/app-shell';
import { CompanySwitcher, LanguageSwitcher, UserMenu, LockBanner } from '@/components/layout/switchers';
import { localeDate } from '@/lib/format';
import { HELP } from '@/lib/help/content';
import { tx } from '@/lib/help/types';

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

  // บทความในคู่มือค้นได้จากช่อง ⌘K ด้วย คนมักค้นด้วยคำถามมากกว่าชื่อเมนู
  const helpPages = HELP.flatMap((c) =>
    c.articles
      .filter((a) => !a.resource || can(ctx, a.resource, 'view'))
      .map((a) => ({
        href: `/help/${c.slug}/${a.slug}`,
        label: tx(a.title, locale),
        group: `${d.ui.help.title} · ${tx(c.title, locale)}`,
      }))
  );

  // แถบนวัตกรรม : ทางลัดไปงานที่ทำบ่อยและช่วยให้ทำงานเร็วขึ้น
  const actions: QuickAction[] = ([
    { href: '/tasks', label: d.ui.shell.qaTasks, hint: d.ui.shell.qaTasksHint, icon: 'CalendarCheck', resource: 'tasks' },
    { href: '/accounting/close-check', label: d.ui.shell.qaCloseCheck, hint: d.ui.shell.qaCloseCheckHint, icon: 'ClipboardCheck', resource: 'report' },
    { href: '/documents/ai-import', label: d.ui.shell.qaAiImport, hint: d.ui.shell.qaAiImportHint, icon: 'ScanLine', resource: 'documents.ai_import' },
    { href: '/sales', label: d.ui.shell.qaSales, hint: d.ui.shell.qaSalesHint, icon: 'TrendingUp', resource: 'report' },
    { href: '/finance', label: d.ui.shell.qaFinance, hint: d.ui.shell.qaFinanceHint, icon: 'Wallet', resource: 'finance.channels' },
  ] as (QuickAction & { resource: string })[])
    .filter((a) => can(ctx, a.resource, 'view'))
    .map(({ resource, ...a }) => a);

  // แถบด้านบนไม่ใช้ backdrop-blur
  // บน Windows เบราว์เซอร์ต้องเบลอพื้นหลังใหม่ทุกเฟรมที่เลื่อน กิน GPU หนักและทำให้กระตุก
  // พื้นทึบให้ผลตาเกือบเหมือนกันแต่ไม่มีค่าใช้จ่ายเลย
  const header = (
    <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-ink-200 bg-white px-4 sm:px-6">
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
      {d.app.name} · {d.app.tagline} · {d.app.internalOnly}
    </footer>
  );

  return (
    <AppShell
      groups={groups}
      appName={d.app.name}
      pages={[...pages, ...helpPages]}
      actions={actions}
      header={header}
      footer={footer}
      d={d}
      locale={locale}
      canPropose={
        can(ctx, 'documents', 'approve') ||
        can(ctx, 'documents', 'void') ||
        can(ctx, 'documents', 'edit')
      }
    >
      {children}
    </AppShell>
  );
}
