-- ============================================================================
-- ONEBOOK 0006 : Row Level Security  (ปิดกั้นข้ามบริษัท + ตรวจสิทธิ์ทุกการกระทำ)
-- ============================================================================

alter table public.companies enable row level security;
alter table public.companies force row level security;
alter table public.accounts enable row level security;
alter table public.accounts force row level security;
alter table public.contacts enable row level security;
alter table public.contacts force row level security;
alter table public.products enable row level security;
alter table public.products force row level security;
alter table public.financial_channels enable row level security;
alter table public.financial_channels force row level security;
alter table public.dimensions enable row level security;
alter table public.dimensions force row level security;
alter table public.documents enable row level security;
alter table public.documents force row level security;
alter table public.document_lines enable row level security;
alter table public.document_lines force row level security;
alter table public.payments enable row level security;
alter table public.payments force row level security;
alter table public.payment_allocations enable row level security;
alter table public.payment_allocations force row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_entries force row level security;
alter table public.journal_lines enable row level security;
alter table public.journal_lines force row level security;
alter table public.inventory_moves enable row level security;
alter table public.inventory_moves force row level security;
alter table public.wht_certificates enable row level security;
alter table public.wht_certificates force row level security;
alter table public.wht_certificate_lines enable row level security;
alter table public.wht_certificate_lines force row level security;
alter table public.attachments enable row level security;
alter table public.attachments force row level security;
alter table public.doc_sequences enable row level security;
alter table public.doc_sequences force row level security;
alter table public.period_locks enable row level security;
alter table public.period_locks force row level security;
alter table public.ip_allowlist enable row level security;
alter table public.ip_allowlist force row level security;
alter table public.roles enable row level security;
alter table public.roles force row level security;
alter table public.role_permissions enable row level security;
alter table public.role_permissions force row level security;
alter table public.user_companies enable row level security;
alter table public.user_companies force row level security;
alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.wht_types enable row level security;
alter table public.wht_types force row level security;

-- ---- accounts
drop policy if exists "accounts_sel" on public.accounts;
drop policy if exists "accounts_ins" on public.accounts;
drop policy if exists "accounts_upd" on public.accounts;
drop policy if exists "accounts_del" on public.accounts;
create policy "accounts_sel" on public.accounts for select to authenticated
  using (app.has_perm(company_id, 'accounting.coa', 'view'));
create policy "accounts_ins" on public.accounts for insert to authenticated
  with check (app.has_perm(company_id, 'accounting.coa', 'create'));
create policy "accounts_upd" on public.accounts for update to authenticated
  using (app.has_perm(company_id, 'accounting.coa', 'edit'))
  with check (app.has_perm(company_id, 'accounting.coa', 'edit'));
create policy "accounts_del" on public.accounts for delete to authenticated
  using (app.has_perm(company_id, 'accounting.coa', 'delete'));

-- ---- contacts
drop policy if exists "contacts_sel" on public.contacts;
drop policy if exists "contacts_ins" on public.contacts;
drop policy if exists "contacts_upd" on public.contacts;
drop policy if exists "contacts_del" on public.contacts;
create policy "contacts_sel" on public.contacts for select to authenticated
  using (app.has_perm(company_id, 'contacts', 'view'));
create policy "contacts_ins" on public.contacts for insert to authenticated
  with check (app.has_perm(company_id, 'contacts', 'create'));
create policy "contacts_upd" on public.contacts for update to authenticated
  using (app.has_perm(company_id, 'contacts', 'edit'))
  with check (app.has_perm(company_id, 'contacts', 'edit'));
create policy "contacts_del" on public.contacts for delete to authenticated
  using (app.has_perm(company_id, 'contacts', 'delete'));

-- ---- products
drop policy if exists "products_sel" on public.products;
drop policy if exists "products_ins" on public.products;
drop policy if exists "products_upd" on public.products;
drop policy if exists "products_del" on public.products;
create policy "products_sel" on public.products for select to authenticated
  using (app.has_perm(company_id, 'products', 'view'));
create policy "products_ins" on public.products for insert to authenticated
  with check (app.has_perm(company_id, 'products', 'create'));
create policy "products_upd" on public.products for update to authenticated
  using (app.has_perm(company_id, 'products', 'edit'))
  with check (app.has_perm(company_id, 'products', 'edit'));
create policy "products_del" on public.products for delete to authenticated
  using (app.has_perm(company_id, 'products', 'delete'));

