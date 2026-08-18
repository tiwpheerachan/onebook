'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { money } from '@/lib/format';
import { docKindLabel } from '@/lib/search-meta';
import { docHref } from '@/lib/search-meta';
import { layout, NODE_W, NODE_H, type GraphInput, type NodeType, type EdgeKind } from '@/lib/trace-graph';
import type { Dictionary } from '@/i18n';

/** สีของแต่ละชนิดโหนด อ้างชุดสีเดียวกับที่ใช้ทั้งระบบ */
const STYLE: Record<NodeType, { fill: string; stroke: string; text: string; dot: string }> = {
  document: { fill: '#ffffff', stroke: '#a9eade', text: '#135353', dot: '#14827c' },
  journal:  { fill: '#f7f8fa', stroke: '#c6cdd9', text: '#3a4353', dot: '#4d5768' },
  payment:  { fill: '#ecfdf5', stroke: '#a7f3d0', text: '#065f46', dot: '#059669' },
  stock:    { fill: '#fffbeb', stroke: '#fde68a', text: '#92400e', dot: '#d97706' },
  tax:      { fill: '#f0f9ff', stroke: '#bae6fd', text: '#075985', dot: '#0284c7' },
  contact:  { fill: '#f7f8fa', stroke: '#dfe3ea', text: '#4d5768', dot: '#98a2b3' },
};

const EDGE_COLOR: Record<EdgeKind, string> = {
  derives: '#14827c', posts: '#98a2b3', settles: '#059669',
  moves: '#d97706', issues: '#0284c7', party: '#c6cdd9',
};

/**
 * แผนภาพที่มาของตัวเลข
 *
 * วาดด้วย SVG เองแทนการเพิ่มไลบรารีกราฟ เพราะผังเป็นแบบชั้น (layered DAG)
 * ที่คำนวณตำแหน่งตรง ๆ ได้ ไม่ต้องใช้ force simulation
 * และผลลัพธ์คงที่ทุกครั้งที่เปิด — สำคัญมากสำหรับงานตรวจสอบ
 * ถ้าตำแหน่งขยับไปมาทุกครั้งที่โหลด คนจะเทียบภาพเดิมกับภาพใหม่ไม่ได้
 */
export function TraceMap({ graph, d }: { graph: GraphInput; d: Dictionary }) {
  const router = useRouter();
  const L = d.ui.graph;
  const [hover, setHover] = useState<string | null>(null);

  const { nodes, edges, width, height } = useMemo(() => layout(graph), [graph]);

  // โหนดที่เกี่ยวข้องกับตัวที่ชี้อยู่ ใช้หรี่ตัวอื่นให้จาง
  const related = useMemo(() => {
    if (!hover) return null;
    const s = new Set<string>([hover]);
    for (const e of edges) {
      if (e.from === hover) s.add(e.to);
      if (e.to === hover) s.add(e.from);
    }
    return s;
  }, [hover, edges]);

  const hrefOf = (n: (typeof nodes)[number]): string | null => {
    if (n.type === 'document') return n.kind ? docHref(n.kind as any, n.ref) : null;
    if (n.type === 'journal') return `/accounting/journal?q=${encodeURIComponent(n.label)}`;
    if (n.type === 'payment') return `/finance/payments?q=${encodeURIComponent(n.label)}`;
    if (n.type === 'stock') return `/inventory`;
    if (n.type === 'contact') return `/contacts?q=${encodeURIComponent(n.sublabel || n.label)}`;
    return null;
  };

  const typeLabel: Record<NodeType, string> = {
    document: L.nDocument, journal: L.nJournal, payment: L.nPayment,
    stock: L.nStock, tax: L.nTax, contact: L.nContact,
  };

  if (nodes.length <= 1) {
    return <p className="py-10 text-center text-sm text-ink-400">{L.empty}</p>;
  }

  return (
    <div>
      {graph.truncated && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
          {L.truncated}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-ink-200 bg-ink-50/40 p-2">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={L.title}
          className="block"
        >
          <defs>
            {Object.entries(EDGE_COLOR).map(([k, c]) => (
              <marker
                key={k}
                id={`arrow-${k}`}
                viewBox="0 0 8 8"
                refX="7" refY="4"
                markerWidth="7" markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 8 4 L 0 8 z" fill={c} />
              </marker>
            ))}
          </defs>

          {/* ---------- เส้นเชื่อม ---------- */}
          {edges.map((e, i) => {
            const dim = !!related && !(related.has(e.from) && related.has(e.to));
            return (
              <path
                key={i}
                d={e.path}
                fill="none"
                stroke={EDGE_COLOR[e.kind]}
                strokeWidth={e.kind === 'derives' ? 2 : 1.25}
                strokeDasharray={e.kind === 'party' ? '3 3' : undefined}
                markerEnd={`url(#arrow-${e.kind})`}
                opacity={dim ? 0.12 : 0.85}
                style={{ transition: 'opacity .15s' }}
              />
            );
          })}

          {/* ---------- กล่องโหนด ---------- */}
          {nodes.map((n) => {
            const s = STYLE[n.type];
            const dim = !!related && !related.has(n.id);
            const href = hrefOf(n);
            const kindText =
              n.type === 'document' ? docKindLabel(d, n.kind || '')
              : n.type === 'stock' ? `${n.label} ${L.moves}`
              : typeLabel[n.type];

            return (
              <g
                key={n.id}
                transform={`translate(${n.x},${n.y})`}
                opacity={dim ? 0.25 : 1}
                style={{ transition: 'opacity .15s', cursor: href ? 'pointer' : 'default' }}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => href && router.push(href)}
              >
                <rect
                  width={NODE_W} height={NODE_H} rx={10}
                  fill={n.current ? '#eefbf8' : s.fill}
                  stroke={n.current ? '#14827c' : s.stroke}
                  strokeWidth={n.current ? 2 : 1}
                />
                <circle cx={12} cy={12} r={3.5} fill={s.dot} />

                <text x={22} y={16} fontSize={9} fill={s.text} opacity={0.75}>
                  {kindText.length > 20 ? kindText.slice(0, 19) + '…' : kindText}
                </text>
                <text x={11} y={33} fontSize={12} fontWeight={600} fill={s.text}>
                  {n.label.length > 20 ? n.label.slice(0, 19) + '…' : n.label}
                </text>

                {n.type !== 'contact' && typeof n.amount === 'number' && (
                  <text x={NODE_W - 11} y={47} fontSize={10} textAnchor="end" fill={s.text} opacity={0.8}>
                    {money(n.amount)}
                  </text>
                )}
                {n.date && (
                  <text x={11} y={47} fontSize={9} fill={s.text} opacity={0.55}>
                    {String(n.date).slice(0, 10)}
                  </text>
                )}
                {n.type === 'contact' && n.sublabel && (
                  <text x={11} y={47} fontSize={9} fill={s.text} opacity={0.55}>
                    {n.sublabel}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* ---------- คำอธิบายสัญลักษณ์ ---------- */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xxs text-ink-500">
        <span className="font-semibold uppercase tracking-wide text-ink-400">{L.legend}</span>
        {(Object.keys(STYLE) as NodeType[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: STYLE[k].dot }} />
            {typeLabel[k]}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: EDGE_COLOR.derives }} />
          {L.eDerives}
        </span>
        <span className={cn('ml-auto')}>{L.hint}</span>
      </div>
    </div>
  );
}
