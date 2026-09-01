import 'server-only';
import { t } from '@/i18n/server';

/**
 * ดึงอัตราแลกเปลี่ยนจากธนาคารแห่งประเทศไทย
 *
 * ธปท. เปิด API ผ่าน API Gateway ซึ่งต้องสมัครขอ Client ID ก่อน
 * ตั้งค่าที่ BOT_API_KEY (และ BOT_API_URL ถ้าปลายทางเปลี่ยน)
 *
 * ถ้ายังไม่ได้ตั้งค่า ฟังก์ชันนี้จะบอกตรง ๆ ว่ายังไม่ได้ตั้ง ไม่ใช่เดาอัตราให้
 * เพราะอัตราแลกเปลี่ยนที่เดาผิดคือยอดซื้อที่ผิดตามไปทั้งใบ
 * ผู้ใช้ยังกรอกอัตราเองได้เสมอ
 *
 * ชุดข้อมูลที่ใช้คือ DAILY_AVG_EXCHANGE_RATE ซึ่งมีทั้งอัตราซื้อและอัตราขาย
 * ฝั่งซื้อสินค้าใช้ "อัตราขาย" เพราะต้องซื้อเงินตราต่างประเทศไปจ่ายผู้ขาย
 */

/**
 * ปลายทางตามสเปก OpenAPI ของบริการ
 * "Average Exchange Rate - THB / Foreign Currency" เวอร์ชัน 2.0.2
 *
 *   server : https://gateway.api.bot.or.th/Stat-ExchangeRate/v2
 *   path   : /DAILY_AVG_EXG_RATE/     ← ย่อว่า EXG ไม่ใช่ EXCHANGE
 *
 * หน่วยของอัตราคือ "บาทต่อ 1 หน่วยเงินตราต่างประเทศ" ตรงกับที่ fx_rate ต้องการพอดี
 * ประกาศทุกวันทำการ 18.00 น. ตามเวลาไทย ครอบคลุม 19 สกุล
 */
const DEFAULT_URL =
  'https://gateway.api.bot.or.th/Stat-ExchangeRate/v2/DAILY_AVG_EXG_RATE/';

export interface BotRate {
  currency: string;
  rate_date: string;
  rate_buy: number | null;
  rate_sell: number | null;
}

export interface BotResult {
  ok: boolean;
  rates?: BotRate[];
  /** เหตุผลที่ดึงไม่ได้ เอาไปแสดงบนหน้าจอ */
  note?: string;
  not_configured?: boolean;
}

export function isBotConfigured(): boolean {
  return !!process.env.BOT_API_KEY;
}

