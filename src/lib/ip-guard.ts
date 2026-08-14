/** ตรวจสอบ IP ต้นทางกับรายการที่อนุญาต (รองรับ IPv4 CIDR และ IP เดี่ยว) */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = (n << 8) + v;
  }
  return n >>> 0;
}

export function ipMatches(ip: string, rule: string): boolean {
  const r = rule.trim();
  if (!r) return false;
  if (r === '*') return true;
  if (r.includes('/')) {
    const [net, bitsRaw] = r.split('/');
    const bits = Number(bitsRaw);
    const a = ipv4ToInt(ip);
    const b = ipv4ToInt(net);
    if (a === null || b === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    if (bits === 0) return true;
    const mask = (0xffffffff << (32 - bits)) >>> 0;
    return (a & mask) === (b & mask);
  }
  return ip.trim() === r;
}

export function isIpAllowed(ip: string | null, allowlist: string): boolean {
  const rules = allowlist.split(',').map((s) => s.trim()).filter(Boolean);
  if (rules.length === 0) return true;           // ไม่ตั้งค่า = ไม่บังคับ
  if (!ip) return false;
  const candidate = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (candidate === '::1' || candidate === '127.0.0.1') return true;
  return rules.some((r) => ipMatches(candidate, r));
}

export function clientIpFromHeaders(h: Headers): string | null {
  const xff = h.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return h.get('x-real-ip') || h.get('cf-connecting-ip') || null;
}