-- ---- financial_channels
drop policy if exists "financial_channels_sel" on public.financial_channels;
drop policy if exists "financial_channels_ins" on public.financial_channels;
drop policy if exists "financial_channels_upd" on public.financial_channels;
drop policy if exists "financial_channels_del" on public.financial_channels;
create policy "financial_channels_sel" on public.financial_channels for select to authenticated
  using (app.has_perm(company_id, 'finance.channels', 'view'));
create policy "financial_channels_ins" on public.financial_channels for insert to authenticated
  with check (app.has_perm(company_id, 'finance.channels', 'create'));
create policy "financial_channels_upd" on public.financial_channels for update to authenticated
  using (app.has_perm(company_id, 'finance.channels', 'edit'))
  with check (app.has_perm(company_id, 'finance.channels', 'edit'));
create policy "financial_channels_del" on public.financial_channels for delete to authenticated
  using (app.has_perm(company_id, 'finance.channels', 'delete'));

-- ---- dimensions
drop policy if exists "dimensions_sel" on public.dimensions;
drop policy if exists "dimensions_ins" on public.dimensions;
drop policy if exists "dimensions_upd" on public.dimensions;
drop policy if exists "dimensions_del" on public.dimensions;
create policy "dimensions_sel" on public.dimensions for select to authenticated
  using (app.has_perm(company_id, 'settings.dimensions', 'view'));
create policy "dimensions_ins" on public.dimensions for insert to authenticated
  with check (app.has_perm(company_id, 'settings.dimensions', 'create'));
create policy "dimensions_upd" on public.dimensions for update to authenticated
  using (app.has_perm(company_id, 'settings.dimensions', 'edit'))
  with check (app.has_perm(company_id, 'settings.dimensions', 'edit'));
create policy "dimensions_del" on public.dimensions for delete to authenticated
  using (app.has_perm(company_id, 'settings.dimensions', 'delete'));

-- ---- documents
drop policy if exists "documents_sel" on public.documents;
drop policy if exists "documents_ins" on public.documents;
drop policy if exists "documents_upd" on public.documents;
drop policy if exists "documents_del" on public.documents;
create policy "documents_sel" on public.documents for select to authenticated
  using (app.has_perm(company_id, 'documents', 'view'));
create policy "documents_ins" on public.documents for insert to authenticated
  with check (app.has_perm(company_id, 'documents', 'create'));
create policy "documents_upd" on public.documents for update to authenticated
  using (app.has_perm(company_id, 'documents', 'edit'))
  with check (app.has_perm(company_id, 'documents', 'edit'));
create policy "documents_del" on public.documents for delete to authenticated
  using (app.has_perm(company_id, 'documents', 'delete'));

-- ---- document_lines
drop policy if exists "document_lines_sel" on public.document_lines;
drop policy if exists "document_lines_ins" on public.document_lines;
drop policy if exists "document_lines_upd" on public.document_lines;
drop policy if exists "document_lines_del" on public.document_lines;
create policy "document_lines_sel" on public.document_lines for select to authenticated
  using (app.has_perm(company_id, 'documents', 'view'));
create policy "document_lines_ins" on public.document_lines for insert to authenticated
  with check (app.has_perm(company_id, 'documents', 'create'));
create policy "document_lines_upd" on public.document_lines for update to authenticated
  using (app.has_perm(company_id, 'documents', 'edit'))
  with check (app.has_perm(company_id, 'documents', 'edit'));
create policy "document_lines_del" on public.document_lines for delete to authenticated
  using (app.has_perm(company_id, 'documents', 'delete'));

-- ---- payments
drop policy if exists "payments_sel" on public.payments;
drop policy if exists "payments_ins" on public.payments;
drop policy if exists "payments_upd" on public.payments;
drop policy if exists "payments_del" on public.payments;
create policy "payments_sel" on public.payments for select to authenticated
  using (app.has_perm(company_id, 'finance.payments', 'view'));
create policy "payments_ins" on public.payments for insert to authenticated
  with check (app.has_perm(company_id, 'finance.payments', 'create'));
create policy "payments_upd" on public.payments for update to authenticated
  using (app.has_perm(company_id, 'finance.payments', 'edit'))
  with check (app.has_perm(company_id, 'finance.payments', 'edit'));
create policy "payments_del" on public.payments for delete to authenticated
  using (app.has_perm(company_id, 'finance.payments', 'delete'));

-- ---- payment_allocations
drop policy if exists "payment_allocations_sel" on public.payment_allocations;
drop policy if exists "payment_allocations_ins" on public.payment_allocations;
drop policy if exists "payment_allocations_upd" on public.payment_allocations;
drop policy if exists "payment_allocations_del" on public.payment_allocations;
create policy "payment_allocations_sel" on public.payment_allocations for select to authenticated
  using (app.has_perm(company_id, 'finance.payments', 'view'));
