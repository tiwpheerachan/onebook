'use client';
/**
 * แอนิเมชันโลโก้ SHD สำหรับจังหวะรอ (โหลดหน้า / เตรียมไฟล์ / ดาวน์โหลด)
 *
 * แนวคิด : หยดน้ำกลางโลโก้ค่อย ๆ เติมทองขึ้นมาเหมือนของเหลว
 * พร้อมวงแหวนทองหมุนรอบนอก — สื่อความคืบหน้าได้ทั้งแบบรู้ % และไม่รู้ %
 *
 * ทุกแอนิเมชันปิดเองเมื่อผู้ใช้ตั้งค่าระบบเป็น "ลดการเคลื่อนไหว"
 * (ดู prefers-reduced-motion ใน globals.css)
 */
import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { SHD_MARK, SHD_WORD, SHD_WORD_STOPS, SHD_COLOR } from './shd-logo';
import { cn } from '@/lib/cn';

/** ระดับของเหลวในหยดน้ำ (พิกัดแกน y ของ path หยดน้ำ : 12 = เต็ม, 76 = ว่าง) */
const FULL_Y = 10;
const EMPTY_Y = 76;
const levelY = (p: number) => EMPTY_Y - Math.min(1, Math.max(0, p)) * (EMPTY_Y - FULL_Y);

/** คลื่นผิวของเหลว : กว้าง 6 ลูก ลูกละ 50 หน่วย เลื่อนซ้ำได้ไร้รอยต่อ */
const wave = (amp: number) => {
  let d = `M-150 0`;
  for (let i = 0; i < 6; i++) d += ` q12.5 ${-amp * 2} 25 0 q12.5 ${amp * 2} 25 0`;
  return `${d} L150 140 L-150 140 Z`;
};
const WAVE_A = wave(3.2);
const WAVE_B = wave(2.1);

const RING_R = 56;
const RING_C = 2 * Math.PI * RING_R;

export interface ShdMarkProps {
  /** ความกว้าง/สูงเป็น px */
  size?: number;
  /** 0–1 ถ้าส่งมาจะเป็นแบบรู้ความคืบหน้า ถ้าไม่ส่งจะวิ่งวนไปเรื่อย ๆ */
  progress?: number;
  /** ซ่อนวงแหวนหมุนรอบนอก (ใช้ตอนต้องการแค่โลโก้นิ่ง ๆ) */
  ring?: boolean;
  className?: string;
}

/** เครื่องหมายวงกลม SHD แบบเคลื่อนไหว — ใช้เดี่ยว ๆ ได้ทุกขนาด */
export function ShdMark({ size = 96, progress, ring = true, className }: ShdMarkProps) {
  const uid = useId().replace(/:/g, '');
  const determinate = typeof progress === 'number';
  const p = determinate ? Math.min(1, Math.max(0, progress!)) : 0;
  /* ขนาดเล็กต้องใช้เส้นหนาขึ้นตามสัดส่วน ไม่งั้นวงแหวนจะบางจนมองไม่เห็นว่าหมุน */
  const ringW = size < 26 ? 8 : size < 44 ? 5 : 3;

  return (
    <svg
      viewBox="-10 -10 120 120"
      width={size}
      height={size}
      className={cn('shd-mark', className)}
      role="img"
      aria-label="SHD"
    >
      <defs>
        <clipPath id={`drop-${uid}`}>
          <path d={SHD_MARK.drop} />
        </clipPath>
        <linearGradient id={`liq-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE066" />
          <stop offset="0.45" stopColor={SHD_COLOR.gold} />
          <stop offset="1" stopColor={SHD_COLOR.goldDeep} />
        </linearGradient>
        <linearGradient id={`ring-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={SHD_COLOR.gold} stopOpacity="0" />
          <stop offset="0.55" stopColor={SHD_COLOR.gold} stopOpacity="0.85" />
          <stop offset="1" stopColor="#FFE9A3" />
        </linearGradient>
        <radialGradient id={`sheen-${uid}`} cx="0.32" cy="0.26" r="0.62">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.16" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* วงแหวนรอบนอก : แบบรู้ % จะกวาดตามความคืบหน้า แบบไม่รู้ % จะหมุนวน */}
      {ring && (
        <g className="shd-ring-wrap">
          <circle cx="50" cy="50" r={RING_R} fill="none" stroke={SHD_COLOR.disc} strokeOpacity="0.12" strokeWidth={ringW} />
          <circle
            cx="50"
            cy="50"
            r={RING_R}
            fill="none"
            stroke={`url(#ring-${uid})`}
            strokeWidth={ringW}
            /* p = 0 กับ linecap แบบกลมจะเหลือจุดค้างไว้ จึงตัดหัวตรงตอนยังไม่เริ่ม */
            strokeLinecap={determinate && p === 0 ? 'butt' : 'round'}
            strokeDasharray={determinate ? `${RING_C * p} ${RING_C}` : `${RING_C * 0.28} ${RING_C}`}
            transform="rotate(-90 50 50)"
            className={determinate ? 'shd-ring-progress' : 'shd-ring-spin'}
          />
        </g>
      )}

      <g className="shd-breathe">
        {/* จานวงกลมสีน้ำตาลของโลโก้ */}
        <circle cx="50" cy="50" r="50" fill={SHD_COLOR.disc} />
        <circle cx="50" cy="50" r="50" fill={`url(#sheen-${uid})`} />

        {/* ของเหลวสีทองไหลขึ้นในหยดน้ำ */}
        <g clipPath={`url(#drop-${uid})`}>
          <g
            className={determinate ? 'shd-level' : 'shd-tide'}
            style={determinate ? { transform: `translateY(${levelY(p)}px)` } : undefined}
          >
            <g className="shd-wave-b">
              <path d={WAVE_B} fill={`url(#liq-${uid})`} opacity="0.45" />
            </g>
            <g className="shd-wave-a">
              <path d={WAVE_A} fill={`url(#liq-${uid})`} />
            </g>
          </g>
        </g>

        {/* กรอบข้าวหลามตัดวางทับสุดท้าย ของเหลวจึงไม่มีทางล้นออกนอกกรอบ */}
        <path d={SHD_MARK.frame} fill={SHD_COLOR.gold} />
      </g>
    </svg>
  );
}

/** ตัวหมุนขนาดเล็กสำหรับวางในปุ่ม/แถวตาราง */
export function ShdSpinner({ size = 18, className }: { size?: number; className?: string }) {
  return <ShdMark size={size} className={className} />;
}

export interface ShdLoaderProps {
  size?: number;
  progress?: number;
  label?: string;
  sublabel?: string;
  className?: string;
}

/** บล็อกรอแบบมีข้อความ ใช้วางกลางการ์ดหรือกลางหน้า */
export function ShdLoader({ size = 88, progress, label, sublabel, className }: ShdLoaderProps) {
  const pct = typeof progress === 'number' ? Math.round(Math.min(1, Math.max(0, progress)) * 100) : null;
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3 py-8 text-center', className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <ShdMark size={size} progress={progress} />
      {label && (
        <p className="text-sm font-medium text-ink-700">
          {label}
          {pct !== null && <span className="ml-1.5 tabular-nums text-ink-400">{pct}%</span>}
        </p>
      )}
      {sublabel && <p className="max-w-xs text-xs text-ink-400">{sublabel}</p>}
    </div>
  );
}

