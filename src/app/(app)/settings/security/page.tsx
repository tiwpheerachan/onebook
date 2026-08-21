import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';
import { PageHeader, Card, CardHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Lock, Network, KeyRound, FileClock, Database } from 'lucide-react';

export const dynamic = 'force-dynamic';

const CONTROLS = [
  { icon: Network, title: 'จำกัดการเข้าถึงตามเครือข่าย (IP Allowlist)',
    body: 'middleware ตรวจ IP ต้นทางทุก request ก่อนเข้าถึงหน้าใด ๆ กำหนดค่าที่ตัวแปร ALLOWED_IPS รองรับทั้ง IP เดี่ยวและ CIDR หากเข้าจากนอกรายการจะได้รับ HTTP 403 ทันที' },
  { icon: Lock, title: 'Row Level Security ทุกตาราง',
    body: 'ทุกตารางเปิด RLS แบบ FORCE ผู้ใช้เห็นได้เฉพาะบริษัทที่ได้รับสิทธิ์ และทุกการกระทำ (ดู/สร้าง/แก้/ลบ) ตรวจสิทธิ์ที่ฐานข้อมูล แม้เรียกผ่าน API โดยตรงก็ข้ามไม่ได้' },
  { icon: KeyRound, title: 'สิทธิ์ละเอียดระดับเมนูและการกระทำ',
    body: 'บทบาทกำหนดได้เองไม่จำกัด แต่ละบทบาทระบุได้ว่าเห็นเมนูใด ทำอะไรได้บ้าง และซ่อนฟิลด์ใด เช่น ฝ่ายขายไม่เห็นราคาทุน' },
  { icon: FileClock, title: 'ปิดงวด (Freeze) ระดับฐานข้อมูล',
    body: 'trigger บังคับก่อน INSERT/UPDATE/DELETE ทุกครั้ง เอกสารและสมุดรายวันที่อยู่ในงวดที่ปิดแล้วแก้ไขไม่ได้ ยกเว้นผู้มีสิทธิ์ปลดล็อกซึ่งจะถูกบันทึกไว้' },
  { icon: Database, title: 'Audit trail ที่ลบไม่ได้',
    body: 'ทุกการเปลี่ยนแปลงบันทึก before/after เป็น JSON พร้อมผู้ใช้และเวลา ตาราง audit_logs ถอนสิทธิ์ INSERT/UPDATE/DELETE จาก role ผู้ใช้ทั้งหมด' },
  { icon: ShieldCheck, title: 'Security headers และป้องกัน CSRF',
    body: 'ตั้ง HSTS, nosniff, Referrer-Policy และตรวจ Origin ของ request ที่เป็น mutation เทียบกับ APP_ORIGIN ส่วนการฝังหน้าจอในเว็บอื่นคุมด้วย CSP frame-ancestors ซึ่งอนุญาตเฉพาะโดเมนที่กำหนดใน FRAME_ANCESTORS เท่านั้น ไม่ตั้งค่า = ห้ามฝังทั้งหมด' },
];

export default async function SecurityPage() {
  const ctx = await requirePermission('settings.security', 'view');
  const d = t();
  const supabase = createClient();
  const { data } = await supabase.from('ip_allowlist').select('*').order('created_at', { ascending: false });
  const rows = (data || []) as any[];

  return (
    <>
      <PageHeader title={d.nav.security} subtitle={`${ctx.company.name_th} · มาตรการควบคุมความปลอดภัยที่บังคับใช้อยู่`} />

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {CONTROLS.map((c) => (
          <div key={c.title} className="card card-pad">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50">
                <c.icon className="h-4 w-4 text-brand-600" strokeWidth={1.8} />
              </div>
              <div>
                <p className="text-sm font-medium text-ink-900">{c.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-600">{c.body}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader title="รายการ IP / CIDR ที่อนุญาต (เก็บในฐานข้อมูล)"
                    description="ใช้ประกอบกับตัวแปรสภาพแวดล้อม ALLOWED_IPS ซึ่งบังคับใช้ที่ middleware" />
        <Table>
          <THead><TR><TH>CIDR</TH><TH>คำอธิบาย</TH><TH>สถานะ</TH></TR></THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={3} label="ยังไม่ได้กำหนดในฐานข้อมูล — ใช้ค่าจาก ALLOWED_IPS" />}
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="font-mono text-xs">{r.cidr}</TD>
                <TD>{r.label || '–'}</TD>
                <TD>{r.is_active ? <Badge tone="success">ใช้งาน</Badge> : <Badge>ปิด</Badge>}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
