'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext, can } from '@/lib/session';
import { t } from '@/i18n/server';
import { isValidThaiTaxId } from '@/lib/format';
import { isValidPromptPayId, detectIdType } from '@/lib/promptpay';

/**
 * ปิดงวดพร้อมเก็บ "ลายนิ้วมือ" ของตัวเลขทั้งงวดไว้เป็นหลักฐาน
 * ภายหลังกดตรวจสอบได้ว่าตัวเลขยังตรงกับตอนปิดหรือถูกแก้ย้อนหลัง
 */
export async function lockPeriod(form: { locked_through: string; scope: string; reason?: string }) {
  const ctx = await getSessionContext();
  if (!ctx || !can(ctx, 'period', 'create')) return { ok: false, error: 'ไม่มีสิทธิ์ปิดงวด' };
  const supabase = createClient();
  const { error } = await supabase.rpc('freeze_period', {
    p_company: ctx.company.id,
    p_through: form.locked_through,
    p_scope: form.scope || 'all',
    p_reason: form.reason || null,
  });
  if (error) {
    const m = error.message;
    if (m.includes('ALREADY_LOCKED')) return { ok: false, error: 'งวดนี้ถูกปิดไปแล้ว เลือกวันที่หลังจากงวดที่ปิดล่าสุด' };
    if (m.includes('FUTURE_PERIOD')) return { ok: false, error: 'ปิดงวดล่วงหน้าไม่ได้' };
    if (m.includes('FORBIDDEN')) return { ok: false, error: 'คุณไม่มีสิทธิ์ปิดงวด' };
    return { ok: false, error: m };
  }
  revalidatePath('/settings/period-lock');
  return { ok: true };
}

/** ตรวจสอบว่าตัวเลขของงวดที่ปิดไปแล้วยังตรงกับตอนปิดหรือไม่ */
export async function verifyPeriod(lockId: string) {
  const ctx = await getSessionContext();
  if (!ctx || !can(ctx, 'period', 'view')) return { ok: false, error: 'ไม่มีสิทธิ์ตรวจสอบงวด' };
  const supabase = createClient();
  const { data, error } = await supabase.rpc('verify_period_integrity', { p_lock: lockId });
  if (error) return { ok: false, error: error.message };
  return { ok: true, result: data as any };
}