create policy "payment_allocations_ins" on public.payment_allocations for insert to authenticated
  with check (app.has_perm(company_id, 'finance.payments', 'create'));
create policy "payment_allocations_upd" on public.payment_allocations for update to authenticated
  using (app.has_perm(company_id, 'finance.payments', 'edit'))
  with check (app.has_perm(company_id, 'finance.payments', 'edit'));
create policy "payment_allocations_del" on public.payment_allocations for delete to authenticated
  using (app.has_perm(company_id, 'finance.payments', 'delete'));

-- ---- journal_entries
drop policy if exists "journal_entries_sel" on public.journal_entries;
drop policy if exists "journal_entries_ins" on public.journal_entries;
drop policy if exists "journal_entries_upd" on public.journal_entries;
drop policy if exists "journal_entries_del" on public.journal_entries;
create policy "journal_entries_sel" on public.journal_entries for select to authenticated
  using (app.has_perm(company_id, 'journal', 'view'));
create policy "journal_entries_ins" on public.journal_entries for insert to authenticated
  with check (app.has_perm(company_id, 'journal', 'create'));
create policy "journal_entries_upd" on public.journal_entries for update to authenticated
  using (app.has_perm(company_id, 'journal', 'edit'))
  with check (app.has_perm(company_id, 'journal', 'edit'));
create policy "journal_entries_del" on public.journal_entries for delete to authenticated
  using (app.has_perm(company_id, 'journal', 'delete'));

-- ---- journal_lines
drop policy if exists "journal_lines_sel" on public.journal_lines;
drop policy if exists "journal_lines_ins" on public.journal_lines;
drop policy if exists "journal_lines_upd" on public.journal_lines;
drop policy if exists "journal_lines_del" on public.journal_lines;
create policy "journal_lines_sel" on public.journal_lines for select to authenticated
  using (app.has_perm(company_id, 'journal', 'view'));
create policy "journal_lines_ins" on public.journal_lines for insert to authenticated
  with check (app.has_perm(company_id, 'journal', 'create'));
create policy "journal_lines_upd" on public.journal_lines for update to authenticated
  using (app.has_perm(company_id, 'journal', 'edit'))
  with check (app.has_perm(company_id, 'journal', 'edit'));
create policy "journal_lines_del" on public.journal_lines for delete to authenticated
  using (app.has_perm(company_id, 'journal', 'delete'));

-- ---- inventory_moves
drop policy if exists "inventory_moves_sel" on public.inventory_moves;
drop policy if exists "inventory_moves_ins" on public.inventory_moves;
drop policy if exists "inventory_moves_upd" on public.inventory_moves;
drop policy if exists "inventory_moves_del" on public.inventory_moves;
create policy "inventory_moves_sel" on public.inventory_moves for select to authenticated
  using (app.has_perm(company_id, 'products', 'view'));
create policy "inventory_moves_ins" on public.inventory_moves for insert to authenticated
  with check (app.has_perm(company_id, 'products', 'create'));
create policy "inventory_moves_upd" on public.inventory_moves for update to authenticated
  using (app.has_perm(company_id, 'products', 'edit'))
  with check (app.has_perm(company_id, 'products', 'edit'));
create policy "inventory_moves_del" on public.inventory_moves for delete to authenticated
  using (app.has_perm(company_id, 'products', 'delete'));

-- ---- wht_certificates
drop policy if exists "wht_certificates_sel" on public.wht_certificates;
drop policy if exists "wht_certificates_ins" on public.wht_certificates;
drop policy if exists "wht_certificates_upd" on public.wht_certificates;
drop policy if exists "wht_certificates_del" on public.wht_certificates;
create policy "wht_certificates_sel" on public.wht_certificates for select to authenticated
  using (app.has_perm(company_id, 'tax.wht', 'view'));
create policy "wht_certificates_ins" on public.wht_certificates for insert to authenticated
  with check (app.has_perm(company_id, 'tax.wht', 'create'));
create policy "wht_certificates_upd" on public.wht_certificates for update to authenticated
  using (app.has_perm(company_id, 'tax.wht', 'edit'))
  with check (app.has_perm(company_id, 'tax.wht', 'edit'));
create policy "wht_certificates_del" on public.wht_certificates for delete to authenticated
  using (app.has_perm(company_id, 'tax.wht', 'delete'));

