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

  // สั่ง build ทับ .next ขณะ dev server เปิดอยู่จะทำให้ dev server เสิร์ฟของค้าง
  // ตั้ง NEXT_DIST_DIR ตอนตรวจงานเพื่อให้ build ไปลงโฟลเดอร์อื่น ไม่ชนกัน
  distDir: process.env.NEXT_DIST_DIR || '.next',
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
