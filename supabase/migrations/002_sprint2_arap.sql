-- 002_sprint2_arap.sql
-- Sprint 2: AR/AP + taxes

do $$ begin
  create type doc_status as enum ('draft','approved','posted','void');
exception when duplicate_object then null;
end $$;

create table if not exists public.customer_groups (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique(company_id, name)
);

create table if not exists public.customers (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  group_id uuid references public.customer_groups(id) on delete set null,
  name text not null,
  email text,
  phone text,
  address text,
  tax_exempt boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.supplier_groups (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique(company_id, name)
);

create table if not exists public.suppliers (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  group_id uuid references public.supplier_groups(id) on delete set null,
  name text not null,
  email text,
  phone text,
  address text,
  created_at timestamptz not null default now()
);

create table if not exists public.tax_rates (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  tax_type text not null,
  applies_to text not null default 'sales',
  rate numeric(6,2) not null default 0,
  is_withholding boolean not null default false,
  created_at timestamptz not null default now(),
  unique(company_id, name)
);

create table if not exists public.tax_accounts (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tax_rate_id uuid not null references public.tax_rates(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(company_id, tax_rate_id)
);

create table if not exists public.company_accounts (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ar_control_account_id uuid references public.accounts(id) on delete restrict,
  ap_control_account_id uuid references public.accounts(id) on delete restrict,
  wht_receivable_account_id uuid references public.accounts(id) on delete restrict,
  wht_payable_account_id uuid references public.accounts(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(company_id)
);

create table if not exists public.ar_invoices (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  period_id uuid not null references public.periods(id) on delete restrict,
  invoice_date date not null,
  due_date date not null,
  narration text,
  status doc_status not null default 'draft',
  total_net numeric(18,2) not null default 0,
  total_tax numeric(18,2) not null default 0,
  total_gross numeric(18,2) not null default 0,
  tax_exempt boolean not null default false,
  vat_rate_id uuid references public.tax_rates(id) on delete set null,
  nhil_rate_id uuid references public.tax_rates(id) on delete set null,
  getfund_rate_id uuid references public.tax_rates(id) on delete set null,
  created_by uuid not null,
  approved_by uuid,
  approved_at timestamptz,
  posted_by uuid,
  posted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ar_invoice_lines (
  id uuid primary key default uuid_generate_v4(),
  invoice_id uuid not null references public.ar_invoices(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  description text,
  quantity numeric(18,2) not null default 1,
  unit_price numeric(18,2) not null default 0,
  line_total numeric(18,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.ar_receipts (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  period_id uuid not null references public.periods(id) on delete restrict,
  receipt_date date not null,
  cash_account_id uuid not null references public.accounts(id) on delete restrict,
  narration text,
  status doc_status not null default 'draft',
  total_received numeric(18,2) not null default 0,
  wht_deducted numeric(18,2) not null default 0,
  created_by uuid not null,
  approved_by uuid,
  approved_at timestamptz,
  posted_by uuid,
  posted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ar_receipt_allocations (
  id uuid primary key default uuid_generate_v4(),
  receipt_id uuid not null references public.ar_receipts(id) on delete cascade,
  invoice_id uuid not null references public.ar_invoices(id) on delete restrict,
  amount numeric(18,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.ap_bills (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  period_id uuid not null references public.periods(id) on delete restrict,
  bill_date date not null,
  due_date date not null,
  narration text,
  status doc_status not null default 'draft',
  total_net numeric(18,2) not null default 0,
  total_gross numeric(18,2) not null default 0,
  created_by uuid not null,
  approved_by uuid,
  approved_at timestamptz,
  posted_by uuid,
  posted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ap_bill_lines (
  id uuid primary key default uuid_generate_v4(),
  bill_id uuid not null references public.ap_bills(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  description text,
  quantity numeric(18,2) not null default 1,
  unit_price numeric(18,2) not null default 0,
  line_total numeric(18,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.ap_payment_vouchers (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  period_id uuid not null references public.periods(id) on delete restrict,
  payment_date date not null,
  cash_account_id uuid not null references public.accounts(id) on delete restrict,
  narration text,
  status doc_status not null default 'draft',
  total_paid numeric(18,2) not null default 0,
  wht_deducted numeric(18,2) not null default 0,
  created_by uuid not null,
  approved_by uuid,
  approved_at timestamptz,
  posted_by uuid,
  posted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ap_payment_allocations (
  id uuid primary key default uuid_generate_v4(),
  payment_voucher_id uuid not null references public.ap_payment_vouchers(id) on delete cascade,
  bill_id uuid not null references public.ap_bills(id) on delete restrict,
  amount numeric(18,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.doc_journals (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  doc_type text not null,
  doc_id uuid not null,
  journal_id uuid not null references public.journal_entries(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(company_id, doc_type, doc_id)
);

create index if not exists idx_customers_company on public.customers(company_id);
create index if not exists idx_suppliers_company on public.suppliers(company_id);
create index if not exists idx_ar_invoices_company on public.ar_invoices(company_id);
create index if not exists idx_ar_receipts_company on public.ar_receipts(company_id);
create index if not exists idx_ap_bills_company on public.ap_bills(company_id);
create index if not exists idx_ap_payments_company on public.ap_payment_vouchers(company_id);

alter table public.customer_groups enable row level security;
alter table public.customers enable row level security;
alter table public.supplier_groups enable row level security;
alter table public.suppliers enable row level security;
alter table public.tax_rates enable row level security;
alter table public.tax_accounts enable row level security;
alter table public.company_accounts enable row level security;
alter table public.ar_invoices enable row level security;
alter table public.ar_invoice_lines enable row level security;
alter table public.ar_receipts enable row level security;
alter table public.ar_receipt_allocations enable row level security;
alter table public.ap_bills enable row level security;
alter table public.ap_bill_lines enable row level security;
alter table public.ap_payment_vouchers enable row level security;
alter table public.ap_payment_allocations enable row level security;
alter table public.doc_journals enable row level security;

create policy "customer_groups_select_by_membership"
on public.customer_groups for select
using (
  exists (
    select 1 from public.user_company_roles ucr
    where ucr.company_id = customer_groups.company_id
      and ucr.user_id = auth.uid()
  )
);

create policy "customers_select_by_membership"
on public.customers for select
using (
  exists (
    select 1 from public.user_company_roles ucr
    where ucr.company_id = customers.company_id
      and ucr.user_id = auth.uid()
  )
);

create policy "supplier_groups_select_by_membership"
on public.supplier_groups for select
using (
  exists (
    select 1 from public.user_company_roles ucr
    where ucr.company_id = supplier_groups.company_id
      and ucr.user_id = auth.uid()
  )
);

create policy "suppliers_select_by_membership"
on public.suppliers for select
using (
  exists (
    select 1 from public.user_company_roles ucr
    where ucr.company_id = suppliers.company_id
      and ucr.user_id = auth.uid()
  )
);

create policy "tax_rates_select_by_membership"
on public.tax_rates for select
using (
  exists (
    select 1 from public.user_company_roles ucr
    where ucr.company_id = tax_rates.company_id
      and ucr.user_id = auth.uid()
  )
);

create policy "tax_accounts_select_by_membership"
on public.tax_accounts for select
using (
  exists (
    select 1 from public.user_company_roles ucr
    where ucr.company_id = tax_accounts.company_id
      and ucr.user_id = auth.uid()
  )
);

create policy "company_accounts_select_by_membership"
on public.company_accounts for select
using (
  exists (
    select 1 from public.user_company_roles ucr
    where ucr.company_id = company_accounts.company_id
      and ucr.user_id = auth.uid()
  )
);

create policy "ar_invoices_select_by_membership"
on public.ar_invoices for select
using (
  exists (
    select 1 from public.user_company_roles ucr
    where ucr.company_id = ar_invoices.company_id
      and ucr.user_id = auth.uid()
  )
);

create policy "ar_invoice_lines_select_by_membership"
on public.ar_invoice_lines for select
using (
  exists (
    select 1
    from public.ar_invoices inv
    join public.user_company_roles ucr
      on ucr.company_id = inv.company_id
     and ucr.user_id = auth.uid()
    where inv.id = ar_invoice_lines.invoice_id
  )
);

create policy "ar_receipts_select_by_membership"
on public.ar_receipts for select
using (
  exists (
    select 1 from public.user_company_roles ucr
    where ucr.company_id = ar_receipts.company_id
      and ucr.user_id = auth.uid()
  )
);

create policy "ar_receipt_allocations_select_by_membership"
on public.ar_receipt_allocations for select
using (
  exists (
    select 1
    from public.ar_receipts r
    join public.user_company_roles ucr
      on ucr.company_id = r.company_id
     and ucr.user_id = auth.uid()
    where r.id = ar_receipt_allocations.receipt_id
  )
);

create policy "ap_bills_select_by_membership"
on public.ap_bills for select
using (
  exists (
    select 1 from public.user_company_roles ucr
    where ucr.company_id = ap_bills.company_id
      and ucr.user_id = auth.uid()
  )
);

create policy "ap_bill_lines_select_by_membership"
on public.ap_bill_lines for select
using (
  exists (
    select 1
    from public.ap_bills b
    join public.user_company_roles ucr
      on ucr.company_id = b.company_id
     and ucr.user_id = auth.uid()
    where b.id = ap_bill_lines.bill_id
  )
);

create policy "ap_payment_vouchers_select_by_membership"
on public.ap_payment_vouchers for select
using (
  exists (
    select 1 from public.user_company_roles ucr
    where ucr.company_id = ap_payment_vouchers.company_id
      and ucr.user_id = auth.uid()
  )
);

create policy "ap_payment_allocations_select_by_membership"
on public.ap_payment_allocations for select
using (
  exists (
    select 1
    from public.ap_payment_vouchers pv
    join public.user_company_roles ucr
      on ucr.company_id = pv.company_id
     and ucr.user_id = auth.uid()
    where pv.id = ap_payment_allocations.payment_voucher_id
  )
);

create policy "doc_journals_select_by_membership"
on public.doc_journals for select
using (
  exists (
    select 1 from public.user_company_roles ucr
    where ucr.company_id = doc_journals.company_id
      and ucr.user_id = auth.uid()
  )
);

revoke insert, update, delete on
  public.customer_groups,
  public.customers,
  public.supplier_groups,
  public.suppliers,
  public.tax_rates,
  public.tax_accounts,
  public.company_accounts,
  public.ar_invoices,
  public.ar_invoice_lines,
  public.ar_receipts,
  public.ar_receipt_allocations,
  public.ap_bills,
  public.ap_bill_lines,
  public.ap_payment_vouchers,
  public.ap_payment_allocations,
  public.doc_journals
from anon, authenticated;