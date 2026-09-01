import Link from 'next/link';
import {
  Building2, Users, FileText, BookLock, Plug, ChevronRight, Check, Minus, CircleDashed,
} from 'lucide-react';
import { getSessionContext, can } from '@/lib/session';
import { redirect } from 'next/navigation';
import { t } from '@/i18n/server';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

type State = 'ready' | 'partial' | 'todo' | 'na';

interface Item {
  /** คีย์ที่ใช้หาข้อความในพจนานุกรม (i_<key> และ d_<key>) */
  key: string;
  href?: string;
  state: State;
  /** สิทธิ์ที่ต้องมีถึงจะเห็นรายการนี้ */
  resource?: string;
}

interface Group {
  id: string;
  icon: any;
  items: Item[];
}

const STATE: Record<State, { chip: string; Icon: any }> = {
  ready:   { chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200', Icon: Check },
  partial: { chip: 'bg-amber-50 text-amber-800 ring-amber-200',      Icon: CircleDashed },
  todo:    { chip: 'bg-ink-100 text-ink-500 ring-ink-200',            Icon: Minus },
  na:      { chip: 'bg-ink-50 text-ink-400 ring-ink-200',             Icon: Minus },
};

/**
 * หน้ารวมการตั้งค่าทั้งระบบ
 * เก็บเฉพาะโครงสร้างไว้ที่นี่ ข้อความทั้งหมดอยู่ในพจนานุกรมสามภาษา
 * เพื่อให้สลับภาษาแล้วหน้านี้เปลี่ยนตามทั้งหน้า ไม่ใช่เปลี่ยนแค่หัวข้อ
 */
const GROUPS: Group[] = [
  { id: 'org', icon: Building2, items: [
    { key: 'company',    href: '/settings/companies', state: 'ready',   resource: 'settings.companies' },
    { key: 'logo',       href: '/settings/companies', state: 'partial', resource: 'settings.companies' },
    { key: 'subsidiary', href: '/settings/companies', state: 'ready',   resource: 'settings.companies' },
  ]},
  { id: 'users', icon: Users, items: [
    { key: 'users', href: '/settings/users', state: 'ready', resource: 'settings.users' },
    { key: 'roles', href: '/settings/roles', state: 'ready', resource: 'settings.roles' },
  ]},
  { id: 'doc', icon: FileText, items: [
    { key: 'numbering',      href: '/settings/numbering', state: 'ready',   resource: 'settings.numbering' },
    { key: 'docFooter',      href: '/settings/companies', state: 'partial', resource: 'settings.companies' },
    { key: 'dueDate',        href: '/contacts',           state: 'partial', resource: 'contacts' },
    { key: 'channels',       href: '/finance/channels',   state: 'ready',   resource: 'finance.channels' },
    { key: 'contactGroups',  href: '/contacts',           state: 'ready',   resource: 'contacts' },
    { key: 'etax',           href: '/tax/etax',           state: 'partial', resource: 'tax.etax' },
    { key: 'journal',        href: '/accounting/journal', state: 'ready',   resource: 'journal' },
    { key: 'docFlow',        state: 'ready' },
    { key: 'taxRequestLink', state: 'todo' },
    { key: 'publicView',     state: 'todo' },
  ]},
  { id: 'policy', icon: BookLock, items: [
    { key: 'periodLock',   href: '/settings/period-lock',    state: 'ready',   resource: 'period' },
    { key: 'audit',        href: '/settings/audit',          state: 'ready',   resource: 'settings.audit' },
    { key: 'closeCheck',   href: '/accounting/close-check',  state: 'ready',   resource: 'report' },
    { key: 'provenance',   state: 'ready' },
    { key: 'insight',      href: '/tasks',                   state: 'ready',   resource: 'tasks' },
    { key: 'security',     href: '/settings/security',       state: 'ready',   resource: 'settings.security' },
    { key: 'dataImport',   href: '/settings/data-import',    state: 'ready',   resource: 'contacts' },
    { key: 'dupGuard',     state: 'partial' },
    { key: 'priceTiers',   state: 'todo' },
    { key: 'emailReports', state: 'todo' },
  ]},
  { id: 'ext', icon: Plug, items: [
    { key: 'etaxLink',    href: '/tax/etax',            state: 'partial', resource: 'tax.etax' },
    { key: 'marketplace', href: '/settings/marketplace', state: 'partial', resource: 'settings.marketplace' },
    { key: 'ocr',         href: '/documents/ai-import',  state: 'partial', resource: 'documents.ai_import' },
    { key: 'aiAssistant', state: 'partial' },
    { key: 'bankLink',    href: '/finance/reconcile',    state: 'partial', resource: 'finance.reconcile' },
  ]},
];

const NOT_APPLICABLE = ['naPackage', 'naBilling', 'naCard', 'naFirm'] as const;

export default async function SettingsHubPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  const d = t();
  const L = d.ui.settingsHub as Record<string, string>;

  const visible = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.resource || can(ctx, i.resource, 'view')),
  })).filter((g) => g.items.length > 0);

  const all = visible.flatMap((g) => g.items);
  const counts = {
    ready: all.filter((i) => i.state === 'ready').length,
    partial: all.filter((i) => i.state === 'partial').length,
    todo: all.filter((i) => i.state === 'todo').length,
  };

  return (
    <>
      <PageHeader
        title={d.nav.settings}
        subtitle={`${ctx.company.name_th} · ${L.subtitle}`}
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {([['ready', counts.ready], ['partial', counts.partial], ['todo', counts.todo]] as [State, number][]).map(
          ([k, n]) => (
            <span key={k} className={cn('chip', STATE[k].chip)}>
              {L[`st_${k}`]} {n} {L.items}
            </span>
          )
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {visible.map((g) => (
          <section key={g.id} className="card overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-ink-200 px-5 py-3.5">
              <g.icon className="h-4 w-4 text-ink-400" strokeWidth={1.8} />
              <h2 className="text-sm font-semibold text-ink-900">{L[`g_${g.id}`]}</h2>
              <span className="ml-auto text-xxs text-ink-400">{g.items.length} {L.items}</span>
            </div>

            <ul className="divide-y divide-ink-100">
              {g.items.map((i) => {
                const s = STATE[i.state];
                const body = (
                  <span className="flex items-start gap-3 px-5 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-ink-900">{L[`i_${i.key}`]}</span>
                        <span className={cn('chip', s.chip)}>{L[`st_${i.state}`]}</span>
                      </span>
                      <span className="mt-0.5 block text-xxs leading-relaxed text-ink-500">{L[`d_${i.key}`]}</span>
                    </span>
                    {i.href && <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink-300" strokeWidth={2} />}
                  </span>
                );
                return (
                  <li key={i.key}>
                    {i.href ? (
                      <Link href={i.href} className="block transition hover:bg-brand-50/40">{body}</Link>
                    ) : (
                      <span className="block">{body}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <div className="card card-pad mt-5">
        <h2 className="text-sm font-semibold text-ink-900">{L.naHeading}</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-500">{L.naBody}</p>
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {NOT_APPLICABLE.map((n) => (
            <li key={n} className="chip bg-ink-50 text-ink-400 ring-ink-200">{L[n]}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
