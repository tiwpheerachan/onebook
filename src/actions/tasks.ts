'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext, can } from '@/lib/session';

export interface TaskResult { ok: boolean; id?: string; error?: string; count?: number }

function translate(msg: string): string {
  if (msg.includes('TITLE_REQUIRED')) return 'กรุณาระบุชื่องาน';
  if (msg.includes('FORBIDDEN')) return 'คุณไม่มีสิทธิ์จัดการงาน';
  if (msg.includes('TASK_NOT_FOUND')) return 'ไม่พบงานที่ต้องการแก้ไข';
  if (msg.includes('tasks_time_chk')) return 'วันครบกำหนดต้องไม่มาก่อนวันเริ่มงาน';
  if (msg.includes('row-level security')) return 'สิทธิ์ไม่เพียงพอตามนโยบายความปลอดภัย';
  return msg;
}

const touch = () => {
  revalidatePath('/tasks');
  revalidatePath('/dashboard');
};

/** สร้างหรือแก้ไขงาน พร้อมกำหนดผู้รับผิดชอบในครั้งเดียว */
export async function saveTask(form: any, assignees?: string[] | null): Promise<TaskResult> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'tasks', form?.id ? 'edit' : 'create')) {
    return { ok: false, error: 'คุณไม่มีสิทธิ์จัดการงาน' };
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc('save_task', {
    p_task: { ...form, company_id: ctx.company.id },
    p_assignees: assignees ?? null,
  });
  if (error) return { ok: false, error: translate(error.message) };

  touch();
  return { ok: true, id: data as string };
}

/** เปลี่ยนสถานะเร็ว ๆ จากการ์ดบนปฏิทินหรือรายการ */
export async function setTaskStatus(id: string, status: string): Promise<TaskResult> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'tasks', 'edit')) return { ok: false, error: 'คุณไม่มีสิทธิ์แก้ไขงาน' };

  const supabase = createClient();
  const { error } = await supabase.from('tasks').update({ status }).eq('id', id);
  if (error) return { ok: false, error: translate(error.message) };

  touch();
  return { ok: true };
}

export async function deleteTask(id: string): Promise<TaskResult> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'tasks', 'delete')) return { ok: false, error: 'คุณไม่มีสิทธิ์ลบงาน' };

  const supabase = createClient();
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) return { ok: false, error: translate(error.message) };

  touch();
  return { ok: true };
}

/* ─────────────────────────── โน้ตในงาน ─────────────────────────── */

export async function addComment(taskId: string, body: string): Promise<TaskResult> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'tasks', 'edit')) return { ok: false, error: 'คุณไม่มีสิทธิ์เขียนโน้ต' };
  const text = String(body || '').trim();
  if (!text) return { ok: false, error: 'กรุณาพิมพ์ข้อความ' };

  const supabase = createClient();
  const { data, error } = await supabase
    .from('task_comments')
    .insert({ task_id: taskId, company_id: ctx.company.id, body: text, created_by: ctx.userId })
    .select('id')
    .maybeSingle();
  if (error) return { ok: false, error: translate(error.message) };

  touch();
  return { ok: true, id: data?.id };
}

export async function deleteComment(id: string): Promise<TaskResult> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'tasks', 'edit')) return { ok: false, error: 'คุณไม่มีสิทธิ์ลบโน้ต' };

  const supabase = createClient();
  // ลบได้เฉพาะโน้ตของตัวเอง เว้นแต่มีสิทธิ์ลบงาน
  const { data: row } = await supabase.from('task_comments').select('created_by').eq('id', id).maybeSingle();
  if (!row) return { ok: false, error: 'ไม่พบโน้ต' };
  if (row.created_by !== ctx.userId && !can(ctx, 'tasks', 'delete')) {
    return { ok: false, error: 'ลบได้เฉพาะโน้ตที่คุณเขียนเอง' };
  }

  const { error } = await supabase.from('task_comments').delete().eq('id', id);
  if (error) return { ok: false, error: translate(error.message) };

  touch();
  return { ok: true };
}

/* ─────────────────────────── เช็กลิสต์ ─────────────────────────── */

export async function addChecklistItem(taskId: string, title: string): Promise<TaskResult> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'tasks', 'edit')) return { ok: false, error: 'คุณไม่มีสิทธิ์แก้ไขงาน' };
  const text = String(title || '').trim();
  if (!text) return { ok: false, error: 'กรุณาพิมพ์หัวข้อ' };

  const supabase = createClient();
  const { count } = await supabase
    .from('task_checklist')
    .select('id', { count: 'exact', head: true })
    .eq('task_id', taskId);

  const { error } = await supabase.from('task_checklist').insert({
    task_id: taskId, company_id: ctx.company.id, title: text, position: count || 0,
  });
  if (error) return { ok: false, error: translate(error.message) };

  touch();
  return { ok: true };
}

export async function toggleChecklistItem(id: string, isDone: boolean): Promise<TaskResult> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'tasks', 'edit')) return { ok: false, error: 'คุณไม่มีสิทธิ์แก้ไขงาน' };

  const supabase = createClient();
  const { error } = await supabase
    .from('task_checklist')
    .update({
      is_done: isDone,
      done_by: isDone ? ctx.userId : null,
      done_at: isDone ? new Date().toISOString() : null,
    })
    .eq('id', id);
  if (error) return { ok: false, error: translate(error.message) };

  touch();
  return { ok: true };
}

