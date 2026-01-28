-- 004_ctro_accounts.sql
-- CTRO account mappings + evacuation payment choice

create table if not exists public.ctro_accounts (
  company_id uuid primary key references public.companies(id) on delete cascade,
  cocoa_stock_field_account_id uuid references public.accounts(id),
  cocoa_stock_evacuation_account_id uuid references public.accounts(id),
  cocoa_stock_margin_account_id uuid references public.accounts(id),
  advances_to_agents_account_id uuid references public.accounts(id),
  buyers_margin_income_account_id uuid references public.accounts(id),
  evacuation_payable_account_id uuid references public.accounts(id),
  created_at timestamptz not null default now()
);

alter table public.ctro_headers
  add column if not exists evacuation_payment_mode text not null default 'payable';

alter table public.ctro_headers
  add column if not exists evacuation_cash_account_id uuid references public.accounts(id);
