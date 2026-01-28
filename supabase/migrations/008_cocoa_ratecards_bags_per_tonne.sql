-- 008_cocoa_ratecards_bags_per_tonne.sql
-- Add bags_per_tonne to cocoa_rate_cards

alter table if exists public.cocoa_rate_cards
add column if not exists bags_per_tonne numeric(10,2) not null default 16;
