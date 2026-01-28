-- 004_ctro_pricing.sql
-- Cocoa geography + effective-dated CTRO rate cards (explicit per-tonne rates)

-- Geography
create table if not exists public.cocoa_regions (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique
);

create table if not exists public.cocoa_districts (
  id uuid primary key default uuid_generate_v4(),
  region_id uuid not null references public.cocoa_regions(id) on delete cascade,
  name text not null,
  unique(region_id, name)
);

create table if not exists public.cocoa_depots (
  id uuid primary key default uuid_generate_v4(),
  district_id uuid not null references public.cocoa_districts(id) on delete cascade,
  name text not null,
  unique(district_id, name)
);

create table if not exists public.takeover_centers (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique
);

-- Effective-dated rate cards (explicit)
create table if not exists public.cocoa_rate_cards (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  season text not null,
  effective_from date not null,
  effective_to date,
  bag_weight_kg numeric(10,2) not null default 64,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.cocoa_rate_card_lines (
  id uuid primary key default uuid_generate_v4(),
  rate_card_id uuid not null references public.cocoa_rate_cards(id) on delete cascade,

  region_id uuid not null references public.cocoa_regions(id),
  district_id uuid not null references public.cocoa_districts(id),
  depot_id uuid references public.cocoa_depots(id),
  takeover_center_id uuid not null references public.takeover_centers(id),

  producer_price_per_tonne numeric(18,2) not null,
  buyer_margin_per_tonne numeric(18,2) not null,
  secondary_evac_cost_per_tonne numeric(18,2) not null,

  created_at timestamptz not null default now()
);

-- Extend CTRO lines to store selected geo + applied rates (frozen at time of posting)
alter table public.ctro_lines
add column if not exists region_id uuid references public.cocoa_regions(id),
add column if not exists district_id uuid references public.cocoa_districts(id),
add column if not exists depot_id uuid references public.cocoa_depots(id),
add column if not exists takeover_center_id uuid references public.takeover_centers(id),

add column if not exists bag_weight_kg numeric(10,2) not null default 64,

add column if not exists applied_producer_price_per_tonne numeric(18,2) not null default 0,
add column if not exists applied_buyer_margin_per_tonne numeric(18,2) not null default 0,
add column if not exists applied_secondary_evac_cost_per_tonne numeric(18,2) not null default 0,
add column if not exists applied_takeover_price_per_tonne numeric(18,2) not null default 0;