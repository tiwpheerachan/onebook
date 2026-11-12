import { CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { requirePermission } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/server';
import { Card, CardHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';

export const dynamic = 'force-dynamic';

// ชนิดเอกสารที่คาดว่าต้องมี (ไว้เช็กว่าครบไหม)
const TYPES = ['invoice', 'receipt', 'expense', 'quotation', 'credit_note', 'billing_note', 'credit_note_expense', 'billing_note_expense'] as const;
const LABEL: Record<string, string> = {
  invoice: 'ใบแจ้งหนี้', receipt: 'ใบเสร็จรับเงิน', expense: 'ค่าใช้จ่าย', quotation: 'ใบเสนอราคา',
  credit_note: 'ใบลดหนี้ (ขาย)', billing_note: 'ใบวางบิล', credit_note_expense: 'ใบลดหนี้ซื้อ', billing_note_expense: 'ใบวางบิลซื้อ',
};
const fmtDate = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '–');

function ago(ts: string | null): { text: string; hours: number } {
  if (!ts) return { text: 'ยังไม่เคยซิงก์', hours: Infinity };
  const h = (Date.now() - new Date(ts).getTime()) / 3_600_000;
  if (h < 1) return { text: `${Math.max(1, Math.round(h * 60))} นาทีที่แล้ว`, hours: h };
  if (h < 24) return { text: `${Math.round(h)} ชม.ที่แล้ว`, hours: h };
  return { text: `${Math.round(h / 24)} วันที่แล้ว`, hours: h };
}
const fmtDT = (ts: string) =>
  new Date(ts).toLocaleString('th-TH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default async function PeakSyncHealthPage() {
  await requirePermission('report', 'view');
  const sb = createAdminClient();

  const [{ data: health }, { data: logs }] = await Promise.all([
    sb.rpc('peak_sync_health'),
    sb.from('peak_sync_log').select('run_id,at,source,doc_type,fetched,upserted,skipped,ok,error')
      .order('at', { ascending: false }).limit(300),
  ]);

  const byType = new Map<string, { cnt: number; latest_issued: string | null; last_synced: string | null }>();
  for (const r of (health ?? []) as any[]) byType.set(r.doc_type, { cnt: Number(r.cnt), latest_issued: r.latest_issued, last_synced: r.last_synced });

  // จัดกลุ่ม log เป็น "รอบ" ตาม run_id
  const runsMap = new Map<string, { at: string; source: string; types: Record<string, { upserted: number; ok: boolean; error: string | null }> }>();
  for (const r of (logs ?? []) as any[]) {
    let run = runsMap.get(r.run_id);
    if (!run) { run = { at: r.at, source: r.source, types: {} }; runsMap.set(r.run_id, run); }
    if (new Date(r.at) > new Date(run.at)) run.at = r.at;
    run.types[r.doc_type] = { upserted: Number(r.upserted), ok: r.ok, error: r.error };
  }
  const runs = [...runsMap.values()].sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 15);

  const staleCount = TYPES.filter((t) => ago(byType.get(t)?.last_synced ?? null).hours > 24).length;

  return (
    <div className="space-y-5">
      <CardHeader
        title="สุขภาพการซิงก์ PEAK"
        description="ดึงข้อมูลจาก PEAK อย่างเดียว (ไม่แก้ไข/ลบ) · เช็กว่าแต่ละประเภทครบและสดแค่ไหน"
      />

      {/* สรุปต่อประเภท */}
      <Card>
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-sm font-semibold text-ink-800">ความสดของข้อมูลแต่ละประเภท</h2>
          {staleCount > 0
            ? <span className="chip bg-amber-50 text-amber-700 ring-amber-200">{staleCount} ประเภทค้างเกิน 24 ชม.</span>
            : <span className="chip bg-emerald-50 text-emerald-700 ring-emerald-200">อัปเดตครบทุกประเภท</span>}
        </div>
        <Table>
          <THead><TR>
            <TH>ประเภทเอกสาร</TH><TH className="text-right">จำนวนในระบบ</TH>
            <TH>เอกสารล่าสุด</TH><TH>ซิงก์ล่าสุด</TH><TH>สถานะ</TH>
          </TR></THead>
          <TBody>
            {TYPES.map((t) => {
              const h = byType.get(t);
              const a = ago(h?.last_synced ?? null);
              const stale = a.hours > 24;
              return (
                <TR key={t}>
                  <TD><span className="font-medium text-ink-800">{LABEL[t]}</span>
                    <span className="ml-1 font-mono text-xxs text-ink-400">{t}</span></TD>
                  <TD className="text-right tabular-nums">{(h?.cnt ?? 0).toLocaleString()}</TD>
                  <TD>{fmtDate(h?.latest_issued ?? null)}</TD>
                  <TD className={stale ? 'text-amber-700' : 'text-ink-600'}>{a.text}</TD>
                  <TD>{stale
                    ? <span className="inline-flex items-center gap-1 text-xs text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> ค้าง</span>
                    : <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> สด</span>}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>

      {/* ประวัติการซิงก์ */}
      <Card>
        <div className="flex items-center gap-2 px-4 py-3">
          <RefreshCw className="h-4 w-4 text-ink-400" strokeWidth={1.8} />
          <h2 className="text-sm font-semibold text-ink-800">ประวัติการซิงก์ล่าสุด</h2>
        </div>
        <Table>
          <THead><TR>
            <TH>เวลา</TH><TH>ที่มา</TH><TH>ผลแต่ละประเภท (จำนวนที่ลง)</TH><TH className="text-right">รวม</TH>
          </TR></THead>
          <TBody>
            {runs.length === 0 && <EmptyRow colSpan={4} label="ยังไม่มีประวัติ — รอบซิงก์ถัดไปจะบันทึกที่นี่" />}
            {runs.map((run, i) => {
              const total = Object.values(run.types).reduce((s, x) => s + x.upserted, 0);
              const anyErr = Object.values(run.types).some((x) => !x.ok);
              return (
                <TR key={i}>
                  <TD className="whitespace-nowrap">{fmtDT(run.at)}</TD>
                  <TD><span className="chip bg-ink-100 text-ink-600">{run.source}</span></TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {TYPES.map((t) => {
                        const x = run.types[t];
                        if (!x) return null;
                        return x.ok
                          ? <span key={t} className="chip bg-emerald-50 text-emerald-700 ring-emerald-200" title={LABEL[t]}>{t.replace(/_/g, ' ')}: {x.upserted}</span>
                          : <span key={t} className="chip bg-rose-50 text-rose-700 ring-rose-200" title={x.error || ''}>{t.replace(/_/g, ' ')}: พลาด</span>;
                      })}
                    </div>
                  </TD>
                  <TD className={`text-right tabular-nums font-medium ${anyErr ? 'text-amber-700' : 'text-ink-800'}`}>{total.toLocaleString()}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
