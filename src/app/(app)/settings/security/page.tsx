import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';
import { PageHeader, Card, CardHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Lock, Network, KeyRound, FileClock, Database } from 'lucide-react';

export const dynamic = 'force-dynamic';

/** โครงสร้างอย่างเดียว ตัวข้อความอยู่ในพจนานุกรม (ui.security) */
const CONTROLS = [
  { icon: Network, key: 'ip' }, { icon: Lock, key: 'rls' },
  { icon: KeyRound, key: 'perm' }, { icon: FileClock, key: 'freeze' },
  { icon: Database, key: 'audit' }, { icon: ShieldCheck, key: 'header' },
] as const;

export default async function SecurityPage() {
  const ctx = await requirePermission('settings.security', 'view');
  const d = t();
  const L = d.ui.security;
  const supabase = createClient();
  const { data } = await supabase.from('ip_allowlist').select('*').order('created_at', { ascending: false });
  const rows = (data || []) as any[];

  return (
    <>
      <PageHeader title={d.nav.security} subtitle={`${ctx.company.name_th} · ${L.subtitle}`} />

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {CONTROLS.map((c) => (
          <div key={c.key} className="card card-pad">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50">
                <c.icon className="h-4 w-4 text-brand-600" strokeWidth={1.8} />
              </div>
              <div>
                <p className="text-sm font-medium text-ink-900">{(L as Record<string, string>)[`${c.key}Title`]}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-600">{(L as Record<string, string>)[`${c.key}Body`]}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader title={L.listTitle} description={L.listHint} />
        <Table>
          <THead><TR><TH>CIDR</TH><TH>{d.ui.coa.name}</TH><TH>{d.common.status}</TH></TR></THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={3} label={L.listEmpty} />}
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="font-mono text-xs">{r.cidr}</TD>
                <TD>{r.label || '–'}</TD>
                <TD>{r.is_active ? <Badge tone="success">{d.ui.coa.active}</Badge> : <Badge>{d.ui.coa.inactive}</Badge>}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
