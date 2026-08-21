'use server';
import { cookies } from 'next/headers';
import { cookiePolicy } from '@/lib/frame-policy';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { COMPANY_COOKIE } from '@/lib/session';
import { LOCALE_COOKIE } from '@/i18n/config';

const COOKIE_OPTS = {
  httpOnly: false as const,
  ...cookiePolicy(),
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
};

export async function setCompanyAction(companyId: string) {
  cookies().set(COMPANY_COOKIE, companyId, COOKIE_OPTS);
}

export async function setLocaleAction(locale: string) {
  cookies().set(LOCALE_COOKIE, locale, COOKIE_OPTS);
}

export async function signOutAction() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