/** โลโก้เต็มพร้อมแสงกวาดผ่านตัวอักษร ใช้ตอนเปิดแอปครั้งแรก */
export function ShdWordmark({ width = 240, shimmer = true, className }: { width?: number; shimmer?: boolean; className?: string }) {
  const uid = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 400 101" width={width} height={(width * 101) / 400} className={className} role="img" aria-label="SHD">
      <defs>
        <linearGradient id={`w-${uid}`} x1="0" y1="0" x2="1" y2="0.35">
          {SHD_WORD_STOPS.map(([o, c]) => (
            <stop key={o} offset={o} stopColor={c} />
          ))}
        </linearGradient>
        <linearGradient id={`sh-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="0.5" stopColor="#FFF6D8" stopOpacity="0.75" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`wc-${uid}`}>
          <path d={SHD_WORD} />
        </clipPath>
      </defs>

      <path d={SHD_WORD} fill={`url(#w-${uid})`} />
      {shimmer && (
        <g clipPath={`url(#wc-${uid})`}>
          <rect className="shd-sheen" x="-140" y="-30" width="90" height="160" fill={`url(#sh-${uid})`} transform="skewX(-16)" />
        </g>
      )}

      <circle cx="350.125" cy="50.5" r="46.125" fill={SHD_COLOR.disc} />
      <g transform="translate(304 4.375) scale(0.9225)">
        <path d={SHD_MARK.frame} fill={SHD_COLOR.gold} />
      </g>
    </svg>
  );
}

/**
 * ฉากรอเต็มจอ ใช้ตอนแอปกำลังบูตหรือกำลังเตรียมไฟล์ก้อนใหญ่
 * ปิด scroll ของหน้าหลังไว้ระหว่างแสดงผล
 */
export function ShdOverlay({
  open, label, sublabel, progress,
}: {
  open: boolean;
  label?: string;
  sublabel?: string;
  progress?: number;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="shd-overlay fixed inset-0 z-[100] flex items-center justify-center bg-white/78 backdrop-blur-sm">
      <ShdLoader size={104} progress={progress} label={label} sublabel={sublabel} />
    </div>,
    document.body
  );
}

/** ฉากเปิดแอป : โลโก้เต็ม + แถบความคืบหน้าไหลวน */
export function ShdSplash({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-7 px-6">
      <ShdWordmark width={228} />
      <div className="h-1 w-52 overflow-hidden rounded-full bg-ink-200/70">
        <div className="shd-bar h-full w-1/3 rounded-full bg-gradient-to-r from-[#E5B564] via-[#FDCD0B] to-[#E5B564]" />
      </div>
      {label && <p className="text-xs tracking-wide text-ink-400">{label}</p>}
    </div>
  );
}
