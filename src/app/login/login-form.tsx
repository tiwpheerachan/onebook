'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function LoginForm({ labels }: { labels: Record<string, string> }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
  );
}