export async function deleteChecklistItem(id: string): Promise<TaskResult> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'tasks', 'edit')) return { ok: false, error: 'คุณไม่มีสิทธิ์แก้ไขงาน' };

  const supabase = createClient();
  const { error } = await supabase.from('task_checklist').delete().eq('id', id);
  if (error) return { ok: false, error: translate(error.message) };

  touch();
  return { ok: true };
}

/* ───────────────────── ปฏิทินภาษีอัตโนมัติ ───────────────────── */

/** ดึงกำหนดยื่นภาษีของงวดที่เลือกเข้ามาเป็นงาน (เรียกซ้ำได้ ไม่สร้างซ้ำ) */
export async function seedTaxDeadlines(year: number, month: number): Promise<TaskResult> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'tasks', 'create')) return { ok: false, error: 'คุณไม่มีสิทธิ์สร้างงาน' };

  const supabase = createClient();
  const { data, error } = await supabase.rpc('seed_tax_deadlines', {
    p_company: ctx.company.id, p_year: year, p_month: month,
  });
  if (error) return { ok: false, error: translate(error.message) };

  touch();
  return { ok: true, count: Number(data) };
}

/* ─────────────── เพิ่มงานที่ระบบเสนอเข้าตารางงาน ─────────────── */

export interface SuggestionInput {
  key: string;
  title: string;
  kind: string;
  priority: string;
  dueInDays: number;
  documentId?: string | null;
  contactId?: string | null;
  reason?: string;
}

/**
 * รับข้อเสนอที่ผู้ใช้ติ๊กไว้ แล้วสร้างเป็นงานจริง
 * ใช้ auto_key กันสร้างซ้ำ ถ้ากดสองครั้งจะไม่ได้งานซ้ำ
 */
export async function addSuggestedTasks(items: SuggestionInput[]): Promise<TaskResult> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'tasks', 'create')) return { ok: false, error: 'คุณไม่มีสิทธิ์สร้างงาน' };
  if (!items?.length) return { ok: false, error: 'ยังไม่ได้เลือกงานที่จะเพิ่ม' };

  const supabase = createClient();

  // เลขที่งานนับต่อจากของเดิม (ฟังก์ชันในฐานข้อมูลนับจากจำนวนงานทั้งหมด)
  const { count } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', ctx.company.id);
  let seq = (count || 0) + 1;

  const rows = items.map((s) => {
    const due = new Date();
    due.setDate(due.getDate() + Math.max(0, Number(s.dueInDays) || 0));
    due.setHours(17, 0, 0, 0);
    return {
      company_id: ctx.company.id,
      code: `TSK-${String(seq++).padStart(5, '0')}`,
      title: s.title,
      description: s.reason ? `ระบบเสนอให้ทำ : ${s.reason}` : null,
      kind: s.kind,
      priority: s.priority,
      status: 'todo',
      due_at: due.toISOString(),
      all_day: true,
      document_id: s.documentId || null,
      contact_id: s.contactId || null,
      auto_key: `sug-${s.key}`,
      created_by: ctx.userId,
    };
  });

  // ต้องขอเลขที่งานทีละรายการ ฟังก์ชันนับจากจำนวนงานที่มีอยู่
  let made = 0;
  for (const row of rows) {
    const { error } = await supabase.from('tasks').insert(row);
    // 23505 = auto_key ซ้ำ แปลว่าเพิ่มไปแล้ว ข้ามได้เลย
    if (error && error.code !== '23505') return { ok: false, error: translate(error.message) };
    if (!error) made += 1;
  }

  touch();
  return { ok: true, count: made };
}

/** สร้างงานจากผลตรวจก่อนปิดงบที่ผู้ใช้ติ๊กเลือกไว้ */
export async function addCloseCheckTasks(
  items: { key: string; title: string; period: string }[]
): Promise<TaskResult> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'tasks', 'create')) return { ok: false, error: 'คุณไม่มีสิทธิ์สร้างงาน' };
  if (!items?.length) return { ok: false, error: 'ยังไม่ได้เลือกรายการ' };

  const supabase = createClient();
  const { count } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', ctx.company.id);
  let seq = (count || 0) + 1;

  let made = 0;
  for (const it of items) {
    const due = new Date();
    due.setDate(due.getDate() + 3);
    due.setHours(17, 0, 0, 0);
    const { error } = await supabase.from('tasks').insert({
      company_id: ctx.company.id,
      code: `TSK-${String(seq++).padStart(5, '0')}`,
      title: `แก้ก่อนปิดงบ : ${it.title}`,
      description: `พบจากการตรวจก่อนปิดงบงวด ${it.period}`,
      kind: 'task',
      priority: 'high',
      status: 'todo',
      due_at: due.toISOString(),
      all_day: true,
      auto_key: `close-${it.period}-${it.key}`,
      created_by: ctx.userId,
    });
    if (error && error.code !== '23505') return { ok: false, error: translate(error.message) };
    if (!error) made += 1;
  }

  touch();
  return { ok: true, count: made };
}
