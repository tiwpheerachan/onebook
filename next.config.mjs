/** @type {import('next').NextConfig} */
const securityHeaders = [
  // X-Frame-Options ระบุโดเมนที่อนุญาตไม่ได้ มีแค่ DENY กับ SAMEORIGIN
  // จึงย้ายไปใช้ CSP frame-ancestors ที่ middleware แทน (ดู src/lib/frame-policy.ts)
  // และห้ามตั้งกลับมาที่นี่ เพราะมันจะบล็อกทับ CSP
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
