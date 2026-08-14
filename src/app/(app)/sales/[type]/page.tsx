import { notFound } from 'next/navigation';
import { DocumentList } from '@/components/documents/document-list';
import { KIND_SLUG } from '@/lib/constants';
import { isPurchase } from '@/components/documents/doc-meta';

export const dynamic = 'force-dynamic';

export default function SalesListPage({
  params, searchParams,
}: { params: { type: string }; searchParams: any }) {
  if (!KIND_SLUG[params.type] || isPurchase(params.type)) notFound();
  return <DocumentList slug={params.type} searchParams={searchParams} />;
}
