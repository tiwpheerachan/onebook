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
  label: string;
  desc: string;
  href?: string;
  state: State;
  /** สิทธิ์ที่ต้องมีถึงจะเห็นรายการนี้ */
  resource?: string;
}

interface Group {
  id: string;
  title: string;
  icon: any;
  items: Item[];
}

const STATE: Record<State, { label: string; chip: string; Icon: any }> = {
  ready:   { label: 'พร้อมใช้',      chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200', Icon: Check },
  partial: { label: 'ใช้ได้บางส่วน', chip: 'bg-amber-50 text-amber-800 ring-amber-200',      Icon: CircleDashed },
  todo:    { label: 'ยังไม่มี',      chip: 'bg-ink-100 text-ink-500 ring-ink-200',            Icon: Minus },
  na:      { label: 'ไม่จำเป็น',     chip: 'bg-ink-50 text-ink-400 ring-ink-200',             Icon: Minus },
};

/**
 * หน้ารวมการตั้งค่าทั้งระบบ
 * บอกตรง ๆ ว่าอะไรพร้อมใช้ อะไรทำได้บางส่วน และอะไรยังไม่มี
 * จะได้ไม่ต้องเดาว่าตั้งค่านั้นอยู่ตรงไหนหรือมีหรือยัง
 */
const GROUPS: Group[] = [
  {
    id: 'org', title: 'ตั้งค่าองค์กร', icon: Building2,
    items: [
      { label: 'ข้อมูลกิจการ', desc: 'ชื่อ เลขผู้เสียภาษี ที่อยู่ สาขา — ใช้พิมพ์บนใบกำกับภาษี',
        href: '/settings/companies', state: 'ready', resource: 'settings.companies' },
      { label: 'โลโก้และตราประทับ', desc: 'ใส่ URL โลโก้และชื่อผู้มีอำนาจลงนามได้แล้ว ยังอัปโหลดไฟล์ตราประทับไม่ได้',
        href: '/settings/companies', state: 'partial', resource: 'settings.companies' },
      { label: 'บริษัทในเครือ', desc: 'เปิดบริษัทใหม่พร้อมผังบัญชีและบทบาทมาตรฐาน',
        href: '/settings/companies', state: 'ready', resource: 'settings.companies' },
    ],
  },
  {
    id: 'users', title: 'ตั้งค่าสิทธิ์ผู้ใช้งาน', icon: Users,
    items: [
      { label: 'ผู้ใช้งาน', desc: 'เพิ่ม/ปิดการใช้งาน และกำหนดบทบาทรายบริษัท',
        href: '/settings/users', state: 'ready', resource: 'settings.users' },
      { label: 'สิทธิ์การใช้งาน', desc: 'ตารางสิทธิ์รายเมนู 10 การกระทำ ต่อบทบาท',
        href: '/settings/roles', state: 'ready', resource: 'settings.roles' },
    ],
  },
  {
    id: 'doc', title: 'ตั้งค่าเอกสาร', icon: FileText,
    items: [
      { label: 'เลขที่เอกสาร', desc: 'รูปแบบและรอบรีเซ็ตเลข แยกได้ทั้ง 16 ประเภท',
        href: '/settings/numbering', state: 'ready', resource: 'settings.numbering' },
      { label: 'หมายเหตุท้ายเอกสาร', desc: 'ข้อความท้ายกระดาษตั้งได้ในข้อมูลกิจการ ยังตั้งแยกรายประเภทเอกสารไม่ได้',
        href: '/settings/companies', state: 'partial', resource: 'settings.companies' },
      { label: 'วันที่ครบกำหนด', desc: 'คิดจากเครดิตเทอมของผู้ติดต่อแต่ละราย ตั้งที่หน้าผู้ติดต่อ',
        href: '/contacts', state: 'partial', resource: 'contacts' },
      { label: 'ช่องทางการรับชำระเงิน', desc: 'บัญชีธนาคาร เงินสด และบัตร พร้อมผูกผังบัญชี',
        href: '/finance/channels', state: 'ready', resource: 'finance.channels' },
      { label: 'กลุ่มจัดประเภทผู้ติดต่อ', desc: 'กลุ่มกำหนดเองพร้อมสี จัดหลายรายพร้อมกันได้',
        href: '/contacts', state: 'ready', resource: 'contacts' },
      { label: 'ใบกำกับภาษีอิเล็กทรอนิกส์', desc: 'สร้าง XML มาตรฐาน ETDA ได้แล้ว รอใบรับรอง CA จึงจะนำส่งได้',
        href: '/tax/etax', state: 'partial', resource: 'tax.etax' },
      { label: 'บัญชีรายวัน', desc: 'สมุดรายวันและบัญชีแยกประเภท',
        href: '/accounting/journal', state: 'ready', resource: 'journal' },
      { label: 'การออกเอกสารต่อเนื่อง', desc: 'ใบเสนอราคา → ใบแจ้งหนี้ → ใบกำกับ → ใบเสร็จ และสายจัดซื้อ',
        state: 'ready' },
      { label: 'ลิงก์ให้ลูกค้าขอใบกำกับภาษี', desc: 'หน้าเว็บสาธารณะให้ลูกค้ากรอกข้อมูลขอใบกำกับเอง',
        state: 'todo' },
      { label: 'การแสดงข้อมูลสาธารณะ', desc: 'เปิดหน้าดูเอกสารแบบไม่ต้องล็อกอินด้วยลิงก์ลับ',
        state: 'todo' },
    ],
  },
  {
    id: 'policy', title: 'ตั้งค่านโยบายบัญชี', icon: BookLock,
    items: [
      { label: 'ล็อกข้อมูลการใช้งาน', desc: 'ปิดงวดพร้อมเก็บลายนิ้วมือตัวเลข ตรวจย้อนหลังได้ว่าถูกแก้ไหม',
        href: '/settings/period-lock', state: 'ready', resource: 'period' },
      { label: 'ประวัติการใช้งาน', desc: 'ใครทำอะไรเมื่อไร เก็บค่าก่อน-หลังการแก้ไข',
        href: '/settings/audit', state: 'ready', resource: 'settings.audit' },
      { label: 'ตรวจก่อนปิดงบ', desc: 'ไล่ตรวจ 15 ข้อที่นักบัญชีต้องเช็กเองทุกเดือน',
        href: '/accounting/close-check', state: 'ready', resource: 'report' },
      { label: 'ที่มาของตัวเลข', desc: 'สายธารเอกสารและเจาะจากยอดในงบลงไปหาต้นตอ',
        state: 'ready' },
      { label: 'การแสดงผล Smart Insight', desc: 'ผู้ช่วยสรุปงานและผลตรวจ ตั้งค่า AI ได้ใน .env',
        href: '/tasks', state: 'ready', resource: 'tasks' },
      { label: 'ความปลอดภัย', desc: 'จำกัด IP ที่เข้าได้ นโยบายเซสชัน และ security header',
        href: '/settings/security', state: 'ready', resource: 'settings.security' },
      { label: 'นำเข้าข้อมูล', desc: 'ย้ายผู้ติดต่อ สินค้า และผังบัญชีจากโปรแกรมเดิม',
        href: '/settings/data-import', state: 'ready', resource: 'contacts' },
      { label: 'กันสร้างชื่อซ้ำ', desc: 'ตอนนี้กันซ้ำที่รหัสและเลขผู้เสียภาษี ยังไม่กันชื่อคล้ายกัน',
        state: 'partial' },
      { label: 'ประเภทราคา', desc: 'ตั้งราคาหลายระดับต่อสินค้า เช่น ราคาส่ง ราคาสมาชิก',
        state: 'todo' },
      { label: 'ส่งรายงานทางอีเมลอัตโนมัติ', desc: 'สรุปยอดรายวัน/รายสัปดาห์ส่งเข้าอีเมลผู้บริหาร',
        state: 'todo' },
    ],
  },
  {
    id: 'ext', title: 'ตั้งค่าเชื่อมต่อระบบภายนอก', icon: Plug,
    items: [
      { label: 'เชื่อมต่อ e-Tax Invoice', desc: 'ตั้ง ETAX_API_URL / API_KEY / CERT_ID ใน .env เมื่อได้ผู้ให้บริการแล้ว',
        href: '/tax/etax', state: 'partial', resource: 'tax.etax' },
      { label: 'เชื่อมต่อช่องทางขายออนไลน์', desc: 'Shopee, Lazada, TikTok — ลงบัญชีรอบโอนเงินอัตโนมัติ',
        href: '/settings/marketplace', state: 'partial', resource: 'settings.marketplace' },
      { label: 'อ่านเอกสารด้วย OCR/AI', desc: 'ต่อบริการ AICOM แล้วอัปโหลดบิลให้ระบบอ่านให้',
        href: '/documents/ai-import', state: 'partial', resource: 'documents.ai_import' },
      { label: 'ผู้ช่วย AI', desc: 'รองรับทั้ง Claude และ OpenAI ตั้ง AI_API_URL กับ AI_API_KEY',
        state: 'partial' },
      { label: 'เชื่อมต่อธนาคารอัตโนมัติ', desc: 'ตอนนี้นำเข้า statement เป็นไฟล์ CSV ยังไม่ได้ต่อ API ธนาคาร',
        href: '/finance/reconcile', state: 'partial', resource: 'finance.reconcile' },
    ],
  },
];

/** รายการที่ PEAK มีเพราะเป็นบริการรายเดือน แต่ระบบนี้ติดตั้งเองจึงไม่ต้องมี */
const NOT_APPLICABLE = [
  'ข้อมูลแพ็กเกจ / ต่ออายุ',
  'ข้อมูลการชำระค่าบริการ',
  'ข้อมูลบัตรเครดิต',
  'ลงทะเบียนสำนักงานบัญชี',
];

export default async function SettingsHubPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  const d = t();

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
        subtitle={`${ctx.company.name_th} · รวมการตั้งค่าทั้งระบบไว้ที่เดียว พร้อมบอกสถานะว่าอะไรใช้ได้แล้ว`}
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {([['ready', counts.ready], ['partial', counts.partial], ['todo', counts.todo]] as [State, number][]).map(
          ([k, n]) => (
            <span key={k} className={cn('chip', STATE[k].chip)}>
              {STATE[k].label} {n} รายการ
            </span>
          )
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {visible.map((g) => (
          <section key={g.id} className="card overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-ink-200 px-5 py-3.5">
              <g.icon className="h-4 w-4 text-ink-400" strokeWidth={1.8} />
              <h2 className="text-sm font-semibold text-ink-900">{g.title}</h2>
              <span className="ml-auto text-xxs text-ink-400">{g.items.length} รายการ</span>
            </div>

            <ul className="divide-y divide-ink-100">
              {g.items.map((i) => {
                const s = STATE[i.state];
                const body = (
                  <span className="flex items-start gap-3 px-5 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-ink-900">{i.label}</span>
                        <span className={cn('chip', s.chip)}>{s.label}</span>
                      </span>
                      <span className="mt-0.5 block text-xxs leading-relaxed text-ink-500">{i.desc}</span>
                    </span>
                    {i.href && <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink-300" strokeWidth={2} />}
                  </span>
                );
                return (
                  <li key={i.label}>
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
        <h2 className="text-sm font-semibold text-ink-900">ไม่มีในระบบนี้โดยตั้งใจ</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-500">
          ONEBOOK ติดตั้งบนเซิร์ฟเวอร์ของบริษัทเอง ไม่ได้เป็นบริการรายเดือน จึงไม่มีเมนูเหล่านี้ —
          ข้อมูลทั้งหมดอยู่ในฐานข้อมูลของคุณ ไม่มีค่าบริการรายผู้ใช้ และไม่มีวันหมดอายุ
        </p>
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {NOT_APPLICABLE.map((n) => (
            <li key={n} className="chip bg-ink-50 text-ink-400 ring-ink-200">{n}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
