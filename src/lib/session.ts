import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const COMPANY_COOKIE = 'ob_company';

export interface CompanyRef {
  id: string;
  code: string;
  name_th: string;
  name_en: string | null;
  name_zh: string | null;
  parent_id: string | null;
  tax_id: string | null;
  vat_rate: number;
}

export interface SessionContext {
  userId: string;
  email: string;
  fullName: string;
  isGroupAdmin: boolean;
  companies: CompanyRef[];
  company: CompanyRef;
  /** resource -> actions[] */
  permissions: Record<string, string[]>;
  lockedThrough: string | null;
}

function buildPermissionMap(rows: any[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const r of rows || []) {
    map[r.resource] = Array.from(new Set([...(map[r.resource] || []), ...(r.actions || [])]));
  }
  return map;
}

export function can(ctx: SessionContext | null, resource: string, action: string): boolean {
  if (!ctx) return false;
  if (ctx.isGroupAdmin) return true;
  const p = ctx.permissions;
  const check = (key: string) => {
    const acts = p[key];
    return !!acts && (acts.includes('*') || acts.includes(action));
  };
  if (check('*')) return true;
  if (check(resource)) return true;
  // สิทธิ์ระดับกลุ่ม เช่น 'report' ครอบคลุม 'report.pl'
  const parts = resource.split('.');
  for (let i = parts.length - 1; i > 0; i--) {
    if (check(parts.slice(0, i).join('.'))) return true;
  }
  return false;
}

/**
 * อ่านบริบทผู้ใช้ของ request ปัจจุบัน
 *
 * ยิงฐานข้อมูลรอบเดียวผ่าน rpt_session_context (migration 0012)
 * เดิมต้องยิง 6 รอบเรียงกัน (getUser + 5 ตาราง) รวมกว่า 400 ms ต่อการเรียก 1 ครั้ง
 *
 * ตัวตนผู้ใช้ยืนยันที่ฐานข้อมูลเอง (auth.uid() ถอดจาก JWT) และ middleware ตรวจ token
 * กับ Auth server ให้แล้วก่อนเข้าถึงหน้า จึงไม่ต้องเรียก auth.getUser() ซ้ำอีกรอบ
 *
 * ห่อด้วย React cache() : ใน 1 request layout กับ page เรียกกี่ครั้งก็ยิงจริงครั้งเดียว
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = createClient();
  const cookieCompany = cookies().get(COMPANY_COOKIE)?.value || null;

  const { data } = await supabase.rpc('rpt_session_context', { p_company: cookieCompany });
  if (!data) return null;

  const raw = data as any;
  const list = (raw.companies || []) as CompanyRef[];
  const company = list.find((c) => c.id === raw.company_id) || list[0];
  if (!company) return null;

  return {
    userId: raw.user_id,
    email: raw.email || '',
    fullName: raw.full_name || raw.email || '',
    isGroupAdmin: !!raw.is_group_admin,
    companies: list,
    company,
    permissions: buildPermissionMap(raw.permissions || []),
    lockedThrough: raw.locked_through || null,
  };
});

export async function requireSession(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  return ctx;
}

export async function requirePermission(resource: string, action = 'view'): Promise<SessionContext> {
  const ctx = await requireSession();
  if (!can(ctx, resource, action)) redirect('/dashboard?denied=' + encodeURIComponent(resource));
  return ctx;
}
