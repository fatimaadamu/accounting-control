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

    insert into public.accounts (company_id, category_id, code, name, normal_balance)
    values
      (company_id, (select id from public.account_categories ac where ac.company_id = company_id and ac.name = 'Cash and Receivables'), '1010', 'Bank', 'debit'),
      (company_id, (select id from public.account_categories ac where ac.company_id = company_id and ac.name = 'Cash and Receivables'), '1110', 'AR Control', 'debit'),
      (company_id, (select id from public.account_categories ac where ac.company_id = company_id and ac.name = 'Cash and Receivables'), '1120', 'WHT Receivable', 'debit');

    insert into public.accounts (company_id, category_id, code, name, normal_balance)
    values
      (company_id, (select id from public.account_categories ac where ac.company_id = company_id and ac.name = 'Payables'), '2100', 'AP Control', 'credit'),
      (company_id, (select id from public.account_categories ac where ac.company_id = company_id and ac.name = 'Payables'), '2200', 'VAT Payable', 'credit'),
      (company_id, (select id from public.account_categories ac where ac.company_id = company_id and ac.name = 'Payables'), '2210', 'NHIL Payable', 'credit'),
      (company_id, (select id from public.account_categories ac where ac.company_id = company_id and ac.name = 'Payables'), '2220', 'GETFund Payable', 'credit'),
      (company_id, (select id from public.account_categories ac where ac.company_id = company_id and ac.name = 'Payables'), '2300', 'WHT Payable', 'credit');

    insert into public.customer_groups (company_id, name)
    values (company_id, 'General Customers');

    insert into public.supplier_groups (company_id, name)
    values (company_id, 'General Suppliers');

    insert into public.customers (company_id, customer_group_id, name, tax_exempt, wht_applicable)
    values (
      company_id,
      (select id from public.customer_groups cg where cg.company_id = company_id limit 1),
      'Default Customer',
      false,
      true
    );

    insert into public.suppliers (company_id, supplier_group_id, name, wht_applicable)
    values (
      company_id,
      (select id from public.supplier_groups sg where sg.company_id = company_id limit 1),
      'Default Supplier',
      true
    );

    insert into public.tax_rates (company_id, tax, rate, effective_from)
    values
      (company_id, 'VAT', 15.00, '2025-10-01'),
      (company_id, 'NHIL', 2.50, '2025-10-01'),
      (company_id, 'GETFund', 2.50, '2025-10-01'),
      (company_id, 'WHT', 5.00, '2025-10-01');

    insert into public.tax_accounts (
      company_id,
      vat_output_account_id,
      nhil_output_account_id,
      getfund_output_account_id,
      wht_receivable_account_id,
      wht_payable_account_id
    )
    values (
      company_id,
      (select id from public.accounts a where a.company_id = company_id and a.code = '2200'),
      (select id from public.accounts a where a.company_id = company_id and a.code = '2210'),
      (select id from public.accounts a where a.company_id = company_id and a.code = '2220'),
      (select id from public.accounts a where a.company_id = company_id and a.code = '1120'),
      (select id from public.accounts a where a.company_id = company_id and a.code = '2300')
    );

    insert into public.company_accounts (
      company_id,
      ar_control_account_id,
      ap_control_account_id
    )
    values (
      company_id,
      (select id from public.accounts a where a.company_id = company_id and a.code = '1110'),
      (select id from public.accounts a where a.company_id = company_id and a.code = '2100')
    );
  end loop;
end $$;