-- ---- wht_certificate_lines
drop policy if exists "wht_certificate_lines_sel" on public.wht_certificate_lines;
drop policy if exists "wht_certificate_lines_ins" on public.wht_certificate_lines;
drop policy if exists "wht_certificate_lines_upd" on public.wht_certificate_lines;
drop policy if exists "wht_certificate_lines_del" on public.wht_certificate_lines;
create policy "wht_certificate_lines_sel" on public.wht_certificate_lines for select to authenticated
  using (app.has_perm(company_id, 'tax.wht', 'view'));
create policy "wht_certificate_lines_ins" on public.wht_certificate_lines for insert to authenticated
  with check (app.has_perm(company_id, 'tax.wht', 'create'));
create policy "wht_certificate_lines_upd" on public.wht_certificate_lines for update to authenticated
  using (app.has_perm(company_id, 'tax.wht', 'edit'))
  with check (app.has_perm(company_id, 'tax.wht', 'edit'));
create policy "wht_certificate_lines_del" on public.wht_certificate_lines for delete to authenticated
  using (app.has_perm(company_id, 'tax.wht', 'delete'));

-- ---- attachments
drop policy if exists "attachments_sel" on public.attachments;
drop policy if exists "attachments_ins" on public.attachments;
drop policy if exists "attachments_upd" on public.attachments;
drop policy if exists "attachments_del" on public.attachments;
create policy "attachments_sel" on public.attachments for select to authenticated
  using (app.has_perm(company_id, 'documents', 'view'));
create policy "attachments_ins" on public.attachments for insert to authenticated
  with check (app.has_perm(company_id, 'documents', 'create'));
create policy "attachments_upd" on public.attachments for update to authenticated
  using (app.has_perm(company_id, 'documents', 'edit'))
  with check (app.has_perm(company_id, 'documents', 'edit'));
create policy "attachments_del" on public.attachments for delete to authenticated
  using (app.has_perm(company_id, 'documents', 'delete'));

-- ---- doc_sequences
drop policy if exists "doc_sequences_sel" on public.doc_sequences;
drop policy if exists "doc_sequences_ins" on public.doc_sequences;
drop policy if exists "doc_sequences_upd" on public.doc_sequences;
drop policy if exists "doc_sequences_del" on public.doc_sequences;
create policy "doc_sequences_sel" on public.doc_sequences for select to authenticated
  using (app.has_perm(company_id, 'settings.numbering', 'view'));
create policy "doc_sequences_ins" on public.doc_sequences for insert to authenticated
  with check (app.has_perm(company_id, 'settings.numbering', 'create'));
create policy "doc_sequences_upd" on public.doc_sequences for update to authenticated
  using (app.has_perm(company_id, 'settings.numbering', 'edit'))
  with check (app.has_perm(company_id, 'settings.numbering', 'edit'));
create policy "doc_sequences_del" on public.doc_sequences for delete to authenticated
  using (app.has_perm(company_id, 'settings.numbering', 'delete'));

-- ---- period_locks
drop policy if exists "period_locks_sel" on public.period_locks;
drop policy if exists "period_locks_ins" on public.period_locks;
drop policy if exists "period_locks_upd" on public.period_locks;
drop policy if exists "period_locks_del" on public.period_locks;
create policy "period_locks_sel" on public.period_locks for select to authenticated
  using (app.has_perm(company_id, 'period', 'view'));
create policy "period_locks_ins" on public.period_locks for insert to authenticated
  with check (app.has_perm(company_id, 'period', 'create'));
create policy "period_locks_upd" on public.period_locks for update to authenticated
  using (app.has_perm(company_id, 'period', 'edit'))
  with check (app.has_perm(company_id, 'period', 'edit'));
create policy "period_locks_del" on public.period_locks for delete to authenticated
  using (app.has_perm(company_id, 'period', 'delete'));

-- ---- ip_allowlist
drop policy if exists "ip_allowlist_sel" on public.ip_allowlist;
drop policy if exists "ip_allowlist_ins" on public.ip_allowlist;
drop policy if exists "ip_allowlist_upd" on public.ip_allowlist;
drop policy if exists "ip_allowlist_del" on public.ip_allowlist;
create policy "ip_allowlist_sel" on public.ip_allowlist for select to authenticated
  using (app.has_perm(company_id, 'settings.security', 'view'));
create policy "ip_allowlist_ins" on public.ip_allowlist for insert to authenticated
  with check (app.has_perm(company_id, 'settings.security', 'create'));
create policy "ip_allowlist_upd" on public.ip_allowlist for update to authenticated
  using (app.has_perm(company_id, 'settings.security', 'edit'))
  with check (app.has_perm(company_id, 'settings.security', 'edit'));
