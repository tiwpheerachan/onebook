'use server';
import { revalidatePath } from 'next/cache';
import { getSessionContext, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';
import { fetchBotRates, fetchBotRange, isBotConfigured } from '@/lib/bot-fx';
import { bangkokToday } from '@/lib/format';

export interface RateResult {
  ok: boolean;
  error?: string;
  rate?: number | null;
  rateDate?: string | null;
  source?: string | null;
  /** true = ได้อัตราของวันที่ขอพอดี, false = ถอยไปวันทำการก่อนหน้า */
  exact?: boolean;
  notConfigured?: boolean;
}

/**
 * หาอัตราของวันที่ต้องการ
 *
 * ลำดับ : ดูในฐานข้อมูลก่อน ถ้าไม่มีค่อยยิงไป ธปท. แล้วเก็บไว้ใช้ครั้งหน้า
 * ทำแบบนี้เพื่อไม่ยิง API ซ้ำทุกครั้งที่เปิดเอกสารเดิม
 */
export async function getExchangeRate(currency: string, date: string): Promise<RateResult> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: t().ui.act.noSession };
  const L = t().ui.fx;
  const supabase = createClient();

  const { data: cached } = await supabase.rpc('rpt_exchange_rate', {
    p_currency: currency, p_date: date,
  });
  const c = (cached || {}) as any;
  if (c.rate_sell) {
    return {
      ok: true, rate: Number(c.rate_sell), rateDate: c.rate_date,
      source: c.source, exact: !!c.is_exact,
    };
  }

  if (!isBotConfigured()) {
    return { ok: false, notConfigured: true, error: L.botNotConfigured };
  }

  const bot = await fetchBotRates(currency, date);
  if (!bot.ok) return { ok: false, error: bot.note, notConfigured: bot.not_configured };

  for (const r of bot.rates || []) {
    await supabase.rpc('upsert_exchange_rate', {
      p_currency: r.currency, p_date: r.rate_date,
      p_buy: r.rate_buy, p_sell: r.rate_sell, p_source: 'bot',
    });
  }

  // ธปท. คืนมาหลายวันเสมอ (ถอยเผื่อวันหยุดไว้) เอาแถวล่าสุดที่ไม่เกินวันที่ขอ
  const hit = (bot.rates || [])
    .filter((r) => r.rate_sell != null && r.rate_date <= date)
    .sort((a, b) => b.rate_date.localeCompare(a.rate_date))[0];
  if (!hit) return { ok: false, error: L.botNoData };
  return { ok: true, rate: hit.rate_sell, rateDate: hit.rate_date, source: 'bot', exact: hit.rate_date === date };
}

