'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/** ข้อความอธิบายเหตุผลที่ล็อกอินด้วย GoodHR ไม่ผ่าน — บอกให้ชัดว่าต้องทำอะไรต่อ */
const SSO_ERROR: Record<string, string> = {
  no_access: 'บัญชี GoodHR ของคุณยังไม่ได้รับอนุญาตให้เข้าใช้ ONEBOOK — กรุณาแจ้งผู้ดูแลระบบให้เพิ่มสิทธิ์ก่อน',
  suspended: 'บัญชีของคุณถูกระงับการใช้งานในระบบนี้ กรุณาติดต่อผู้ดูแล',
  inactive: 'บัญชีพนักงานของคุณใน GoodHR ไม่ได้อยู่ในสถานะทำงานแล้ว',
  denied: 'คุณไม่ได้กดอนุญาตให้ ONEBOOK เข้าถึงข้อมูล',
  state_mismatch: 'การเข้าสู่ระบบไม่ปลอดภัย (state ไม่ตรง) กรุณาลองใหม่',
  expired: 'ลิงก์เข้าสู่ระบบหมดอายุ กรุณากดเข้าสู่ระบบใหม่',
  no_email: 'บัญชี GoodHR ของคุณไม่มีอีเมล ระบบจึงสร้างบัญชีให้ไม่ได้',
  not_configured: 'ยังไม่ได้ตั้งค่าการเชื่อมต่อ GoodHR กรุณาติดต่อผู้ดูแลระบบ',
  session_failed: 'ยืนยันตัวตนสำเร็จ แต่เปิดเซสชันไม่ได้ กรุณาลองใหม่',
  create_failed: 'สร้างบัญชีผู้ใช้ไม่สำเร็จ กรุณาติดต่อผู้ดูแลระบบ',
  link_failed: 'เชื่อมบัญชีไม่สำเร็จ กรุณาติดต่อผู้ดูแลระบบ',
  failed: 'เข้าสู่ระบบด้วย GoodHR ไม่สำเร็จ กรุณาลองใหม่',
  error: 'เกิดข้อผิดพลาดระหว่างเชื่อมต่อ GoodHR',
};

export function LoginForm({
  labels, ssoEnabled, passwordEnabled,
}: {
  labels: Record<string, string>;
  ssoEnabled: boolean;
  passwordEnabled: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ssoError = params.get('sso');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) {
      setError(labels.invalid);
      setBusy(false);
      return;
    }
    router.replace(params.get('next') || '/dashboard');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      {ssoError && (
        <p className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-xs leading-relaxed text-rose-700 ring-1 ring-inset ring-rose-200">
          {SSO_ERROR[ssoError] || SSO_ERROR.failed}
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
          เข้าสู่ระบบด้วย GoodHR
        </a>
      )}

      {ssoEnabled && passwordEnabled && (
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-ink-200" />
          <span className="text-xxs text-ink-400">หรือเข้าด้วยอีเมล</span>
          <span className="h-px flex-1 bg-ink-200" />
        </div>
      )}

      {!passwordEnabled && ssoEnabled && (
        <p className="text-center text-xxs leading-relaxed text-ink-400">
          ระบบนี้ให้เข้าสู่ระบบด้วยบัญชี GoodHR เท่านั้น
          <br />สิทธิ์การใช้งานกำหนดโดยผู้ดูแลระบบของ ONEBOOK
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
              aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
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
