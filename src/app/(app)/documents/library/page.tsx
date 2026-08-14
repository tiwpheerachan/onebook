import Link from 'next/link';
import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t, currentLocale } from '@/i18n/server';
import { PageHeader } from '@/components/ui/page-header';
import { SearchBox } from '@/components/forms/search-box';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/badge';
import { FileOpenButton } from '@/components/forms/file-open-button';
import { docHref, docKindLabel } from '@/lib/search-meta';
import { cn } from '@/lib/cn';
import { FileText, Image as ImageIcon, File, Paperclip, HardDrive } from 'lucide-react';

export const dynamic = 'force-dynamic';

const PER_PAGE = 40;

function fileSize(n: number | null): string {
  const v = Number(n || 0);
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(0)} KB`;
  return `${(v / 1024 / 1024).toFixed(1)} MB`;
}

function FileIcon({ mime }: { mime: string | null }) {
  const m = mime || '';
  const Icon = m.startsWith('image/') ? ImageIcon : m.includes('pdf') ? FileText : File;
  return <Icon className="h-4 w-4 shrink-0 text-ink-400" strokeWidth={1.8} />;
}

export default async function DocumentLibraryPage({
  searchParams,
}: {
  searchParams: { q?: string; kind?: string; from?: string; to?: string; page?: string };
}) {
  const ctx = await requirePermission('documents', 'view');
  const d = t();
  const L = d.ui.library;
  const locale = currentLocale();

  const page = Math.max(1, Number(searchParams.page) || 1);
  const supabase = createClient();

  const { data } = await supabase.rpc('rpt_document_library', {
    p_company: ctx.company.id,
    p_q: searchParams.q || null,
    p_kind: searchParams.kind || null,
    p_from: searchParams.from || null,
    p_to: searchParams.to || null,
    p_limit: PER_PAGE,
    p_offset: (page - 1) * PER_PAGE,
  });

  const res = (data || {}) as any;
  const files = (res.files || []) as any[];
  const total = Number(res.total || 0);
  const byKind = (res.by_kind || []) as { kind: string; count: number }[];
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));

  // รักษาตัวกรองอื่นไว้เวลาเปลี่ยนตัวกรองเดียว
  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { ...searchParams, ...patch, page: patch.page ?? undefined };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
    const s = p.toString();
    return s ? `/documents/library?${s}` : '/documents/library';
  };

  return (
    <>
      <PageHeader title={L.title} subtitle={`${ctx.company.name_th} · ${L.subtitle}`} />

      {/* ---------- สรุปด้านบน ---------- */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card flex items-center gap-3 p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
            <Paperclip className="h-4 w-4 text-brand-600" strokeWidth={1.8} />
          </span>
          <div>
            <p className="text-lg font-semibold tabular-nums text-ink-900">{total.toLocaleString()}</p>
            <p className="text-xxs text-ink-500">{L.fileCount}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-100">
            <HardDrive className="h-4 w-4 text-ink-500" strokeWidth={1.8} />
          </span>
          <div>
            <p className="text-lg font-semibold tabular-nums text-ink-900">{fileSize(res.total_size)}</p>
            <p className="text-xxs text-ink-500">{L.totalSize}</p>
          </div>
        </div>
      </div>

      {/* ---------- ตัวกรอง ---------- */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="min-w-[16rem] flex-1">
          <SearchBox placeholder={L.searchPlaceholder} defaultValue={searchParams.q} />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link
          href={link({ kind: undefined, page: undefined })}
          className={cn(
            'chip transition',
            !searchParams.kind ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50'
          )}
        >
          {L.allKinds} · {total}
        </Link>
        {byKind.map((k) => (
          <Link
            key={k.kind}
            href={link({ kind: k.kind, page: undefined })}
            className={cn(
              'chip transition',
              searchParams.kind === k.kind
                ? 'bg-brand-600 text-white ring-brand-600'
                : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50'
            )}
          >
            {k.kind === 'unlinked' ? L.unlinked : docKindLabel(d, k.kind)} · {k.count}
          </Link>
        ))}
      </div>

      {/* ---------- ตาราง ---------- */}
      <div className="card overflow-hidden">
        <Table>
          <THead>
            <TR>
              <TH>{L.fileName}</TH>
              <TH>{L.linkedTo}</TH>
              <TH>{L.uploadedBy}</TH>
              <TH className="text-right">{L.size}</TH>
              <TH>{L.uploadedAt}</TH>
              <TH className="text-right">{d.common.actions}</TH>
            </TR>
          </THead>
          <TBody>
            {files.length === 0 && (
              <EmptyRow
                colSpan={6}
                label={searchParams.q || searchParams.kind ? L.noMatch : `${L.empty} — ${L.emptyHint}`}
              />
            )}

            {files.map((f) => (
              <TR key={f.id}>
                <TD>
                  <span className="flex items-center gap-2">
                    <FileIcon mime={f.mime_type} />
                    <span className="truncate font-medium text-ink-800">{f.file_name}</span>
                  </span>
                </TD>
                <TD>
                  {f.document_id ? (
                    <Link
                      href={docHref(f.doc_kind, f.document_id)}
                      className="inline-flex items-center gap-2 text-brand-700 hover:underline"
                    >
                      <span className="font-mono text-xs">{f.doc_number}</span>
                      <span className="text-xs text-ink-500">{docKindLabel(d, f.doc_kind)}</span>
                      {f.doc_status && <StatusBadge status={f.doc_status} />}
                    </Link>
                  ) : (
                    <span className="text-xs text-ink-400">{L.unlinked}</span>
                  )}
                  {f.contact && <span className="block truncate text-xxs text-ink-400">{f.contact}</span>}
                </TD>
                <TD className="text-ink-600">{f.uploaded_by || '—'}</TD>
                <TD className="text-right tabular-nums text-ink-600">{fileSize(f.size_bytes)}</TD>
                <TD className="text-ink-500">
                  {new Date(f.created_at).toLocaleDateString(locale)}
                </TD>
                <TD className="text-right">
                  <FileOpenButton id={f.id} label={L.open} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          {page > 1 && (
            <Link href={link({ page: String(page - 1) })} className="btn-secondary">{L.prev}</Link>
          )}
          <span className="text-xs text-ink-500">{page} / {pages}</span>
          {page < pages && (
            <Link href={link({ page: String(page + 1) })} className="btn-secondary">{L.next}</Link>
          )}
        </div>
      )}

      <p className="mt-4 text-center text-xxs text-ink-400">{L.linkExpires}</p>
    </>
  );
}
