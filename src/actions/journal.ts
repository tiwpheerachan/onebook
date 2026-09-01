'use server';
import { revalidatePath } from 'next/cache';
import { getSessionContext, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';

export interface JournalLineInput {
  account_id: string | null;
  description?: string | null;
  debit?: number;
  credit?: number;
  contact_id?: string | null;
  dimension_id?: string | null;
}
type Res = { ok: boolean; error?: string; id?: string };

function translate(msg: string): string {
  const L = t().ui.journalEntry;
  const E = t().ui.docError;
  if (msg.includes('NOT_BALANCED')) {
    // ข้อความจากฐานข้อมูลบอกตัวเลขทั้งสองข้างมาด้วย ซึ่งช่วยให้หาจุดผิดได้เร็ว
    const nums = msg.match(/[\d,]+\.\d{2}/g);
    return nums ? `${L.notBalancedErr} (${nums.join(' / ')})` : L.notBalancedErr;
  }
  if (msg.includes('NEED_TWO_LINES')) return L.needTwoLines;
  if (msg.includes('ACCOUNT_REQUIRED')) return L.accountRequired;
  if (msg.includes('ONE_SIDE_ONLY') || msg.includes('NEGATIVE_AMOUNT')) return L.oneSideOnly;
  if (msg.includes('BAD_ACCOUNT') || msg.includes('CROSS_COMPANY')) return L.badAccount;
  if (msg.includes('DESCRIPTION_REQUIRED')) return L.descriptionRequired;
  if (msg.includes('AUTO_ENTRY')) return L.autoEntry;
  if (msg.includes('ENTRY_POSTED') || msg.includes('ALREADY_POSTED')) return L.postedLocked;
  if (msg.includes('ALREADY_REVERSED')) return L.alreadyReversed;
  if (msg.includes('NOT_POSTED')) return L.notPosted;
  if (msg.includes('PERIOD_LOCKED')) return E.periodLocked;
  if (msg.includes('FORBIDDEN')) return L.noPermission;
  return msg;
}

export async function saveJournalEntry(form: {
  entry_id?: string | null;
  entry_date: string;
  book: 'GL' | 'ADJ';
  description: string;
  lines: JournalLineInput[];
  post: boolean;
}): Promise<Res> {
  const ctx = await getSessionContext();
  const L = t().ui.journalEntry;
  if (!ctx || !can(ctx, 'journal', form.entry_id ? 'edit' : 'create')) {
    return { ok: false, error: L.noPermission };
  }
  if (form.post && !can(ctx, 'journal', 'post')) return { ok: false, error: L.noPostPermission };

  const supabase = createClient();
  const { data, error } = await supabase.rpc('save_journal_entry', {
    p_company: ctx.company.id,
    p_entry_date: form.entry_date,
    p_description: form.description,
    p_lines: form.lines.map((l) => ({
      account_id: l.account_id,
      description: l.description || null,
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0,
      contact_id: l.contact_id || null,
      dimension_id: l.dimension_id || null,
    })),
    p_book: form.book,
    p_post: form.post,
    p_entry_id: form.entry_id || null,
    p_reference: null,
  });
  if (error) return { ok: false, error: translate(error.message) };

  revalidatePath('/accounting/journal');
  revalidatePath('/accounting/ledger');
  return { ok: true, id: (data as any)?.entry_id };
}

export async function postJournalEntry(entryId: string): Promise<Res> {
  const ctx = await getSessionContext();
  const L = t().ui.journalEntry;
  if (!ctx || !can(ctx, 'journal', 'post')) return { ok: false, error: L.noPostPermission };

  const supabase = createClient();
  const { error } = await supabase.rpc('post_journal_entry', { p_entry: entryId });
  if (error) return { ok: false, error: translate(error.message) };

  revalidatePath('/accounting/journal');
  return { ok: true };
}

export async function reverseJournalEntry(
  entryId: string, reason: string, date?: string | null,
): Promise<Res> {
  const ctx = await getSessionContext();
  const L = t().ui.journalEntry;
  if (!ctx || !can(ctx, 'journal', 'void')) return { ok: false, error: L.noPermission };

  const supabase = createClient();
  const { error } = await supabase.rpc('reverse_journal_entry', {
    p_entry: entryId, p_date: date || null, p_reason: reason || null,
  });
  if (error) return { ok: false, error: translate(error.message) };

  revalidatePath('/accounting/journal');
  revalidatePath('/accounting/ledger');
  return { ok: true };
}
