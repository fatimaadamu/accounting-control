-- 006_cocoa_ratecards_create.sql
-- Create cocoa geography and rate card tables (safe if missing)

create table if not exists public.cocoa_regions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table if not exists public.cocoa_districts (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.cocoa_regions(id) on delete cascade,
  name text not null,
  unique(region_id, name)
);

create table if not exists public.cocoa_depots (
  id uuid primary key default gen_random_uuid(),
  district_id uuid not null references public.cocoa_districts(id) on delete cascade,
  name text not null,
  unique(district_id, name)
);

create table if not exists public.takeover_centers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table if not exists public.cocoa_rate_cards (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  season text not null,
  effective_from date not null,
  effective_to date,
  bag_weight_kg numeric(10,2) not null default 64,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.cocoa_rate_card_lines (
  id uuid primary key default gen_random_uuid(),
  rate_card_id uuid not null references public.cocoa_rate_cards(id) on delete cascade,

  region_id uuid not null references public.cocoa_regions(id),
  district_id uuid not null references public.cocoa_districts(id),
  depot_id uuid references public.cocoa_depots(id),
  takeover_center_id uuid not null references public.takeover_centers(id),

  producer_price_per_tonne numeric(18,2) not null,
  buyer_margin_per_tonne numeric(18,2) not null,
  secondary_evac_cost_per_tonne numeric(18,2) not null,
  takeover_price_per_tonne numeric(18,2) not null,

  created_at timestamptz not null default now()
);