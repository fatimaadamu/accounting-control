-- 003_ctro_module.sql
-- CTRO (Cocoa Taken On Receipt) module tables

-- enums
do $$ begin
  create type ctro_status as enum ('draft','submitted','posted','voided');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type evacuation_treatment as enum ('company_paid','deducted');
exception when duplicate_object then null;
end $$;

-- Cocoa agents (Depot Keepers / PCs / DMs)
create table if not exists public.cocoa_agents (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  role_type text not null default 'Agent',
  district text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(company_id, name)
);

-- CTRO header
create table if not exists public.ctro_headers (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  period_id uuid not null references public.periods(id) on delete restrict,
  ctro_no text not null,                 -- CTRO-YYYY-0001
  season text,                           -- 2025/2026
  ctro_date date not null,
  region text,
  agent_id uuid references public.cocoa_agents(id) on delete set null,
  status ctro_status not null default 'draft',
  remarks text,
  created_by uuid not null,
  submitted_at timestamptz,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(company_id, ctro_no)
);

-- CTRO lines (matches CocoaBod form)
create table if not exists public.ctro_lines (
  id uuid primary key default uuid_generate_v4(),
  ctro_id uuid not null references public.ctro_headers(id) on delete cascade,

  district text,
  tod_time text,
  waybill_no text,
  ctro_ref_no text,
  cwc text,
  purity_cert_no text,
  line_date date,

  bags int,
  tonnage numeric(18,3),

  producer_price_value numeric(18,2) not null default 0,
  buyers_margin_value numeric(18,2) not null default 0,

  evacuation_cost numeric(18,2) not null default 0,
  evacuation_treatment evacuation_treatment not null default 'company_paid',

  line_total numeric(18,2) not null default 0
);

-- Cached totals for printing/reports
create table if not exists public.ctro_totals (
  ctro_id uuid primary key references public.ctro_headers(id) on delete cascade,
  total_bags int not null default 0,
  total_tonnage numeric(18,3) not null default 0,
  total_evacuation numeric(18,2) not null default 0,
  total_producer_price numeric(18,2) not null default 0,
  total_buyers_margin numeric(18,2) not null default 0,
  grand_total numeric(18,2) not null default 0,
  updated_at timestamptz not null default now()
);

-- Link CTRO to GL journal entry
create table if not exists public.ctro_journals (
  ctro_id uuid primary key references public.ctro_headers(id) on delete cascade,
  journal_id uuid not null references public.journal_entries(id) on delete restrict,
  created_at timestamptz not null default now()
);