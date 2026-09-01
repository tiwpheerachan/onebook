import { requirePermission, can } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n/server';
import { PageHeader } from '@/components/ui/page-header';
import { SearchBox } from '@/components/forms/search-box';
import { ContactManager } from '@/components/forms/contact-manager';
import { ContactGroupRail, type GroupRow } from '@/components/forms/contact-groups';
import { ContactTable, type ContactRow } from '@/components/forms/contact-table';
import { ContactToolbar } from '@/components/forms/contact-toolbar';
import { ExportCsvButton } from '@/components/ui/export-csv';

export const dynamic = 'force-dynamic';

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: { q?: string; t?: string; g?: string; sort?: string; dir?: string; page?: string; per?: string };
}) {
  const ctx = await requirePermission('contacts', 'view');
  const d = t();
  const M = d.ui.misc;
  const supabase = createClient();
  const canEdit = can(ctx, 'contacts', 'edit');

  // กลุ่มที่ตั้งเอง พร้อมจำนวนสมาชิก
  const [{ data: groupRows }, { data: memberRows }] = await Promise.all([
    supabase.from('contact_groups').select('id, name, color, sort_order')
      .eq('company_id', ctx.company.id).order('sort_order').order('name'),
    supabase.from('contact_group_members').select('contact_id, group_id')
      .eq('company_id', ctx.company.id),
  ]);

  const members = memberRows || [];
  const groups: GroupRow[] = (groupRows || []).map((g: any) => ({
    id: g.id, name: g.name, color: g.color,
    member_count: members.filter((m: any) => m.group_id === g.id).length,
  }));

  // ผู้ติดต่อตามตัวกรองที่เลือก
  const SORTABLE = ['code', 'name', 'credit_days'];
  const sort = SORTABLE.includes(searchParams.sort || '') ? searchParams.sort! : 'code';
  const asc = searchParams.dir !== 'desc';
  const perPage = [10, 25, 50, 100].includes(Number(searchParams.per)) ? Number(searchParams.per) : 10;
  const page = Math.max(1, Number(searchParams.page) || 1);

  // count: exact เพื่อให้ตัวแบ่งหน้ารู้จำนวนจริงโดยไม่ต้องดึงข้อมูลทั้งหมด
  const [{ data: repOpts }, { data: zoneOpts }] = await Promise.all([
    supabase.from('sales_reps').select('id, code, name')
      .eq('company_id', ctx.company.id).eq('is_active', true).order('code'),
    supabase.from('sales_zones').select('id, code, name')
      .eq('company_id', ctx.company.id).eq('is_active', true).order('code'),
  ]);
  const reps = (repOpts || []).map((r: any) => ({ id: r.id, label: `${r.code} · ${r.name}` }));
  const zones = (zoneOpts || []).map((z: any) => ({ id: z.id, label: `${z.code} · ${z.name}` }));

  let q = supabase
    .from('contacts')
    .select('*', { count: 'exact' })
    .eq('company_id', ctx.company.id)
    .order(sort, { ascending: asc })
    .range((page - 1) * perPage, page * perPage - 1);
  if (searchParams.q) {
    q = q.or(`name.ilike.%${searchParams.q}%,code.ilike.%${searchParams.q}%,tax_id.ilike.%${searchParams.q}%`);
  }
  if (searchParams.g) {
    const ids = members.filter((m: any) => m.group_id === searchParams.g).map((m: any) => m.contact_id);
    // กลุ่มว่างต้องได้ผลลัพธ์ว่าง ไม่ใช่แสดงทุกคน
    q = q.in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  } else if (searchParams.t === 'customer') {
    q = q.in('kind', ['customer', 'both']).eq('is_active', true);
  } else if (searchParams.t === 'vendor') {
    q = q.in('kind', ['vendor', 'both']).eq('is_active', true);
  } else if (searchParams.t === 'inactive') {
    q = q.eq('is_active', false);
  } else {
    q = q.eq('is_active', true);
  }

  const { data, count } = await q;
  const raw = (data || []) as any[];
  const total = count ?? raw.length;

  const groupById = new Map(groups.map((g) => [g.id, g]));
  const rows: ContactRow[] = raw.map((r) => ({
    id: r.id, code: r.code, name: r.name, tax_id: r.tax_id, kind: r.kind,
    phone: r.phone, credit_days: r.credit_days, credit_limit: r.credit_limit,
    is_active: r.is_active,
    groups: members
      .filter((m: any) => m.contact_id === r.id)
      .map((m: any) => groupById.get(m.group_id))
      .filter(Boolean)
      .map((g: any) => ({ id: g.id, name: g.name, color: g.color })),
  }));

  // จำนวนของกลุ่มมาตรฐาน คำนวณครั้งเดียวจากทั้งบริษัท
  const { data: allRows } = await supabase
    .from('contacts').select('kind, is_active').eq('company_id', ctx.company.id).limit(5000);
  const all = allRows || [];
  const counts: Record<string, number> = {
    all: all.filter((c: any) => c.is_active).length,
    customer: all.filter((c: any) => c.is_active && ['customer', 'both'].includes(c.kind)).length,
    vendor: all.filter((c: any) => c.is_active && ['vendor', 'both'].includes(c.kind)).length,
    inactive: all.filter((c: any) => !c.is_active).length,
  };

  const labels = {
    create: d.common.create, edit: d.common.edit, save: d.common.save,
    cancel: d.common.cancel, required: d.common.required,
    creditLimit: d.ui.credit.limit, creditHint: d.ui.credit.zeroMeansUnlimited,
    salesRep: d.ui.salesRep.onDoc, salesZone: d.ui.salesRep.zoneOnDoc,
    unassigned: d.ui.salesRep.unassigned,
    ...d.ui.master,
  };

  return (
    <>
      <PageHeader
        title={d.nav.contacts}
        subtitle={`${ctx.company.name_th} · ${M.nContacts.replace('{n}', total.toLocaleString('en-US'))}`}
        action={
          <>
            <SearchBox placeholder={d.common.search} defaultValue={searchParams.q} />
            <ContactManager canCreate={can(ctx, 'contacts', 'create')} canEdit={canEdit}
                            labels={labels} reps={reps} zones={zones} />
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <ContactGroupRail groups={groups} canEdit={canEdit} counts={counts} />
        <div className="min-w-0">
          <ContactToolbar
            groups={groups}
            canEdit={canEdit}
            canImport={can(ctx, 'contacts', 'create')}
            exportButton={
              can(ctx, 'contacts', 'export') ? (
                <ExportCsvButton
                  label={M.exportPage}
                  filename="contacts.csv"
                  rows={[
                    [M.productCode, M.productName, M.contactTaxId, M.productKind, M.contactGroup, M.contactPhone, M.contactCreditDays],
                    ...rows.map((r) => [
                      r.code, r.name, r.tax_id || '', r.kind,
                      r.groups.map((g) => g.name).join(' / '), r.phone || '', r.credit_days,
                    ]),
                  ]}
                />
              ) : null
            }
          />
          <ContactTable
            rows={rows}
            groups={groups}
            currentGroup={searchParams.g}
            groupName={groups.find((g) => g.id === searchParams.g)?.name}
            canEdit={canEdit}
            canCreateDoc={can(ctx, 'documents', 'create')}
            labels={labels}
            reps={reps}
            zones={zones}
            page={page}
            perPage={perPage}
            total={total}
          />
        </div>
      </div>
    </>
  );
}