export async function releasePeriod(id: string) {
  const ctx = await getSessionContext();
  if (!ctx || !can(ctx, 'period', 'unlock')) return { ok: false, error: 'ไม่มีสิทธิ์ปลดล็อกงวด' };
  const supabase = createClient();
  const { error } = await supabase
    .from('period_locks')
    .update({ is_active: false, released_by: ctx.userId, released_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings/period-lock');
  return { ok: true };
}

export async function saveRolePermission(form: { role_id: string; resource: string; actions: string[]; field_mask?: string[] }) {
  const ctx = await getSessionContext();
  if (!ctx || !can(ctx, 'settings.roles', 'edit')) return { ok: false, error: 'ไม่มีสิทธิ์แก้ไขบทบาท' };
  const supabase = createClient();
  if (form.actions.length === 0) {
    const { error } = await supabase.from('role_permissions').delete()
      .eq('role_id', form.role_id).eq('resource', form.resource);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from('role_permissions')
      .upsert({ role_id: form.role_id, resource: form.resource, actions: form.actions, field_mask: form.field_mask || [] },
              { onConflict: 'role_id,resource' });
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath('/settings/roles');
  return { ok: true };
}

export async function createRole(form: { code: string; name_th: string; description?: string }) {
  const ctx = await getSessionContext();
  if (!ctx || !can(ctx, 'settings.roles', 'create')) return { ok: false, error: 'ไม่มีสิทธิ์' };
  const supabase = createClient();
  const { error } = await supabase.from('roles').insert({
    company_id: ctx.company.id, code: form.code, name_th: form.name_th, description: form.description || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings/roles');
  return { ok: true };
}

export async function assignUser(form: { user_id: string; role_id: string; can_view_subsidiaries: boolean }) {
  const ctx = await getSessionContext();
  if (!ctx || !can(ctx, 'settings.users', 'create')) return { ok: false, error: 'ไม่มีสิทธิ์' };
  const supabase = createClient();
  const { error } = await supabase.from('user_companies').upsert({
    user_id: form.user_id,
    company_id: ctx.company.id,
    role_id: form.role_id,
    can_view_subsidiaries: form.can_view_subsidiaries,
    is_active: true,
  }, { onConflict: 'user_id,company_id' });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings/users');
  return { ok: true };
}

export async function setUserAccess(form: { id: string; is_active: boolean }) {
  const ctx = await getSessionContext();
  if (!ctx || !can(ctx, 'settings.users', 'edit')) return { ok: false, error: 'ไม่มีสิทธิ์' };
  const supabase = createClient();
  const { error } = await supabase.from('user_companies').update({ is_active: form.is_active }).eq('id', form.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings/users');
  return { ok: true };
}

export async function createCompany(form: { code: string; name_th: string; name_en?: string; name_zh?: string; tax_id?: string; parent_code?: string }) {
  const ctx = await getSessionContext();
  if (!ctx?.isGroupAdmin) return { ok: false, error: 'เฉพาะผู้ดูแลระดับกลุ่มเท่านั้น' };
  const supabase = createClient();
  const { error } = await supabase.rpc('provision_company', {
    p_code: form.code, p_name_th: form.name_th,
    p_name_en: form.name_en || null, p_name_zh: form.name_zh || null,
    p_tax_id: form.tax_id || null, p_parent_code: form.parent_code || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings/companies');
  return { ok: true };
}

/**
 * แก้ไขข้อมูลบริษัทที่ต้องปรากฏบนเอกสารที่ออกให้ลูกค้า
 * (ที่อยู่ เลขผู้เสียภาษี สาขา พร้อมเพย์ บัญชีธนาคาร ผู้มีอำนาจลงนาม)
 */
export async function updateCompanyProfile(form: Record<string, any>) {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'settings.companies', 'edit')) return { ok: false, error: 'คุณไม่มีสิทธิ์แก้ไขข้อมูลบริษัท' };
  if (!form.id) return { ok: false, error: 'ไม่พบบริษัทที่ต้องการแก้ไข' };

  const taxId = String(form.tax_id || '').replace(/\D/g, '');
  if (taxId && !isValidThaiTaxId(taxId)) {
    return { ok: false, error: 'เลขประจำตัวผู้เสียภาษีไม่ถูกต้อง (ตรวจสอบหลักตรวจสอบไม่ผ่าน)' };
  }
  const ppId = String(form.promptpay_id || '').replace(/[\s-]/g, '');
  if (ppId && !isValidPromptPayId(ppId)) {
    return { ok: false, error: 'หมายเลขพร้อมเพย์ต้องเป็นเบอร์โทร 10 หลัก เลขผู้เสียภาษี 13 หลัก หรือ e-Wallet 15 หลัก' };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('companies')
    .update({
      name_th: form.name_th,
      name_en: form.name_en || null,
      tax_id: taxId || null,
      branch_code: form.branch_code || '00000',
      branch_name: form.branch_name || 'สำนักงานใหญ่',
      address_th: form.address_th || null,
      phone: form.phone || null,
      email: form.email || null,
      website: form.website || null,
      logo_url: form.logo_url || null,
      promptpay_id: ppId || null,
      promptpay_type: ppId ? detectIdType(ppId) : null,
      bank_name: form.bank_name || null,
      bank_account_name: form.bank_account_name || null,
      bank_account_no: form.bank_account_no || null,
      doc_footer_note: form.doc_footer_note || null,
      authorized_signer: form.authorized_signer || null,
    })
    .eq('id', form.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings/companies');
  return { ok: true };
}

/** ตั้งค่ารูปแบบเลขที่เอกสารของแต่ละประเภท */
export async function saveDocSequence(form: {
  doc_kind: string;
  prefix: string;
  pattern: string;
  next_number: number;
  reset_cycle: string;
}) {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'settings.numbering', 'edit')) return { ok: false, error: 'คุณไม่มีสิทธิ์ตั้งค่าเลขที่เอกสาร' };

  const prefix = String(form.prefix || '').trim().toUpperCase();
  const pattern = String(form.pattern || '').trim();
  if (!prefix) return { ok: false, error: 'กรุณาระบุอักษรนำหน้า' };
  if (!pattern.includes('{SEQ')) {
    return { ok: false, error: 'รูปแบบต้องมี {SEQ:4} หรือ {SEQ:5} เพื่อให้เลขไม่ซ้ำกัน' };
  }
  const next = Math.max(1, Math.round(Number(form.next_number) || 1));
  if (!['never', 'yearly', 'monthly'].includes(form.reset_cycle)) {
    return { ok: false, error: 'รอบการรีเซ็ตเลขไม่ถูกต้อง' };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('doc_sequences')
    .upsert(
      {
        company_id: ctx.company.id,
        doc_kind: form.doc_kind,
        prefix,
        pattern,
        next_number: next,
        reset_cycle: form.reset_cycle,
      },
      { onConflict: 'company_id,doc_kind' }
    );

  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings/numbering');
  return { ok: true };
}

/* ─────────────────── อนุญาตพนักงาน GoodHR เข้าใช้เป็นรายคน ─────────────────── */

/**
 * อนุญาตล่วงหน้าก่อนพนักงานเคยล็อกอิน
 * ระบุด้วยรหัสพนักงานหรืออีเมล พร้อมเลือกบทบาทในบริษัทนี้
 * เมื่อเขาล็อกอินด้วย GoodHR ครั้งแรก ระบบจะให้สิทธิ์ตามนี้ทันที
 */
export async function inviteSsoUser(form: {
  employee_code?: string;
  email?: string;
  role_id: string;
  can_view_subsidiaries?: boolean;
  note?: string;
}) {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'settings.users', 'create')) return { ok: false, error: 'คุณไม่มีสิทธิ์อนุญาตผู้ใช้' };

  const code = String(form.employee_code || '').trim();
  const email = String(form.email || '').trim().toLowerCase();
  if (!code && !email) return { ok: false, error: 'ระบุรหัสพนักงานหรืออีเมลอย่างน้อยหนึ่งอย่าง' };
  if (!form.role_id) return { ok: false, error: 'กรุณาเลือกบทบาท' };

  const supabase = createClient();
  const { error } = await supabase.from('sso_invitations').insert({
    company_id: ctx.company.id,
    employee_code: code || null,
    email: email || null,
    role_id: form.role_id,
    can_view_subsidiaries: !!form.can_view_subsidiaries,
    note: form.note || null,
    invited_by: ctx.userId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/users');
  return { ok: true };
}

export async function cancelSsoInvitation(id: string) {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' };
  if (!can(ctx, 'settings.users', 'edit')) return { ok: false, error: 'คุณไม่มีสิทธิ์ยกเลิก' };

  const supabase = createClient();
  const { error } = await supabase.from('sso_invitations').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/users');
  return { ok: true };
}

/**
 * กำหนดเดือนภาษีที่จะใช้สิทธิ์ภาษีซื้อ หรือพักไว้ก่อน
 *
 * ไม่แตะวันที่เอกสารเด็ดขาด เพราะวันที่ในใบกำกับเป็นข้อเท็จจริงที่แก้ไม่ได้
 * ฐานข้อมูลกันซ้ำอีกชั้นทั้งเรื่องสิทธิ์ งวดที่ปิดแล้ว และการย้อนก่อนเดือนใบกำกับ
 */
export async function setVatTaxMonth(form: {
  document_id: string;
  month: string | null;   // 'YYYY-MM' หรือ null
  defer: boolean;
  note?: string;
}) {
  const ctx = await getSessionContext();
  const d = t();
  const L = d.ui.vatPending;
  if (!ctx || !can(ctx, 'tax', 'edit')) return { ok: false, error: L.noPermission };

  const month = form.defer || !form.month ? null : `${form.month}-01`;
  if (month && !/^\d{4}-\d{2}-01$/.test(month)) return { ok: false, error: L.useMonth };

  const supabase = createClient();
  const { error } = await supabase.rpc('set_vat_tax_month', {
    p_document: form.document_id,
    p_month: month,
    p_defer: !!form.defer,
    p_note: form.note || null,
  });

  if (error) {
    if (error.message.includes('PERIOD_LOCKED')) return { ok: false, error: L.lockedMonth };
    if (error.message.includes('VAT_MONTH_BEFORE_DOC')) return { ok: false, error: L.beforeDoc };
    if (error.message.includes('FORBIDDEN')) return { ok: false, error: L.noPermission };
    return { ok: false, error: error.message };
  }

  revalidatePath('/tax/pending');
  revalidatePath('/tax/vat');
  revalidatePath('/tax/pp30');
  return { ok: true };
}

/* ─────────────────────────── ข้อมูลจำลอง ─────────────────────────── */

export async function seedDemoData() {
  const ctx = await getSessionContext();
  const L = t().ui.demo;
  if (!ctx || !can(ctx, 'documents', 'create')) return { ok: false, error: L.noPermission };

  const supabase = createClient();
  const { data, error } = await supabase.rpc('seed_demo_data', { p_company: ctx.company.id });
  if (error) {
    if (error.message.includes('ALREADY_SEEDED')) return { ok: false, error: L.alreadySeeded };
    if (error.message.includes('FORBIDDEN')) return { ok: false, error: L.noPermission };
    return { ok: false, error: error.message };
  }
  revalidatePath('/', 'layout');
  return { ok: true, rows: (data as any)?.rows ?? 0 };
}

/** ลบเฉพาะแถวที่ข้อมูลจำลองสร้างไว้ ไม่แตะข้อมูลจริง — ฐานข้อมูลบังคับอีกชั้น */
export async function purgeDemoData() {
  const ctx = await getSessionContext();
  const L = t().ui.demo;
  if (!ctx || !can(ctx, 'documents', 'delete')) return { ok: false, error: L.noPermission };

  const supabase = createClient();
  const { error } = await supabase.rpc('purge_demo_data', { p_company: ctx.company.id });
  if (error) {
    if (error.message.includes('FORBIDDEN')) return { ok: false, error: L.noPermission };
    return { ok: false, error: error.message };
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}

/**
 * ตั้งเงื่อนไขจำกัดแถวที่บทบาทหนึ่งมองเห็น
 *
 * รับเฉพาะรูปแบบที่กำหนดไว้ ไม่ใช่เงื่อนไขอิสระ
 * ฐานข้อมูลตรวจซ้ำอีกชั้นก่อนเก็บเสมอ
 */
export async function setRowFilter(form: {
  role_id: string;
  resource: string;
  mode: 'none' | 'own' | 'contact_group';
  group_ids?: string[];
}) {
  const ctx = await getSessionContext();
  const L = t().ui.rowFilter;
  if (!ctx || !can(ctx, 'settings.roles', 'edit')) return { ok: false, error: L.noPermission };

  const filter =
    form.mode === 'none' ? null
    : form.mode === 'own' ? { mode: 'own' }
    : { mode: 'contact_group', ids: form.group_ids || [] };

  if (form.mode === 'contact_group' && !(form.group_ids || []).length) {
    return { ok: false, error: L.needGroups };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc('set_row_filter', {
    p_role: form.role_id, p_resource: form.resource, p_filter: filter,
  });

  if (error) {
    const m = error.message;
    if (m.includes('NO_PERMISSION_ROW')) return { ok: false, error: L.noRow };
    if (m.includes('BAD_MODE')) return { ok: false, error: L.badMode };
    if (m.includes('NEED_GROUPS')) return { ok: false, error: L.needGroups };
    if (m.includes('FORBIDDEN')) return { ok: false, error: L.noPermission };
    return { ok: false, error: m };
  }

  revalidatePath('/settings/roles');
  return { ok: true };
}