create policy "ip_allowlist_del" on public.ip_allowlist for delete to authenticated
  using (app.has_perm(company_id, 'settings.security', 'delete'));
-- ---- companies (ตารางหลัก ใช้ id แทน company_id)
drop policy if exists "companies_sel" on public.companies;
drop policy if exists "companies_ins" on public.companies;
drop policy if exists "companies_upd" on public.companies;
drop policy if exists "companies_del" on public.companies;
create policy "companies_sel" on public.companies for select to authenticated
  using (app.can_access_company(id));
create policy "companies_ins" on public.companies for insert to authenticated
  with check (app.is_group_admin());
create policy "companies_upd" on public.companies for update to authenticated
  using (app.has_perm(id, 'settings.companies', 'edit'))
  with check (app.has_perm(id, 'settings.companies', 'edit'));
create policy "companies_del" on public.companies for delete to authenticated
  using (app.is_group_admin());

-- ---- profiles
drop policy if exists "profiles_self_sel" on public.profiles;
drop policy if exists "profiles_admin_all" on public.profiles;
drop policy if exists "profiles_self_upd" on public.profiles;
create policy "profiles_self_sel" on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or app.is_group_admin()
    or exists (
      select 1 from public.user_companies uc
      where uc.user_id = profiles.id
        and app.has_perm(uc.company_id, 'settings.users', 'view')
    )
  );
create policy "profiles_self_upd" on public.profiles for update to authenticated
  using (id = auth.uid() or app.is_group_admin())
  with check (id = auth.uid() or app.is_group_admin());
create policy "profiles_admin_all" on public.profiles for insert to authenticated
  with check (app.is_group_admin());

-- ---- user_companies / roles / role_permissions
drop policy if exists "user_companies_sel" on public.user_companies;
drop policy if exists "user_companies_ins" on public.user_companies;
drop policy if exists "user_companies_upd" on public.user_companies;
drop policy if exists "user_companies_del" on public.user_companies;
create policy "user_companies_sel" on public.user_companies for select to authenticated
  using (user_id = auth.uid() or app.has_perm(company_id, 'settings.users', 'view'));
create policy "user_companies_ins" on public.user_companies for insert to authenticated
  with check (app.has_perm(company_id, 'settings.users', 'create'));
create policy "user_companies_upd" on public.user_companies for update to authenticated
  using (app.has_perm(company_id, 'settings.users', 'edit'))
  with check (app.has_perm(company_id, 'settings.users', 'edit'));
create policy "user_companies_del" on public.user_companies for delete to authenticated
  using (app.has_perm(company_id, 'settings.users', 'delete'));

drop policy if exists "roles_sel" on public.roles;
drop policy if exists "roles_write" on public.roles;
create policy "roles_sel" on public.roles for select to authenticated
  using (company_id is null or app.can_access_company(company_id));
create policy "roles_write" on public.roles for all to authenticated
  using (company_id is not null and app.has_perm(company_id, 'settings.roles', 'edit'))
  with check (company_id is not null and app.has_perm(company_id, 'settings.roles', 'edit'));

drop policy if exists "role_permissions_sel" on public.role_permissions;
drop policy if exists "role_permissions_write" on public.role_permissions;
create policy "role_permissions_sel" on public.role_permissions for select to authenticated
  using (exists (select 1 from public.roles r where r.id = role_id
                 and (r.company_id is null or app.can_access_company(r.company_id))));
create policy "role_permissions_write" on public.role_permissions for all to authenticated
  using (exists (select 1 from public.roles r where r.id = role_id and r.company_id is not null
                 and app.has_perm(r.company_id, 'settings.roles', 'edit')))
  with check (exists (select 1 from public.roles r where r.id = role_id and r.company_id is not null
                 and app.has_perm(r.company_id, 'settings.roles', 'edit')));

-- ---- audit_logs : อ่านอย่างเดียว ห้ามแก้/ลบเด็ดขาด
drop policy if exists "audit_logs_sel" on public.audit_logs;
create policy "audit_logs_sel" on public.audit_logs for select to authenticated
  using (company_id is null and app.is_group_admin()
         or app.has_perm(company_id, 'settings.audit', 'view'));
revoke insert, update, delete on public.audit_logs from authenticated;

-- ---- wht_types : ตารางอ้างอิงกลาง อ่านได้ทุกคน
alter table public.wht_types enable row level security;
drop policy if exists "wht_types_sel" on public.wht_types;
create policy "wht_types_sel" on public.wht_types for select to authenticated using (true);
