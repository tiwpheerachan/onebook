import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ink-50">
      <p className="text-5xl font-semibold text-ink-300">404</p>
      <p className="text-sm text-ink-600">ไม่พบหน้าที่คุณต้องการ</p>
      <Link href="/dashboard" className="btn-primary">กลับสู่แดชบอร์ด</Link>
    </main>
  );
}
