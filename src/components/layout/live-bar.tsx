'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Wallet, AlertTriangle, CheckCircle2, Bell, Clock } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { compact } from '@/lib/format';
import { cn } from '@/lib/cn';
import { getLiveStats, type LiveStats } from '@/actions/live';
import { getLiveFx, type LiveFxRow } from '@/actions/fx';

/** เวลาไทยเสมอ ไม่ว่าเครื่องผู้ใช้จะตั้งเขตเวลาอะไรไว้ */
const TZ = 'Asia/Bangkok';

/** ดึงตัวเลขใหม่ทุกหนึ่งนาที ถี่กว่านี้ไม่ได้ประโยชน์และเปลืองเปล่า */
const POLL_MS = 60_000;

const tag = (locale: string) => (locale === 'th' ? 'th-TH' : locale === 'zh' ? 'zh-CN' : 'en-GB');

/**
 * แถบตัวเลขสดกับนาฬิกาไทยบนหัวจอ
 *
 * สองเรื่องที่ตั้งใจทำ
 *   - หยุดทั้งนาฬิกาและการดึงข้อมูลเมื่อผู้ใช้สลับแท็บไปทำอย่างอื่น
 *     แท็บที่เปิดค้างไว้ทั้งวันจึงไม่กินเครื่องฟรี ๆ ตามกติกาของโครงการ
 *   - บังคับเขตเวลา Asia/Bangkok ไม่ใช้เวลาเครื่อง เพราะโน้ตบุ๊กที่ตั้งเขตเวลาผิด
 *     หรือคนที่เปิดจากต่างประเทศจะเห็นเวลาคนละอันกับที่ลงบัญชี
 */
export function LiveBar() {
  const { dict: d, locale } = useI18n();
  const L = d.ui.liveBar;

  const [now, setNow] = useState<Date | null>(null);
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [fx, setFx] = useState<LiveFxRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // นาฬิกาเดินเฉพาะตอนที่หน้ายังเปิดอยู่
  useEffect(() => {
    if (!visible) return;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [visible]);

  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // ดึงตัวเลขทันทีตอนกลับมาดู แล้วตั้งรอบใหม่
  useEffect(() => {
    if (!visible) {
      if (timer.current) { clearInterval(timer.current); timer.current = null; }
      return;
    }
    let alive = true;
    const load = async () => {
      setBusy(true);
      const [res, rates] = await Promise.all([getLiveStats(), getLiveFx()]);
      if (alive && res.ok) setStats(res);
      if (alive && rates.ok) setFx(rates.rows || []);
      if (alive) setBusy(false);
    };
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      if (timer.current) { clearInterval(timer.current); timer.current = null; }
    };
  }, [visible]);

  // ก่อน mount ยังไม่รู้เวลาเครื่อง จึงเว้นที่ไว้เท่าเดิมกันจอกระตุก
  const clock = now
    ? new Intl.DateTimeFormat(tag(locale), {
        timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }).format(now)
    : '--:--:--';
  const day = now
    ? new Intl.DateTimeFormat(tag(locale), {
        timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      }).format(now)
    : '';
  const updatedAt = stats?.asOf
    ? new Intl.DateTimeFormat(tag(locale), {
        timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date(stats.asOf))
    : null;

  const chips = [
    { key: 'cash', icon: Wallet, label: L.cash, href: '/finance',
      value: stats ? compact(stats.cash || 0) : '—', tone: '' },
    { key: 'overdue', icon: AlertTriangle, label: L.overdue, href: '/reports/ar-aging',
      value: stats ? String(stats.arOverdue ?? 0) : '—',
      tone: (stats?.arOverdue || 0) > 0 ? 'text-rose-600' : '' },
    { key: 'approval', icon: CheckCircle2, label: L.approval, href: '/approvals',
      value: stats ? String(stats.awaitingApproval ?? 0) : '—',
      tone: (stats?.awaitingApproval || 0) > 0 ? 'text-amber-600' : '' },
    { key: 'alerts', icon: Bell, label: L.alerts, href: '/notifications',
      value: stats ? String(stats.unread ?? 0) : '—',
      tone: (stats?.unread || 0) > 0 ? 'text-brand-700' : '' },
  ];

  return (
    <div className="flex min-w-0 items-center gap-1">
      {/* อัตราแลกเปลี่ยน ดึงเองทุกหนึ่งนาทีพร้อมตัวเลขอื่น ไม่ต้องกด
        * ธปท. ประกาศวันละครั้ง ตัวเลขจึงนิ่งทั้งวัน แต่วันที่กำกับบอกได้ว่าเป็นของวันไหน */}
      {fx.length > 0 && (
        <div className="hidden items-center gap-1 xl:flex">
          {fx.map((r) => {
            const up = Number(r.pct || 0) > 0;
            const flat = r.pct == null || Math.abs(Number(r.pct)) < 0.005;
            return (
              <Link
                key={r.currency}
                href={`/reports/fx-rates?c=${r.currency}&d=90`}
                title={(r.stale ? L.fxStale : L.fxAsOf).replace('{date}', r.rateDate)}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition hover:bg-ink-100"
              >
                <span className="font-mono text-xxs text-ink-500">{r.currency}</span>
                <b className={cn('tabular-nums', r.stale ? 'text-ink-500' : 'text-ink-800')}>
                  {r.sell.toFixed(2)}
                </b>
                {!flat && (
                  <span className={cn('text-xxs tabular-nums', up ? 'text-rose-600' : 'text-emerald-600')}>
                    {up ? '▲' : '▼'}{Math.abs(Number(r.pct)).toFixed(2)}%
                  </span>
                )}
              </Link>
            );
          })}
          <span className="mx-1 h-5 w-px shrink-0 bg-ink-200" />
        </div>
      )}

      {/* ตัวเลขซ่อนบนจอแคบ เพราะหัวจอมีที่จำกัดและนาฬิกาสำคัญกว่า */}
      <div className="hidden items-center gap-1 lg:flex">
        {chips.map((c) => (
          <Link
            key={c.key}
            href={c.href}
            title={updatedAt ? L.updated.replace('{time}', updatedAt) : undefined}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition hover:bg-ink-100"
          >
            <c.icon className="h-3.5 w-3.5 text-ink-400" strokeWidth={1.8} />
            <span className="text-ink-500">{c.label}</span>
            <b className={cn('tabular-nums', c.tone || 'text-ink-800')}>{c.value}</b>
          </Link>
        ))}
        <span
          className={cn('ml-1 h-1.5 w-1.5 shrink-0 rounded-full transition',
            !visible ? 'bg-ink-300' : busy ? 'bg-amber-400' : 'bg-emerald-500')}
          title={!visible ? L.paused : busy ? L.updating
                 : updatedAt ? L.updated.replace('{time}', updatedAt) : undefined}
        />
        <span className="mx-1 h-5 w-px shrink-0 bg-ink-200" />
      </div>

      <span
        className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1"
        title={`${L.timezone} · ${day}`}
      >
        <Clock className="h-3.5 w-3.5 text-ink-400" strokeWidth={1.8} />
        <span className="hidden text-xxs text-ink-500 sm:inline">{day}</span>
        <b className="tabular-nums text-xs text-ink-800">{clock}</b>
      </span>
    </div>
  );
}
