import { redirect } from 'next/navigation';

export default function VatIndexPage({ searchParams }: { searchParams: { y?: string; m?: string } }) {
  const q = new URLSearchParams();
  if (searchParams.y) q.set('y', searchParams.y);
  if (searchParams.m) q.set('m', searchParams.m);
  const s = q.toString();
  redirect(s ? `/tax/vat/sales?${s}` : '/tax/vat/sales');
}
