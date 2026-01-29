-- 009_ctro_lines_applied_rates.sql
-- Add missing applied per-tonne columns to ct ro_lines

alter table if exists public.ctro_lines
  add column if not exists applied_producer_price_per_tonne numeric(18,4) not null default 0,
  add column if not exists applied_buyer_margin_per_tonne numeric(18,4) not null default 0,
  add column if not exists applied_secondary_evac_cost_per_tonne numeric(18,4) not null default 0,
  add column if not exists applied_takeover_price_per_tonne numeric(18,4) not null default 0;
