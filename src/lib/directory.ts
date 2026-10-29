import 'server-only';

/**
 * ค้นรายชื่อพนักงานจากระบบกลาง (sso.shd / GoodHR) — ใช้ตอนเพิ่มผู้ใช้/ให้สิทธิ์
 * scope directory:read:people · API key อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น (เรียกผ่าน server action)
 * ตั้งค่า env: CENTRAL_API_KEY (+ CENTRAL_DIRECTORY_URL ถ้าต่างจาก GOODHR_ISSUER)
 */

export interface DirectoryPerson {
  union_id: string;
  name: string;
  en_name: string | null;
  email: string | null;
  job_title: string | null;
  departments: string[];
  avatar_url: string | null;
  status: string;
}

export function directoryConfig() {
  const base = (process.env.CENTRAL_DIRECTORY_URL || process.env.GOODHR_ISSUER || '').replace(/\/+$/, '');
  const key = process.env.CENTRAL_API_KEY || process.env.DIRECTORY_API_KEY || '';
  return { base, key, ready: Boolean(base && key) };
}

export type DirectoryResult =
  | { ok: true; items: DirectoryPerson[]; synced_at: string | null; stale: boolean }
  | { ok: false; error: string };

export async function searchDirectory(q: string): Promise<DirectoryResult> {
  const { base, key, ready } = directoryConfig();
  if (!ready) return { ok: false, error: 'not_configured' };
  const term = q.trim();
  if (term.length < 2) return { ok: false, error: 'query_too_short' };

  const url = new URL(`${base}/api/v1/directory/search`);
  url.searchParams.set('q', term);
  url.searchParams.set('limit', '20');

  let res: Response;
  try {
    res = await fetch(url, { headers: { authorization: `Bearer ${key}` }, cache: 'no-store' });
  } catch {
    return { ok: false, error: 'central_unreachable' };
  }
  const data = (await res.json().catch(() => null)) as
    | { ok?: boolean; items?: DirectoryPerson[]; synced_at?: string | null; stale?: boolean; error?: string }
    | null;
  if (!res.ok || !data?.ok) return { ok: false, error: data?.error || `http_${res.status}` };
  return { ok: true, items: data.items ?? [], synced_at: data.synced_at ?? null, stale: Boolean(data.stale) };
}
