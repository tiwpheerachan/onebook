import { cn } from '@/lib/cn';

export interface FxPoint { date: string; sell: number; pct: number | null }

/**
 * เส้นแสดงความเคลื่อนไหวของอัตรา
 *
 * วาดเป็น SVG ตรง ๆ ไม่ใช้ไลบรารีกราฟ เพราะข้อมูลเป็นเส้นเดียว
 * และของที่วาดต่อเนื่องบนหน้าจอเป็นเรื่องที่โครงการนี้ระวังอยู่แล้ว
 * SVG นิ่ง ๆ ไม่กิน GPU เลย และพิมพ์ออกกระดาษได้ด้วย
 *
 * แกนตั้งไม่เริ่มจากศูนย์ เพราะอัตราแลกเปลี่ยนขยับกันที่ทศนิยม
 * ถ้าเริ่มจากศูนย์เส้นจะแบนจนมองไม่เห็นการเปลี่ยนแปลง
 */
export function FxLine({
  points, height = 160, labels,
}: {
  points: FxPoint[];
  height?: number;
  labels: { low: string; high: string };
}) {
  if (points.length < 2) return null;

  const W = 1000;
  const H = height;
  const PAD = 8;
  const vals = points.map((p) => Number(p.sell));
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;

  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const y = (v: number) => PAD + (1 - (v - lo) / span) * (H - PAD * 2);

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(Number(p.sell)).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z`;

  const first = Number(points[0].sell);
  const last = Number(points[points.length - 1].sell);
  const up = last > first;
  const stroke = up ? 'stroke-rose-500' : 'stroke-emerald-500';
  const fill = up ? 'fill-rose-500/10' : 'fill-emerald-500/10';

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
           className="h-40 w-full" role="img">
        <path d={area} className={fill} />
        <path d={line} className={cn('fill-none', stroke)} strokeWidth={2}
              vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {/* จุดปลายทางขวา บอกค่าล่าสุด */}
        <circle cx={x(points.length - 1)} cy={y(last)} r={3}
                className={up ? 'fill-rose-500' : 'fill-emerald-500'}
                vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="pointer-events-none absolute left-1 top-0 text-xxs tabular-nums text-ink-400">
        {labels.high} {hi.toFixed(4)}
      </span>
      <span className="pointer-events-none absolute bottom-0 left-1 text-xxs tabular-nums text-ink-400">
        {labels.low} {lo.toFixed(4)}
      </span>
    </div>
  );
}
