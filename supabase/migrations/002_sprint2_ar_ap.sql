-- 002_sprint2_ar_ap.sql
-- Sprint 2: AR/AP, customers, suppliers, taxes, documents

do $$ begin
  create type doc_status as enum ('draft','submitted','approved','posted','voided');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type payment_method as enum ('bank','momo','cash','cheque');
exception when duplicate_object then null;
end $$;

-- =========================
-- Customers & Suppliers
-- =========================
create table if not exists public.customer_groups (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique(company_id, name)
);

create table if not exists public.supplier_groups (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique(company_id, name)
);

create table if not exists public.customers (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_group_id uuid references public.customer_groups(id) on delete set null,
  name text not null,
  tax_exempt boolean not null default false,
  wht_applicable boolean not null default true,
  created_at timestamptz not null default now(),
  unique(company_id, name)
);

create table if not exists public.suppliers (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_group_id uuid references public.supplier_groups(id) on delete set null,
  name text not null,
  wht_applicable boolean not null default true,
  created_at timestamptz not null default now(),
  unique(company_id, name)
);

-- =========================
-- Taxes
-- =========================
do $$ begin
  create type tax_type as enum ('VAT','NHIL','GETFund','WHT');
exception when duplicate_object then null;
end $$;

create table if not exists public.tax_rates (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tax tax_type not null,
  rate numeric(8,4) not null,
  effective_from date not null,
  created_at timestamptz not null default now(),
  unique(company_id, tax, effective_from)
);

create table if not exists public.tax_accounts (
  company_id uuid primary key references public.companies(id) on delete cascade,
  vat_output_account_id uuid references public.accounts(id),
  nhil_output_account_id uuid references public.accounts(id),
  getfund_output_account_id uuid references public.accounts(id),
  wht_receivable_account_id uuid references public.accounts(id),
  wht_payable_account_id uuid references public.accounts(id),
  created_at timestamptz not null default now()
);

-- =========================
-- AR: Invoices & Receipts
-- =========================
create table if not exists public.invoices (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  period_id uuid not null references public.periods(id) on delete restrict,
  invoice_no text not null,
  invoice_date date not null,
  due_date date,
  status doc_status not null default 'draft',
  narration text,
  total_net numeric(18,2) not null default 0,
  total_tax numeric(18,2) not null default 0,
  total_gross numeric(18,2) not null default 0,
  created_by uuid not null,
  approved_by uuid,
  approved_at timestamptz,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(company_id, invoice_no)
);

create table if not exists public.invoice_lines (
  id uuid primary key default uuid_generate_v4(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  income_account_id uuid not null references public.accounts(id) on delete restrict,
  description text,
  quantity numeric(18,4) not null default 1,
  unit_price numeric(18,4) not null default 0,
  net_amount numeric(18,2) not null default 0
);

create table if not exists public.receipts (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  period_id uuid not null references public.periods(id) on delete restrict,
  receipt_no text not null,
  receipt_date date not null,
  method payment_method not null,
  amount_received numeric(18,2) not null default 0,
  wht_deducted numeric(18,2) not null default 0,
  status doc_status not null default 'draft',
  created_by uuid not null,
  approved_by uuid,
  approved_at timestamptz,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(company_id, receipt_no)
);

create table if not exists public.receipt_allocations (
  id uuid primary key default uuid_generate_v4(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  amount_allocated numeric(18,2) not null default 0
);

-- =========================
-- AP: Bills & Vouchers
-- =========================
create table if not exists public.bills (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  period_id uuid not null references public.periods(id) on delete restrict,
  bill_no text not null,
  bill_date date not null,
  due_date date,
  status doc_status not null default 'draft',
  narration text,
  total_net numeric(18,2) not null default 0,
  total_tax numeric(18,2) not null default 0,
  total_gross numeric(18,2) not null default 0,
  created_by uuid not null,
  approved_by uuid,
  approved_at timestamptz,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(company_id, bill_no)
);

create table if not exists public.bill_lines (
  id uuid primary key default uuid_generate_v4(),
  bill_id uuid not null references public.bills(id) on delete cascade,
  expense_account_id uuid not null references public.accounts(id) on delete restrict,
  description text,
  net_amount numeric(18,2) not null default 0
);

create table if not exists public.payment_vouchers (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  period_id uuid not null references public.periods(id) on delete restrict,
  voucher_no text not null,
  payment_date date not null,
  method payment_method not null,
  amount_paid numeric(18,2) not null default 0,
  wht_deducted numeric(18,2) not null default 0,
  status doc_status not null default 'draft',
  created_by uuid not null,
  approved_by uuid,
  approved_at timestamptz,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(company_id, voucher_no)
);

create table if not exists public.payment_allocations (
  id uuid primary key default uuid_generate_v4(),
  voucher_id uuid not null references public.payment_vouchers(id) on delete cascade,
  bill_id uuid not null references public.bills(id) on delete restrict,
  amount_allocated numeric(18,2) not null default 0
);

-- =========================
-- Doc → Journal links
-- =========================
create table if not exists public.doc_journals (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  doc_type text not null,
  doc_id uuid not null,
  journal_id uuid not null references public.journal_entries(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(company_id, doc_type, doc_id)
);