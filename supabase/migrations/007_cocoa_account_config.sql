-- 007_cocoa_account_config.sql
-- Cocoa account configuration for CTRO posting

create table if not exists public.cocoa_account_config (
  company_id uuid primary key references public.companies(id) on delete cascade,
  stock_field_account_id uuid references public.accounts(id),
  stock_evac_account_id uuid references public.accounts(id),
  stock_margin_account_id uuid references public.accounts(id),
  advances_account_id uuid references public.accounts(id),
  buyer_margin_income_account_id uuid references public.accounts(id),
  evacuation_payable_account_id uuid references public.accounts(id),
  created_at timestamptz not null default now()
);
