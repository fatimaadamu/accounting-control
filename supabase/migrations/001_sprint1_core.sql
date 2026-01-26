-- 001_sprint1_core.sql
-- Sprint 1: Core accounting engine tables + RLS

create extension if not exists "uuid-ossp";

do $$ begin
  create type period_status as enum ('open','closed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type journal_status as enum ('draft','approved','posted','reversed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type app_role as enum ('Admin','AccountsOfficer','Manager','Director','Auditor');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type normal_balance as enum ('debit','credit');
exception when duplicate_object then null;
end $$;

create table if not exists public.companies (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  base_currency text not null default 'GHS',
  fy_start_month int not null default 10,
  created_at timestamptz not null default now()
);

create table if not exists public.financial_years (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  unique(company_id, start_date, end_date)
);

create table if not exists public.periods (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete restrict,
  financial_year_id uuid not null references public.financial_years(id) on delete restrict,
  period_month int not null check (period_month between 1 and 12),
  period_year int not null,
  start_date date not null,
  end_date date not null,
  status period_status not null default 'open',
  closed_at timestamptz,
  closed_by uuid,
  reopened_at timestamptz,
  reopened_by uuid,
  reopen_reason text,
  created_at timestamptz not null default now(),
  unique(company_id, financial_year_id, period_month, period_year)
);

create table if not exists public.user_company_roles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null,
  company_id uuid not null references public.companies(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique(user_id, company_id, role)
);

create index if not exists idx_user_company_roles_user on public.user_company_roles(user_id);
create index if not exists idx_user_company_roles_company on public.user_company_roles(company_id);

create table if not exists public.account_types (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz not null default now(),
  unique(name)
);

create table if not exists public.account_headers (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  account_type_id uuid not null references public.account_types(id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.account_groups (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  header_id uuid not null references public.account_headers(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.account_categories (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  group_id uuid not null references public.account_groups(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.accounts (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  category_id uuid not null references public.account_categories(id) on delete cascade,
  code text not null,
  name text not null,
  normal_balance normal_balance not null,
  is_control boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(company_id, code)
);

create index if not exists idx_accounts_company on public.accounts(company_id);

create table if not exists public.journal_entries (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete restrict,
  period_id uuid not null references public.periods(id) on delete restrict,
  entry_date date not null,
  narration text not null,
  status journal_status not null default 'draft',
  created_by uuid not null,
  approved_by uuid,
  approved_at timestamptz,
  posted_by uuid,
  posted_at timestamptz,
  reversed_by uuid,
  reversed_at timestamptz,
  reversal_of uuid references public.journal_entries(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.journal_lines (
  id uuid primary key default uuid_generate_v4(),
  journal_id uuid not null references public.journal_entries(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  debit numeric(18,2) not null default 0 check (debit >= 0),
  credit numeric(18,2) not null default 0 check (credit >= 0),
  created_at timestamptz not null default now(),
  check (not (debit > 0 and credit > 0)),
  check (debit > 0 or credit > 0)
);

create index if not exists idx_journal_entries_company on public.journal_entries(company_id);
create index if not exists idx_journal_lines_journal on public.journal_lines(journal_id);

create table if not exists public.audit_logs (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  entity text not null,
  entity_id uuid,
  action text not null,
  before jsonb,
  after jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_company on public.audit_logs(company_id);
create index if not exists idx_audit_logs_entity on public.audit_logs(entity);

alter table public.companies enable row level security;
alter table public.financial_years enable row level security;
alter table public.periods enable row level security;
alter table public.user_company_roles enable row level security;

alter table public.account_headers enable row level security;
alter table public.account_groups enable row level security;
alter table public.account_categories enable row level security;
alter table public.accounts enable row level security;

alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;
alter table public.audit_logs enable row level security;

create policy "companies_select_by_membership"
on public.companies for select
using (
  exists (
    select 1 from public.user_company_roles ucr
    where ucr.company_id = companies.id
      and ucr.user_id = auth.uid()
  )
);

create policy "ucr_select_own"
on public.user_company_roles for select
using (user_id = auth.uid());

create policy "financial_years_select_by_membership"
on public.financial_years for select
using (
  exists (
    select 1 from public.user_company_roles ucr
    where ucr.company_id = financial_years.company_id
      and ucr.user_id = auth.uid()
  )
);

create policy "periods_select_by_membership"
on public.periods for select
using (
  exists (
    select 1 from public.user_company_roles ucr
    where ucr.company_id = periods.company_id
      and ucr.user_id = auth.uid()
  )
);

create policy "account_headers_select_by_membership"
on public.account_headers for select
using (
  exists (
    select 1 from public.user_company_roles ucr
    where ucr.company_id = account_headers.company_id
      and ucr.user_id = auth.uid()
  )
);

create policy "account_groups_select_by_membership"
on public.account_groups for select
using (
  exists (
    select 1 from public.user_company_roles ucr
    where ucr.company_id = account_groups.company_id
      and ucr.user_id = auth.uid()
  )
);

create policy "account_categories_select_by_membership"
on public.account_categories for select
using (
  exists (
    select 1 from public.user_company_roles ucr
    where ucr.company_id = account_categories.company_id
      and ucr.user_id = auth.uid()
  )
);

create policy "accounts_select_by_membership"
on public.accounts for select
using (
  exists (
    select 1 from public.user_company_roles ucr
    where ucr.company_id = accounts.company_id
      and ucr.user_id = auth.uid()
  )
);

create policy "journal_entries_select_by_membership"
on public.journal_entries for select
using (
  exists (
    select 1 from public.user_company_roles ucr
    where ucr.company_id = journal_entries.company_id
      and ucr.user_id = auth.uid()
  )
);

create policy "journal_lines_select_by_membership"
on public.journal_lines for select
using (
  exists (
    select 1
    from public.journal_entries je
    join public.user_company_roles ucr
      on ucr.company_id = je.company_id
     and ucr.user_id = auth.uid()
    where je.id = journal_lines.journal_id
  )
);

create policy "audit_logs_select_limited_roles"
on public.audit_logs for select
using (
  exists (
    select 1 from public.user_company_roles ucr
    where ucr.company_id = audit_logs.company_id
      and ucr.user_id = auth.uid()
      and ucr.role in ('Admin','Manager','Auditor')
  )
);

revoke insert, update, delete on
  public.companies,
  public.financial_years,
  public.periods,
  public.account_types,
  public.account_headers,
  public.account_groups,
  public.account_categories,
  public.accounts,
  public.journal_entries,
  public.journal_lines,
  public.audit_logs,
  public.user_company_roles
from anon, authenticated;
