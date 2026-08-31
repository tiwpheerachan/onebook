import { VatReport } from '@/components/tax/vat-report';

export const dynamic = 'force-dynamic';

export default async function VatPurchasePage({ searchParams }: { searchParams: { y?: string; m?: string } }) {
  return <VatReport side="input" searchParams={searchParams} />;
}