/** กรอกอัตราเอง เก็บไว้ใช้ซ้ำและให้ตรวจย้อนได้ว่าใครกรอก */
export async function saveManualRate(currency: string, date: string, rate: number) {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: t().ui.act.noSession };
  if (!can(ctx, 'documents', 'edit')) return { ok: false, error: t().ui.act.noPermission };
  const r = Number(rate);
  if (!Number.isFinite(r) || r <= 0) return { ok: false, error: t().ui.fx.needRate };

  const supabase = createClient();
  const { error } = await supabase.rpc('upsert_exchange_rate', {
    p_currency: currency, p_date: date, p_buy: null, p_sell: r, p_source: 'manual',
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * ดึงอัตราย้อนหลังทั้งช่วงมาเก็บไว้ เพื่อให้มีข้อมูลพอจะดูความเคลื่อนไหว
 *
 * ยิง ธปท. ครั้งเดียวต่อสกุล เพราะ API รับช่วงวันที่อยู่แล้ว
 * แล้วเขียนลงฐานข้อมูลรวดเดียวด้วย upsert_exchange_rates
 */
export async function backfillRates(currencies: string[], from: string, to: string) {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: t().ui.act.noSession };
  if (!can(ctx, 'documents', 'edit')) return { ok: false, error: t().ui.act.noPermission };
  if (!isBotConfigured()) return { ok: false, notConfigured: true, error: t().ui.fx.botNotConfigured };

  const supabase = createClient();
  let saved = 0;
  const failed: string[] = [];

  for (const cur of currencies) {
    const res = await fetchBotRange(cur, from, to);
    if (!res.ok || !res.rates?.length) { failed.push(cur); continue; }
    const { data, error } = await supabase.rpc('upsert_exchange_rates', {
      p_rows: res.rates.map((r) => ({
        currency: r.currency, rate_date: r.rate_date,
        rate_buy: r.rate_buy, rate_sell: r.rate_sell, source: 'bot',
      })),
    });
    if (error) { failed.push(cur); continue; }
    saved += Number((data as any)?.saved || 0);
  }

  revalidatePath('/reports/fx-rates');
  return { ok: true, saved, failed };
}

/** สกุลที่โชว์บนแถบด้านบน สองตัวนี้คือที่ใช้ซื้อของจริงเกือบทั้งหมด */
const TOP_CURRENCIES = ['USD', 'CNY'];

/**
 * เวลาที่ลองยิง ธปท. ครั้งล่าสุด เก็บไว้ในหน่วยความจำของ process
 *
 * แถบด้านบนถามทุกหนึ่งนาทีต่อผู้ใช้หนึ่งคน ถ้ายิง ธปท. ทุกครั้งที่อัตราของวันนี้
 * ยังไม่มาจะกลายเป็นยิงรัวทั้งวัน (ธปท. ประกาศสายราวบ่ายสามโมง)
 * จึงลองใหม่ห่างกันครึ่งชั่วโมงพอ ตัวเลขที่แสดงยังมาจากฐานข้อมูลเหมือนเดิม
 */
let lastBotTry = 0;
const BOT_RETRY_MS = 30 * 60_000;

export interface LiveFxRow {
  currency: string;
  sell: number;
  pct: number | null;
  rateDate: string;
  /** อัตรานี้เป็นของวันนี้หรือยัง ถ้ายังหน้าจอจะบอกวันที่กำกับไว้ */
  stale: boolean;
}

/**
 * อัตราล่าสุดสำหรับแถบด้านบน
 *
 * ดึงเองอัตโนมัติ ผู้ใช้ไม่ต้องกดอะไร — ถ้าอัตราของวันนี้ยังไม่อยู่ในฐานข้อมูล
 * และตั้งค่า BOT_API_KEY ไว้แล้ว จะไปเอามาเก็บให้เงียบ ๆ แล้วอ่านซ้ำ
 */
export async function getLiveFx(): Promise<{ ok: boolean; rows?: LiveFxRow[] }> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false };

  const supabase = createClient();
  const today = bangkokToday();
  const read = async () => ((await supabase.rpc('rpt_fx_latest', { p_days: 30 })).data || []) as any[];

  let rows = await read();
  const missing = TOP_CURRENCIES.filter(
    (c) => !rows.some((r) => r.currency === c && String(r.rate_date) === today),
  );

  if (missing.length && isBotConfigured() && Date.now() - lastBotTry > BOT_RETRY_MS) {
    lastBotTry = Date.now();
    for (const cur of missing) {
      const bot = await fetchBotRates(cur, today);
      if (!bot.ok || !bot.rates?.length) continue;
      await supabase.rpc('upsert_exchange_rates', {
        p_rows: bot.rates.map((r) => ({
          currency: r.currency, rate_date: r.rate_date,
          rate_buy: r.rate_buy, rate_sell: r.rate_sell, source: 'bot',
        })),
      });
    }
    rows = await read();
  }

  return {
    ok: true,
    rows: TOP_CURRENCIES.map((c) => rows.find((r) => r.currency === c))
      .filter(Boolean)
      .map((r: any) => ({
        currency: r.currency,
        sell: Number(r.sell),
        pct: r.pct == null ? null : Number(r.pct),
        rateDate: String(r.rate_date),
        stale: String(r.rate_date) !== today,
      })),
  };
}
