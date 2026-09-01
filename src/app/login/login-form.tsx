'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient, isEmbedded } from '@/lib/supabase/client';
import { Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { useI18n } from '@/i18n/provider';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function LoginForm({
  labels, ssoEnabled, passwordEnabled,
}: {
  labels: Record<string, string>;
  ssoEnabled: boolean;
  passwordEnabled: boolean;
}) {
  const { dict } = useI18n();
  const L = dict.ui.sso;
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // เบราว์เซอร์บล็อกคุกกี้เพราะถูกฝังในเว็บอื่น
  const [blocked, setBlocked] = useState(false);
  const ssoError = params.get('sso');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setBlocked(false);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (err) {
        setError(labels.invalid);
        return;
      }

      // ยืนยันว่าคุกกี้ถูกเก็บจริง ไม่ใช่แค่เซิร์ฟเวอร์ตอบว่าผ่าน
      //
      // ตอนถูกฝังในพอร์ทัล เบราว์เซอร์อาจปฏิเสธคุกกี้บุคคลที่สามเงียบ ๆ
      // ถ้าข้ามการตรวจนี้ไป ผู้ใช้จะเห็นแค่วงกลมหมุนค้างโดยไม่รู้ว่าเกิดอะไรขึ้น
      // เพราะเด้งไปหน้าแรกแล้วโดนส่งกลับมาหน้าล็อกอินวนไม่จบ
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setBlocked(true);
        return;
      }

      router.replace(params.get('next') || '/dashboard');
      router.refresh();
    } catch {
      setError(labels.invalid);
    } finally {
      // ต้องปลดเสมอ ไม่งั้นถ้าไปต่อไม่ได้จะค้างที่ "กำลังเข้าสู่ระบบ" ตลอดไป
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {blocked && (
        <div className="rounded-lg bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200">
          <p className="font-medium">{labels.embedBlockedTitle}</p>
          <p className="mt-1">{labels.embedBlockedBody}</p>
          <a
            href={typeof window !== 'undefined' ? window.location.href : '/login'}
            target="_top"
            rel="noopener"
            className="mt-2 inline-block rounded-md bg-amber-600 px-3 py-1.5 font-medium text-white hover:bg-amber-700"
          >
            {labels.embedBlockedAction}
          </a>
        </div>
      )}

      {ssoError && (
        <p className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-xs leading-relaxed text-rose-700 ring-1 ring-inset ring-rose-200">
          {(L.err as Record<string, string>)[ssoError] || L.err.failed}
        </p>
      )}

      {ssoEnabled && (
        <a
          href="/api/auth/goodhr/start"
          // หน้าล็อกอินของ GoodHR มักไม่ยอมให้ฝังใน iframe
          // จึงพาออกไปทำที่หน้าต่างบนสุดเสมอ ถ้าไม่ได้ถูกฝังอยู่ค่านี้ก็ไม่มีผลอะไร
          target="_top"
          className="flex w-full items-center justify-center gap-2.5 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-800"
        >
          <ShieldCheck className="h-4 w-4" strokeWidth={2} />
          {L.signInWith}
        </a>
      )}

      {ssoEnabled && passwordEnabled && (
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-ink-200" />
          <span className="text-xxs text-ink-400">{L.orEmail}</span>
          <span className="h-px flex-1 bg-ink-200" />
        </div>
      )}

      {!passwordEnabled && ssoEnabled && (
        <p className="text-center text-xxs leading-relaxed text-ink-400">
          {L.onlyGoodhr}
          <br />{L.permsByAdmin}
        </p>
      )}

      {passwordEnabled && (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">{labels.email}</FieldLabel>
          <Input
            id="email"
            type="email"
            required
            autoComplete="username"
            autoFocus
            placeholder="you@company.co.th"
            aria-invalid={!!error}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel htmlFor="password">{labels.password}</FieldLabel>
            <span className="group relative text-xs text-ink-400">
              <button type="button" className="underline-offset-4 hover:text-sea-700 hover:underline">
                {labels.forgot}
              </button>
              <span className="pointer-events-none absolute bottom-full right-0 mb-1.5 hidden w-max max-w-[15rem] rounded-lg bg-ink-900 px-2.5 py-1.5 text-xxs text-white shadow-pop group-hover:block">
                {labels.forgotHint}
              </span>
            </span>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              aria-invalid={!!error}
              className="pr-11"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              tabIndex={-1}
              aria-label={showPassword ? L.hidePassword : L.showPassword}
              className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-ink-400 transition hover:bg-ink-100 hover:text-ink-600"
            >
              {showPassword ? <EyeOff className="h-4 w-4" strokeWidth={1.8} /> : <Eye className="h-4 w-4" strokeWidth={1.8} />}
            </button>
          </div>
        </Field>

        {error && <FieldError>{error}</FieldError>}

        <Field>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? <ShdSpinner size={16} /> : <Lock className="h-4 w-4" strokeWidth={1.8} />}
            {busy ? labels.signingIn : labels.signIn}
          </Button>
          <FieldDescription className="text-center">{labels.secure}</FieldDescription>
        </Field>
      </FieldGroup>
    </form>
      )}
    </div>
  );
}
