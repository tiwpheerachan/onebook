'use client';
import { useState } from 'react';
import { List, Network } from 'lucide-react';
import { cn } from '@/lib/cn';
import { TraceMap } from './trace-map';
import type { GraphInput } from '@/lib/trace-graph';
import type { Dictionary } from '@/i18n';

/**
 * สลับระหว่างมุมมองรายการกับแผนภาพ
 *
 * ส่วนรายการเป็น server component อยู่แล้ว จึงรับเข้ามาเป็น ReactNode
 * ไม่ต้องแปลงทั้งก้อนเป็น client เพียงเพราะอยากได้ปุ่มสลับสองปุ่ม
 */
export function TraceTabs({
  list, graph, d,
}: {
  list: React.ReactNode;
  graph: GraphInput;
  d: Dictionary;
}) {
  const [view, setView] = useState<'map' | 'list'>('map');
  const L = d.ui.graph;

  const Tab = ({ id, icon, label }: { id: 'map' | 'list'; icon: React.ReactNode; label: string }) => (
    <button
      type="button"
      onClick={() => setView(id)}
      className={cn(
        'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition',
        view === id ? 'bg-white font-medium text-brand-700 shadow-card' : 'text-ink-500 hover:text-ink-800'
      )}
    >
      {icon}{label}
    </button>
  );

  return (
    <>
      <div className="mb-4 inline-flex rounded-xl bg-ink-100 p-1">
        <Tab id="map" icon={<Network className="h-3.5 w-3.5" strokeWidth={1.8} />} label={L.mapView} />
        <Tab id="list" icon={<List className="h-3.5 w-3.5" strokeWidth={1.8} />} label={L.listView} />
      </div>

      {view === 'map' ? <TraceMap graph={graph} d={d} /> : list}
    </>
  );
}
