import type { Locale } from '@/i18n/config';

/**
 * ข้อความในคู่มือเก็บครบสามภาษาในที่เดียว
 *
 * ตั้งใจใช้ทรงนี้แทนการแยกไฟล์ตามภาษา เพราะ TypeScript จะบังคับเองว่า
 * ทุกข้อความต้องมีครบ th/en/zh ลืมภาษาใดภาษาหนึ่งคือ typecheck ไม่ผ่าน
 * ไม่ใช่ไปเจอตอนผู้ใช้เปลี่ยนภาษาแล้วเห็นไทยโผล่มา
 */
export interface L { th: string; en: string; zh: string }

export const tx = (v: L, locale: string): string => v[(locale as Locale)] ?? v.th;

export interface HelpArticle {
  slug: string;
  title: L;
  summary: L;
  /** ขั้นตอนทำจริงในระบบ เรียงตามลำดับที่กด */
  steps: L[];
  /** ข้อควรรู้ กับดักที่คนพลาดบ่อย */
  tips?: L[];
  /** ลิงก์ไปหน้าจริงในระบบ */
  href?: string;
  /** สิทธิ์ที่ต้องมีจึงจะเห็นบทความนี้ */
  resource?: string;
}

export interface HelpCategory {
  slug: string;
  icon: string;
  title: L;
  summary: L;
  articles: HelpArticle[];
}

/** ฟีเจอร์ที่ยังไม่มี — แสดงไว้ตรง ๆ ในคู่มือ ดีกว่าให้ผู้ใช้ไปค้นแล้วไม่เจอ */
export interface HelpGap {
  title: L;
  detail: L;
  /** ทางออกที่ใช้ได้ตอนนี้ */
  workaround: L;
}
