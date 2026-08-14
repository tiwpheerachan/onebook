-- ============================================================================
-- ONEBOOK 0005 : Triggers - audit trail, freeze enforcement, updated_at
-- ============================================================================

create or replace function app.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['companies','profiles','contacts','products','documents'] loop
    execute format('drop trigger if exists trg_touch_%1$s on public.%1$s', t);
    execute format('create trigger trg_touch_%1$s before update on public.%1$s for each row execute function app.touch_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- audit trail
create or replace function app.audit_trigger()
returns trigger language plpgsql security definer set search_path = public, app as $$
declare
  v_company uuid;
  v_email text;
  v_id text;
begin
  begin
    v_company := coalesce(
      (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end ->> 'company_id')::uuid, null);
  exception when others then v_company := null; end;

  select p.email into v_email from public.profiles p where p.id = auth.uid();
  v_id := coalesce((case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id', null);

  insert into public.audit_logs(company_id, user_id, user_email, action, resource, record_id, before_data, after_data)
  values (
    v_company, auth.uid(), v_email, lower(tg_op), tg_table_name, v_id,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('UPDATE','INSERT') then to_jsonb(new) else null end
  );
  return case when tg_op = 'DELETE' then old else new end;
end $$;

do $$
declare t text;
begin
  foreach t in array array['documents','document_lines','journal_entries','journal_lines','payments',
                           'accounts','contacts','products','user_companies','roles','role_permissions',
                           'period_locks','companies','financial_channels'] loop
    execute format('drop trigger if exists trg_audit_%1$s on public.%1$s', t);
    execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$s for each row execute function app.audit_trigger()', t);
  end loop;
end $$;

-- --------------------------------------------------------- freeze enforcement
create or replace function app.enforce_lock_documents()
returns trigger language plpgsql security definer set search_path = public, app as $$
declare v_scope text;
begin
  if tg_op = 'DELETE' then
    v_scope := case when old.kind::text like 'purchase%' or old.kind::text in ('bill','expense','goods_receipt','deposit_payment') then 'purchase' else 'sales' end;
    perform app.assert_period_open(old.company_id, old.doc_date, v_scope);
    perform app.assert_period_open(old.company_id, old.doc_date, 'all');
    return old;
  end if;
  v_scope := case when new.kind::text like 'purchase%' or new.kind::text in ('bill','expense','goods_receipt','deposit_payment') then 'purchase' else 'sales' end;
  perform app.assert_period_open(new.company_id, new.doc_date, v_scope);
  perform app.assert_period_open(new.company_id, new.doc_date, 'all');
  if tg_op = 'UPDATE' and old.doc_date <> new.doc_date then
    perform app.assert_period_open(old.company_id, old.doc_date, 'all');
  end if;
  -- เอกสารที่อนุมัติ/ลงบัญชีแล้ว ห้ามแก้ยอด ต้องยกเลิกแล้วออกใหม่
  if tg_op = 'UPDATE' and old.status in ('approved','paid','partial','closed')
     and new.status = old.status
     and (old.grand_total <> new.grand_total or old.doc_number <> new.doc_number)
     and not app.has_perm(new.company_id, 'documents', 'override') then
    raise exception 'DOC_LOCKED: เอกสารที่อนุมัติแล้วแก้ไขยอดไม่ได้ กรุณายกเลิกและออกใหม่';
  end if;
  return new;
end $$;

drop trigger if exists trg_lock_documents on public.documents;
create trigger trg_lock_documents before insert or update or delete on public.documents
for each row execute function app.enforce_lock_documents();

create or replace function app.enforce_lock_journal()
returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  if tg_op = 'DELETE' then
    perform app.assert_period_open(old.company_id, old.entry_date, 'journal');
    perform app.assert_period_open(old.company_id, old.entry_date, 'all');
    if old.status = 'posted' and not app.has_perm(old.company_id, 'journal', 'void') then
      raise exception 'JOURNAL_POSTED: สมุดรายวันที่ผ่านรายการแล้วต้องใช้การกลับรายการ (reverse) เท่านั้น';
    end if;
    return old;
  end if;
  perform app.assert_period_open(new.company_id, new.entry_date, 'journal');
  perform app.assert_period_open(new.company_id, new.entry_date, 'all');
  return new;
end $$;

drop trigger if exists trg_lock_journal on public.journal_entries;
create trigger trg_lock_journal before insert or update or delete on public.journal_entries
for each row execute function app.enforce_lock_journal();

create or replace function app.enforce_lock_payments()
returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  if tg_op = 'DELETE' then
    perform app.assert_period_open(old.company_id, old.doc_date, 'all'); return old;
  end if;
  perform app.assert_period_open(new.company_id, new.doc_date, 'all');
  return new;
end $$;

drop trigger if exists trg_lock_payments on public.payments;
create trigger trg_lock_payments before insert or update or delete on public.payments
for each row execute function app.enforce_lock_payments();

-- ------------------------------------------------ สมุดรายวันต้องดุล (Dr = Cr)
create or replace function app.assert_journal_balanced()
returns trigger language plpgsql security definer set search_path = public, app as $$
declare v_d numeric(18,2); v_c numeric(18,2); v_entry uuid;
begin
  v_entry := coalesce(new.entry_id, old.entry_id);
  select coalesce(sum(debit),0), coalesce(sum(credit),0) into v_d, v_c
  from public.journal_lines where entry_id = v_entry;
  update public.journal_entries set total_debit = v_d, total_credit = v_c where id = v_entry;
  return null;
end $$;

drop trigger if exists trg_jl_balance on public.journal_lines;
create constraint trigger trg_jl_balance after insert or update or delete on public.journal_lines
deferrable initially deferred for each row execute function app.assert_journal_balanced();

-- --------------------------------------------------- profile อัตโนมัติเมื่อสมัคร
create or replace function app.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  insert into public.profiles(id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists trg_new_user on auth.users;
create trigger trg_new_user after insert on auth.users
for each row execute function app.handle_new_user();
