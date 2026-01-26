-- Seed data for Sprint 1
-- Inserts companies, account types, minimal COA, and FY 2025/2026 periods.

insert into public.account_types (name)
values
  ('Assets'),
  ('Liabilities'),
  ('Equity'),
  ('Income'),
  ('COS'),
  ('Expenses')
on conflict (name) do nothing;

do $$
declare
  company_one uuid;
  company_two uuid;
  fy_id uuid;
  start_date date := date '2025-10-01';
  end_date date := date '2026-09-30';
  i int;
  period_start date;
  period_end date;
  assets_type uuid;
  liabilities_type uuid;
  equity_type uuid;
  income_type uuid;
  cos_type uuid;
  expenses_type uuid;
  header_id uuid;
  group_id uuid;
  category_id uuid;
  company_id uuid;
begin
  insert into public.companies (name, base_currency, fy_start_month)
  values ('Northwind Trading', 'GHS', 10)
  returning id into company_one;

  insert into public.companies (name, base_currency, fy_start_month)
  values ('Blue Horizon Foods', 'GHS', 10)
  returning id into company_two;

  select id into assets_type from public.account_types where name = 'Assets';
  select id into liabilities_type from public.account_types where name = 'Liabilities';
  select id into equity_type from public.account_types where name = 'Equity';
  select id into income_type from public.account_types where name = 'Income';
  select id into cos_type from public.account_types where name = 'COS';
  select id into expenses_type from public.account_types where name = 'Expenses';

  foreach company_id in array array[company_one, company_two]
  loop
    insert into public.financial_years (company_id, start_date, end_date)
    values (company_id, start_date, end_date)
    returning id into fy_id;

    for i in 0..11 loop
      period_start := (start_date + (interval '1 month' * i))::date;
      period_end := (period_start + interval '1 month - 1 day')::date;

      insert into public.periods (
        company_id,
        financial_year_id,
        period_month,
        period_year,
        start_date,
        end_date,
        status
      )
      values (
        company_id,
        fy_id,
        extract(month from period_start)::int,
        extract(year from period_start)::int,
        period_start,
        period_end,
        'open'
      );
    end loop;

    insert into public.account_headers (company_id, account_type_id, name)
    values (company_id, assets_type, 'Assets')
    returning id into header_id;

    insert into public.account_groups (company_id, header_id, name)
    values (company_id, header_id, 'Current Assets')
    returning id into group_id;

    insert into public.account_categories (company_id, group_id, name)
    values (company_id, group_id, 'Cash and Receivables')
    returning id into category_id;

    insert into public.accounts (company_id, category_id, code, name, normal_balance)
    values
      (company_id, category_id, '1000', 'Cash', 'debit'),
      (company_id, category_id, '1100', 'Accounts Receivable', 'debit');

    insert into public.account_headers (company_id, account_type_id, name)
    values (company_id, liabilities_type, 'Liabilities')
    returning id into header_id;

    insert into public.account_groups (company_id, header_id, name)
    values (company_id, header_id, 'Current Liabilities')
    returning id into group_id;

    insert into public.account_categories (company_id, group_id, name)
    values (company_id, group_id, 'Payables')
    returning id into category_id;

    insert into public.accounts (company_id, category_id, code, name, normal_balance)
    values (company_id, category_id, '2000', 'Accounts Payable', 'credit');

    insert into public.account_headers (company_id, account_type_id, name)
    values (company_id, equity_type, 'Equity')
    returning id into header_id;

    insert into public.account_groups (company_id, header_id, name)
    values (company_id, header_id, 'Owner Equity')
    returning id into group_id;

    insert into public.account_categories (company_id, group_id, name)
    values (company_id, group_id, 'Capital')
    returning id into category_id;

    insert into public.accounts (company_id, category_id, code, name, normal_balance)
    values (company_id, category_id, '3000', 'Capital', 'credit');

    insert into public.account_headers (company_id, account_type_id, name)
    values (company_id, income_type, 'Income')
    returning id into header_id;

    insert into public.account_groups (company_id, header_id, name)
    values (company_id, header_id, 'Operating Income')
    returning id into group_id;

    insert into public.account_categories (company_id, group_id, name)
    values (company_id, group_id, 'Sales')
    returning id into category_id;

    insert into public.accounts (company_id, category_id, code, name, normal_balance)
    values (company_id, category_id, '4000', 'Sales Revenue', 'credit');

    insert into public.account_headers (company_id, account_type_id, name)
    values (company_id, cos_type, 'Cost of Sales')
    returning id into header_id;

    insert into public.account_groups (company_id, header_id, name)
    values (company_id, header_id, 'Direct Costs')
    returning id into group_id;

    insert into public.account_categories (company_id, group_id, name)
    values (company_id, group_id, 'Cost of Sales')
    returning id into category_id;

    insert into public.accounts (company_id, category_id, code, name, normal_balance)
    values (company_id, category_id, '5000', 'Cost of Sales', 'debit');

    insert into public.account_headers (company_id, account_type_id, name)
    values (company_id, expenses_type, 'Expenses')
    returning id into header_id;

    insert into public.account_groups (company_id, header_id, name)
    values (company_id, header_id, 'Operating Expenses')
    returning id into group_id;

    insert into public.account_categories (company_id, group_id, name)
    values (company_id, group_id, 'Administrative')
    returning id into category_id;

    insert into public.accounts (company_id, category_id, code, name, normal_balance)
    values (company_id, category_id, '6000', 'Salaries Expense', 'debit');
  end loop;
end $$;