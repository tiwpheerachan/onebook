'use client';
import { useRouter } from 'next/navigation';
import { useTransition, useState } from 'react';
import Link from 'next/link';
import { Building2, Languages, LogOut, Lock, ChevronDown, UserCog } from 'lucide-react';
import { cn } from '@/lib/cn';
import { LOCALE_LABEL, LOCALES } from '@/i18n/config';
import { setCompanyAction, setLocaleAction, signOutAction } from '@/actions/session';

export function CompanySwitcher({
  companies, current,
}: { companies: { id: string; code: string; name_th: string; parent_id: string | null }[]; current: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const active = companies.find((c) => c.id === current);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex max-w-[16rem] items-center gap-2 rounded-lg border border-ink-300 bg-white px-3 py-1.5 text-sm text-ink-800 hover:bg-ink-50"
      >
        <Building2 className="h-4 w-4 text-ink-400" strokeWidth={1.8} />
        <span className="truncate font-medium">{active?.name_th || '-'}</span>
        <ChevronDown className="h-3.5 w-3.5 text-ink-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-20 mt-1.5 max-h-96 w-80 overflow-y-auto rounded-xl border border-ink-200 bg-white py-1.5 shadow-pop">
            {companies.map((c) => (
              <button
                key={c.id}
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await setCompanyAction(c.id);
                    setOpen(false);
                    router.refresh();
                  })
                }
                className={cn(
                  'flex w-full items-start gap-2 px-3.5 py-2 text-left text-sm hover:bg-ink-50',
                  c.id === current && 'bg-brand-50',
                  c.parent_id && 'pl-7'
                )}
              >
                <span className="mt-0.5 font-mono text-xxs text-ink-400">{c.code}</span>
                <span className={cn('flex-1 truncate', c.id === current ? 'font-medium text-brand-700' : 'text-ink-700')}>
                  {c.name_th}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function LanguageSwitcher({ locale }: { locale: string }) {
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const router = useRouter();
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-ink-300 bg-white px-2.5 py-1.5 text-sm text-ink-700 hover:bg-ink-50"
      >
        <Languages className="h-4 w-4 text-ink-400" strokeWidth={1.8} />
        <span className="text-xs font-medium">{LOCALE_LABEL[locale as 'th']}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1.5 w-36 rounded-xl border border-ink-200 bg-white py-1.5 shadow-pop">
            {LOCALES.map((l) => (
              <button
                key={l}
                onClick={() =>
                  start(async () => {
                    await setLocaleAction(l);
                    setOpen(false);
                    router.refresh();
                  })
                }
                className={cn(
                  'block w-full px-3.5 py-2 text-left text-sm hover:bg-ink-50',
                  l === locale ? 'font-medium text-brand-700' : 'text-ink-700'
                )}
              >
                {LOCALE_LABEL[l]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function UserMenu({ name, email, isGroupAdmin, avatarUrl, roleLabel }: { name: string; email: string; isGroupAdmin: boolean; avatarUrl?: string | null; roleLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const initials = (name || email).slice(0, 2).toUpperCase();
  const Avatar = ({ size }: { size: number }) =>
    avatarUrl && !imgErr ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setImgErr(true)}
        className="rounded-full object-cover ring-1 ring-ink-200"
        style={{ width: size, height: size }}
      />
    ) : (
      <div
        className="flex items-center justify-center rounded-full bg-brand-600 font-semibold text-white"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      >
        {initials}
      </div>
    );
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-ink-100"
      >
        <Avatar size={30} />
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-sm font-medium text-ink-800">{name}</span>
          {roleLabel && <span className="block text-xxs text-ink-500">{roleLabel}</span>}
        </span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1.5 w-64 rounded-xl border border-ink-200 bg-white py-1.5 shadow-pop">
            <div className="flex items-center gap-2.5 border-b border-ink-100 px-3.5 py-2.5">
              <Avatar size={36} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink-900">{name}</p>
                <p className="truncate text-xs text-ink-500">{email}</p>
                {(roleLabel || isGroupAdmin) && (
                  <span className="chip mt-1 bg-brand-50 text-brand-700 ring-brand-200">{roleLabel || 'Group Admin'}</span>
                )}
              </div>
            </div>
            <Link
              href="/settings/profile"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm text-ink-700 hover:bg-ink-50"
            >
              <UserCog className="h-4 w-4 text-ink-400" strokeWidth={1.8} /> ตั้งค่าโปรไฟล์
            </Link>
            <form action={signOutAction}>
              <button type="submit" className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm text-rose-600 hover:bg-rose-50">
                <LogOut className="h-4 w-4" strokeWidth={1.8} /> ออกจากระบบ
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

export function LockBanner({ date }: { date: string }) {
  return (
    <span className="chip bg-amber-50 text-amber-700 ring-amber-200">
      <Lock className="mr-1 h-3 w-3" /> ปิดงวดถึง {date}
    </span>
  );
}
