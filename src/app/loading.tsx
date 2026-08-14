import { ShdSplash } from '@/components/ui/shd-loader';
import { t } from '@/i18n/server';

/** ฉากรอระดับราก : เห็นตอนเปิดแอปครั้งแรกและตอนสลับเข้า/ออกจากหน้าล็อกอิน */
export default function Loading() {
  return <ShdSplash label={t().common.startingUp} />;
}
