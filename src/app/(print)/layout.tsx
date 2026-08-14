/**
 * เลย์เอาต์สำหรับหน้าพิมพ์ : ไม่มีเมนู ไม่มีหัวเรื่อง เหลือแต่กระดาษ
 * (root layout ยังครอบ html/body ให้อยู่แล้ว ที่นี่จึงคุมแค่พื้นหลังกับความกว้าง)
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-ink-100 py-6 print:bg-white print:py-0">{children}</div>;
}
