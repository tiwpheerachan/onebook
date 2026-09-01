'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Bell, RefreshCw, CheckCheck, AlertOctagon, AlertTriangle, Info } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { useI18n } from '@/i18n/provider';
import { money } from '@/lib/format';
import { cn } from '@/lib/cn';
import { refreshNotifications, markNotificationsRead } from '@/actions/notifications';

export interface NotificationRow {
  id: string;
  kind: string;
  severity: 'info' | 'warning' | 'danger';
  title_key: string;
  params: Record<string, unknown>;
  href: string | null;
  created_at: string;
  is_read: boolean;
}

/** ช่องที่เป็นจำนวนเงิน ต้องจัดรูปแบบก่อนแทนค่า ไม่งั้นได้เลขดิบยาวเหยียด */
const MONEY_KEYS = ['amount', 'budget', 'used'];

export function NotificationList({ rows }: { rows: NotificationRow[] }) {
  const { dict: d } = useI18n();
  const L = d.ui.notify;
  const router = useRouter();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  const unread = rows.filter((r) => !r.is_read).length;
  const shown = unreadOnly ? rows.filter((r) => !r.is_read) : rows;

  /** ประกอบข้อความจากคีย์กับพารามิเตอร์ ตามภาษาของผู้อ่าน */
  const render = (r: NotificationRow) => {
    const tpl = (L.msg as Record<string, string>)[r.title_key];
    if (!tpl) return r.title_key;
    return Object.entries(r.params || {}).reduce((acc, [k, v]) => {
      const val = MONEY_KEYS.includes(k) ? money(Number(v)) : String(v ?? '');
      return acc.replaceAll(`{${k}}`, val);
    }, tpl);
  };

  const Icon = (s: string) =>
    s === 'danger' ? AlertOctagon : s === 'warning' ? AlertTriangle : Info;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="chip bg-ink-100 text-ink-700 ring-ink-200">
          <Bell className="h-3 w-3" strokeWidth={2} /> {L.unread.replace('{n}', String(unread))}
        </span>
        <button
          className={cn('chip transition',
            unreadOnly ? 'bg-brand-600 text-white ring-brand-600'
                       : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50')}
          onClick={() => setUnreadOnly((v) => !v)}
        >
          {unreadOnly ? L.unreadOnly : L.all}
        </button>

        {msg && <span className="text-xs text-emerald-700">{msg}</span>}
        {err && <span className="text-xs text-rose-600">{err}</span>}

        <span className="ml-auto flex gap-2">
          <button className="btn-secondary" disabled={pending}
                  onClick={() => start(async () => {
                    setErr(''); setMsg('');
                    const res = await refreshNotifications();
                    if (!res.ok) { setErr(res.error || ''); return; }
                    setMsg(res.created
                      ? L.refreshed.replace('{n}', String(res.created))
                      : L.refreshedNone);
                    router.refresh();
                  })}>
            {pending ? <ShdSpinner size={16} /> : <RefreshCw className="h-4 w-4 text-ink-400" strokeWidth={1.8} />}
            {L.refresh}
          </button>
          {unread > 0 && (
            <button className="btn-ghost" disabled={pending}
                    onClick={() => start(async () => {
                      setErr('');
                      const res = await markNotificationsRead();
                      if (!res.ok) { setErr(res.error || ''); return; }
                      router.refresh();
                    })}>
              <CheckCheck className="h-4 w-4" strokeWidth={1.8} /> {L.markAllRead}
            </button>
          )}
        </span>
      </div>

      <div className="card divide-y divide-ink-100">
        {shown.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-ink-400">{L.empty}</p>
        )}
        {shown.map((r) => {
          const I = Icon(r.severity);
          const body = (
            <span className="flex items-start gap-3 px-5 py-3">
              <I className={cn('mt-0.5 h-4 w-4 shrink-0',
                r.severity === 'danger' ? 'text-rose-600'
                : r.severity === 'warning' ? 'text-amber-600' : 'text-sky-600')}
                 strokeWidth={2} />
              <span className={cn('min-w-0 flex-1 text-sm leading-relaxed',
                r.is_read ? 'text-ink-500' : 'font-medium text-ink-900')}>
                {render(r)}
              </span>
              {!r.is_read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />}
            </span>
          );
          return r.href
            ? <Link key={r.id} href={r.href} className="block transition hover:bg-ink-50">{body}</Link>
            : <div key={r.id}>{body}</div>;
        })}
      </div>

      <p className="mt-3 text-xxs text-ink-400">{L.hint}</p>
    </>
  );
}
