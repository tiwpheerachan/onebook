// รับสรุปผลการซิงก์ PEAK ต่อรอบ (จาก routine) → บันทึกลง peak_sync_log
// ⚠️ เขียนแค่ log ของเราเอง ไม่แตะ PEAK · guard ด้วย PEAK_SYNC_SECRET
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { randomUUID } from 'node:crypto';

export const dynamic = 'force-dynamic';

const norm = (s: string | null | undefined) => (s || '').replace(/[\s​-‍﻿]/g, '');
function authorized(req: Request): boolean {
  const secret = norm(process.env.PEAK_SYNC_SECRET);
  if (!secret) return false;
  const url = new URL(req.url);
  return norm(url.searchParams.get('key') || req.headers.get('x-peak-sync-key')) === secret;
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let payload: any;
  try { payload = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 }); }

  const url = new URL(req.url);
  const source = String(payload?.source || url.searchParams.get('source') || 'routine').slice(0, 32);
  const run_id = typeof payload?.run_id === 'string' ? payload.run_id : randomUUID();
  const items: any[] = Array.isArray(payload?.items) ? payload.items : [];
  if (items.length === 0) return NextResponse.json({ ok: false, error: 'no items' }, { status: 400 });

  const rows = items.map((it) => ({
    run_id,
    source,
    doc_type: String(it?.doc_type || '?').slice(0, 40),
    fetched: Number(it?.fetched) || 0,
    upserted: Number(it?.upserted) || 0,
    skipped: Number(it?.skipped) || 0,
    ok: it?.ok !== false && !it?.error,
    error: it?.error ? String(it.error).slice(0, 500) : null,
  }));

  const sb = createAdminClient();
  const { error } = await sb.from('peak_sync_log').insert(rows);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, run_id, logged: rows.length });
}