/** ตัวเลขจาก ธปท. มาเป็นข้อความ และเป็นค่าว่างในวันหยุด */
function num(v: unknown): number | null {
  const n = Number(String(v ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * บางสกุลประกาศเป็นราคาต่อหลายหน่วย ไม่ใช่ต่อหนึ่งหน่วย
 *
 * หัวรายงานเขียนว่า "Baht / 1 Unit of Foreign Currency" แต่ไม่จริงทุกสกุล
 * ตัวคูณซ่อนอยู่ในชื่อสกุลแทน เช่น "JAPAN : YEN (100 YEN) (JPY)"
 * แปลว่า 21.05 คือบาทต่อ 100 เยน ไม่ใช่ต่อ 1 เยน
 *
 * ถ้าไม่หารกลับ ใบสั่งซื้อสกุลเยนจะคิดเป็นบาทเกินจริงร้อยเท่า
 * ตรวจกับของจริงแล้ว ในสกุลที่ระบบเปิดให้เลือก มีเยนสกุลเดียวที่เป็นแบบนี้
 * แต่เขียนเป็นการอ่านตัวเลขจากชื่อ เผื่อสกุลอื่นที่ ธปท. ประกาศแบบเดียวกัน
 */
function unitFactor(name: unknown): number {
  const m = /\((\d+)\s+[A-Z]/.exec(String(name ?? ''));
  const n = m ? Number(m[1]) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** ขยับวันแบบ UTC เพื่อไม่ให้เขตเวลาของเซิร์ฟเวอร์ทำให้ขอบช่วงเลื่อน */
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * ดึงย้อนหลังหลายวัน
 *
 * ธปท. จำกัดช่วงต่อหนึ่งคำขอไว้ที่ 31 วัน (ทดสอบแล้วขอ 3 เดือนได้ HTTP 400
 * พร้อมข้อความ "Exceed limit period. Limit period is 31 days")
 * จึงต้องซอยเป็นช่วงละ 31 วันแล้วต่อกันเอง
 *
 * ยิงทีละช่วงตามลำดับ ไม่ยิงขนาน เพราะแผนที่สมัครไว้จำกัด 200 ครั้งต่อชั่วโมง
 * และการดึงย้อนหลังหนึ่งปีก็ใช้แค่สิบสองครั้ง ไม่ต้องรีบ
 */
export async function fetchBotRange(
  currency: string,
  from: string,
  to: string,
): Promise<BotResult> {
  const seen = new Map<string, BotRate>();
  let note: string | undefined;
  let cursor = from;

  while (cursor <= to) {
    const stop = addDays(cursor, 30) > to ? to : addDays(cursor, 30);
    const res = await fetchBotRates(currency, cursor, stop);
    if (res.ok) {
      for (const r of res.rates || []) seen.set(r.rate_date, r);
    } else {
      if (res.not_configured) return res;
      // ช่วงที่ไม่มีข้อมูลไม่ควรทำให้ทั้งก้อนล้ม เก็บเหตุผลไว้เผื่อไม่ได้อะไรเลย
      note = res.note;
    }
    cursor = addDays(stop, 1);
  }

  if (seen.size === 0) return { ok: false, note };
  return {
    ok: true,
    rates: [...seen.values()].sort((a, b) => a.rate_date.localeCompare(b.rate_date)),
  };
}

export async function fetchBotRates(
  currency: string,
  date: string,
  endDate?: string,
): Promise<BotResult> {
  const L = t().ui.fx;
  if (!isBotConfigured()) {
    return { ok: false, not_configured: true, note: L.botNotConfigured };
  }

  const base = (process.env.BOT_API_URL || DEFAULT_URL).replace(/\/+$/, '') + '/';
  const url = new URL(base);
  // ถามวันเดียวแล้วตรงกับวันหยุดจะได้ผลลัพธ์ว่าง จึงถอยไปเจ็ดวันให้เสมอ
  // ผู้เรียกเป็นคนเลือกเองว่าจะใช้แถวไหน (ปกติคือแถวล่าสุดที่ไม่เกินวันที่ขอ)
  url.searchParams.set('start_period', endDate ? date : addDays(date, -7));
  url.searchParams.set('end_period', endDate || date);
  url.searchParams.set('currency', currency.toUpperCase());

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url.toString(), {
      signal: ctrl.signal,
      cache: 'no-store',
      headers: {
        // สเปกระบุ securityScheme เป็น type: apiKey, name: Authorization, in: header
        // จึงส่ง token ดิบ ๆ ไม่ใส่คำว่า Bearer นำหน้า
        // (ถ้าเป็น bearer จริง สเปกจะเขียน type: http, scheme: bearer)
        // เผื่อเกตเวย์เปลี่ยนใจ ตั้ง BOT_API_AUTH เป็น bearer หรือ client-id เพื่อสลับได้
        ...(process.env.BOT_API_AUTH === 'client-id'
          ? { 'X-IBM-Client-Id': process.env.BOT_API_KEY! }
          : process.env.BOT_API_AUTH === 'bearer'
            ? { authorization: `Bearer ${process.env.BOT_API_KEY}` }
            : { authorization: process.env.BOT_API_KEY! }),
        accept: 'application/json',
      },
    });
    clearTimeout(timer);

    if (!res.ok) {
      return {
        ok: false,
        note: L.botHttpFailed.replace('{status}', String(res.status)),
      };
    }

    const json: any = await res.json();
    // โครงสร้างของ ธปท. : result.data.data_detail เป็นอาร์เรย์รายวันรายสกุล
    // เผื่อพอร์ทัลใหม่ห่อไม่เหมือนเดิม จึงลองหลายรูปแบบก่อนยอมแพ้
    // สเปกยืนยันแล้วว่าเป็น result.data.data_detail
    // ตัวสำรองไว้เผื่อเกตเวย์ห่อต่างออกไป จะได้ไม่ล้มทั้งก้อน
    const rows: any[] =
      json?.result?.data?.data_detail ??
      json?.data?.data_detail ??
      (Array.isArray(json) ? json : []);
    const rates: BotRate[] = rows
      .map((r) => {
        // หารด้วยตัวคูณให้เป็น "บาทต่อ 1 หน่วย" เสมอ ซึ่งเป็นหน่วยที่ fx_rate ใช้
        const per = unitFactor(r.currency_name_eng);
        const buy = num(r.buying_sight ?? r.buying_transfer);
        const sell = num(r.selling);
        return {
          currency: String(r.currency_id || currency).toUpperCase(),
          rate_date: String(r.period || date).slice(0, 10),
          rate_buy: buy == null ? null : buy / per,
          rate_sell: sell == null ? null : sell / per,
        };
      })
      .filter((r) => r.rate_sell != null || r.rate_buy != null);

    if (rates.length === 0) return { ok: false, note: L.botNoData };
    return { ok: true, rates };
  } catch (e: any) {
    clearTimeout(timer);
    const reason = e?.name === 'AbortError' ? L.botTimeout : L.botFailed;
    return { ok: false, note: reason };
  }
}
