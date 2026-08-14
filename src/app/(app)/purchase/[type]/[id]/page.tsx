import { notFound } from 'next/navigation';
import { DocumentPage } from '@/components/documents/document-page';
import { KIND_SLUG } from '@/lib/constants';
import { isPurchase } from '@/components/documents/doc-meta';

export const dynamic = 'force-dynamic';

export default function PurchaseDocPage({
  params, searchParams,
}: {
  params: { type: string; id: string };
  searchParams: { contact?: string };
}) {
  if (!KIND_SLUG[params.type] || !isPurchase(params.type)) notFound();
  return <DocumentPage slug={params.type} id={params.id} initialContactId={searchParams.contact} />;
}
