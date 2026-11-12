// Endpoint ให้ตัวตั้งเวลา (cron-job.org / Render cron) ยิงเข้ามาเพื่อซิงก์ PEAK อัตโนมัติ
// ⚠️ อ่านอย่างเดียว — เรียก syncPeakDocuments ซึ่ง GET จาก PEAK เท่านั้น
import { NextResponse } from 'next/server';
import { syncPeakDocuments } from '@/lib/peak-api/sync';
import { peakPing, peakConfigured, peakMissingEnv } from '@/lib/peak-api/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorized(req: Request): boolean {
  // ตัดช่องว่าง + อักขระล่องหน (newline, zero-width, BOM) กันค่าที่ติดมาตอน paste ใน env
  const norm = (s: string | null | undefined) => (s || '').replace(/[\s​-‍﻿]/g, '');
  const secret = norm(process.env.PEAK_SYNC_SECRET);
  if (!secret) return false; // ไม่ตั้ง secret = ปิดไว้ก่อน (กันยิงมั่ว)
  const url = new URL(req.url);
  const key = norm(url.searchParams.get('key') || req.headers.get('x-peak-sync-key'));
  return key === secret;
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  if (!peakConfigured()) {
    return NextResponse.json(
      { ok: false, error: `PEAK ยังตั้งค่าไม่ครบ: ${peakMissingEnv().join(', ')}` }, { status: 503 });
  }
  const url = new URL(req.url);
  // ?ping=1 เช็กการเชื่อมต่อ (ขอ Client Token อย่างเดียว ไม่แตะข้อมูล)
  if (url.searchParams.get('ping') === '1') {
    return NextResponse.json(await peakPing());
  }
  // ?pages=N จำกัดจำนวนหน้าต่อชนิด (รอบถี่ใช้ค่าน้อย ๆ) · ไม่ใส่ = ดึงทั้งหมด
  const pagesRaw = url.searchParams.get('pages');
  const maxPages = pagesRaw ? Math.max(1, Number(pagesRaw) || 0) || undefined : undefined;
  const result = await syncPeakDocuments({ maxPages });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET(req: Request) { return handle(req); }
export async function POST(req: Request) { return handle(req); }
