-- ============================================================================
-- ONEBOOK 0001 : Extensions, schema, enums
-- ============================================================================
create extension if not exists "pgcrypto";
create extension if not exists "citext";

create schema if not exists app;
comment on schema app is 'Internal helper functions (security definer). Not exposed to PostgREST.';

revoke all on schema app from anon, authenticated;
grant usage on schema app to authenticated;

-- ---------------------------------------------------------------- enum types
do $$ begin
  create type doc_kind as enum (
    'quotation','billing_note','invoice','tax_invoice','receipt',
    'credit_note','debit_note','deposit_receipt',
    'purchase_request','purchase_order','goods_receipt','bill','expense',
    'purchase_credit_note','purchase_debit_note','deposit_payment'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type doc_status as enum ('draft','awaiting_approval','approved','partial','paid','overdue','void','closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type account_type as enum ('asset','liability','equity','revenue','cost_of_sales','expense','other_income','other_expense','tax');
exception when duplicate_object then null; end $$;

do $$ begin
  create type vat_treatment as enum ('exclusive','inclusive','zero_rated','exempt','none');
exception when duplicate_object then null; end $$;

do $$ begin
  create type contact_kind as enum ('customer','vendor','both');
exception when duplicate_object then null; end $$;

do $$ begin
  create type channel_kind as enum ('cash','bank','e_wallet','credit_card','cheque');
exception when duplicate_object then null; end $$;

do $$ begin
  create type journal_status as enum ('draft','posted','reversed');
exception when duplicate_object then null; end $$;
