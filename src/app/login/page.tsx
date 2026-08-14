import { LoginForm } from './login-form';
import { GradientMesh } from '@/components/ui/gradient-mesh';
import { LanguageSwitcher } from '@/components/layout/switchers';
import { currentLocale, t } from '@/i18n/server';
import { ShieldCheck, Building2, TrendingUp, KeyRound } from 'lucide-react';

export const metadata = { title: 'เข้าสู่ระบบ · ONEBOOK' };

export default function LoginPage() {
  const d = t();
  const locale = currentLocale();

  return (
    <div className="grid min-h-svh bg-white lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* ---------------- ฝั่งซ้าย : ฟอร์มเข้าสู่ระบบ ---------------- */}
      <div className="flex flex-col gap-6 p-6 md:p-10">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <img
              src="/brand/onebook-mark.png"
              alt="ONEBOOK"
              width={40}
              height={40}
              className="h-10 w-10 rounded-xl object-cover shadow-card ring-1 ring-sea-900/10"
            />
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight text-ink-900">{d.app.name}</p>
              <p className="text-xxs text-ink-500">{d.app.tagline}</p>
            </div>
          </div>
          <LanguageSwitcher locale={locale} />
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">
            <div className="mb-7 flex flex-col gap-1.5">
              <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{d.auth.title}</h1>
              <p className="text-sm text-ink-500">{d.auth.subtitle}</p>
            </div>

            <LoginForm
              labels={{
                email: d.auth.email,
                password: d.auth.password,
                signIn: d.auth.signIn,
                signingIn: d.auth.signingIn,
                invalid: d.auth.invalid,
                forgot: d.auth.forgot,
                forgotHint: d.auth.forgotHint,
                secure: d.auth.secure,
              }}
            />
          </div>
        </div>

        <p className="flex items-center justify-center gap-1.5 text-center text-xxs text-ink-400">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
          {d.auth.restricted}
        </p>
      </div>

      {/* ---------------- ฝั่งขวา : ภาพพื้นหลังไล่สีตามโลโก้ (เฉพาะจอใหญ่) ---------------- */}
      <div className="relative hidden overflow-hidden bg-sea-950 lg:block">
        <GradientMesh
          colors={['#012a30', '#0f5f5e', '#72d8c9']}
          distortion={6}
          swirl={0.35}
          speed={0.5}
          scale={1.15}
          rotation={90}
          waveAmp={0.15}
          waveFreq={12}
          waveSpeed={0.18}
          grain={0.05}
        />
        {/* เคลือบสีเข้มเพื่อให้ตัวหนังสืออ่านง่าย */}
        <div className="absolute inset-0 bg-gradient-to-t from-sea-950/90 via-sea-950/55 to-sea-950/45" />

        <div className="relative flex h-full flex-col justify-between p-12 text-sea-50">
          <img
            src="/brand/onebook-mark.png"
            alt=""
            width={72}
            height={72}
            className="h-[4.5rem] w-[4.5rem] rounded-2xl object-cover shadow-pop ring-1 ring-white/15"
          />

          <div className="max-w-md">
            <h2 className="text-3xl font-semibold leading-snug tracking-tight text-white">
              {d.auth.panelTitle}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-sea-100/85">{d.auth.panelText}</p>

            <div className="mt-8 grid gap-2.5 text-sm text-sea-100/90">
              <span className="flex items-center gap-2.5">
                <TrendingUp className="h-4 w-4 shrink-0 text-sea-200" strokeWidth={1.8} />
                {d.auth.panelPoint1}
              </span>
              <span className="flex items-center gap-2.5">
                <Building2 className="h-4 w-4 shrink-0 text-sea-200" strokeWidth={1.8} />
                {d.auth.panelPoint2}
              </span>
              <span className="flex items-center gap-2.5">
                <KeyRound className="h-4 w-4 shrink-0 text-sea-200" strokeWidth={1.8} />
                {d.auth.panelPoint3}
              </span>
            </div>
          </div>

          <p className="text-xxs tracking-wide text-sea-100/50">
            © {new Date().getFullYear()} {d.app.name} · {d.app.tagline}
          </p>
        </div>
      </div>
    </div>
  );
}
