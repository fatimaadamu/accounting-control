import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function seed() {
  console.log("Seeding database...");

  const { data: companies, error: companyError } = await supabase
    .from("companies")
    .insert([
      { name: "Northwind Trading", base_currency: "GHS", fy_start_month: 10 },
      { name: "Blue Horizon Foods", base_currency: "GHS", fy_start_month: 10 },
    ])
    .select();

  if (companyError) throw companyError;
  console.log("Companies created");

  const { data: accountTypes, error: atError } = await supabase
    .from("account_types")
    .insert([
      { name: "Assets" },
      { name: "Liabilities" },
      { name: "Equity" },
      { name: "Income" },
      { name: "COS" },
      { name: "Expenses" },
    ])
    .select();

  if (atError) throw atError;
  console.log("Account types created");

  for (const company of companies ?? []) {
    const assetType = accountTypes?.find((a) => a.name === "Assets")!;
    const liabilityType = accountTypes?.find((a) => a.name === "Liabilities")!;
    const equityType = accountTypes?.find((a) => a.name === "Equity")!;
    const incomeType = accountTypes?.find((a) => a.name === "Income")!;
    const cosType = accountTypes?.find((a) => a.name === "COS")!;
    const expenseType = accountTypes?.find((a) => a.name === "Expenses")!;

    const { data: headers } = await supabase
      .from("account_headers")
      .insert([
        { company_id: company.id, account_type_id: assetType.id, name: "Assets" },
        { company_id: company.id, account_type_id: liabilityType.id, name: "Liabilities" },
        { company_id: company.id, account_type_id: equityType.id, name: "Equity" },
        { company_id: company.id, account_type_id: incomeType.id, name: "Income" },
        { company_id: company.id, account_type_id: cosType.id, name: "Cost of Sales" },
        { company_id: company.id, account_type_id: expenseType.id, name: "Expenses" },
      ])
      .select();

    const assetsHeader = headers?.find((h) => h.name === "Assets")!;
    const liabilitiesHeader = headers?.find((h) => h.name === "Liabilities")!;
    const equityHeader = headers?.find((h) => h.name === "Equity")!;
    const incomeHeader = headers?.find((h) => h.name === "Income")!;
    const cosHeader = headers?.find((h) => h.name === "Cost of Sales")!;
    const expenseHeader = headers?.find((h) => h.name === "Expenses")!;

    const { data: groups } = await supabase
      .from("account_groups")
      .insert([
        { company_id: company.id, header_id: assetsHeader.id, name: "Current Assets" },
        { company_id: company.id, header_id: liabilitiesHeader.id, name: "Current Liabilities" },
        { company_id: company.id, header_id: equityHeader.id, name: "Owner Equity" },
        { company_id: company.id, header_id: incomeHeader.id, name: "Operating Income" },
        { company_id: company.id, header_id: cosHeader.id, name: "Direct Costs" },
        { company_id: company.id, header_id: expenseHeader.id, name: "Operating Expenses" },
      ])
      .select();

    const assetGroup = groups?.find((g) => g.name === "Current Assets")!;
    const liabilityGroup = groups?.find((g) => g.name === "Current Liabilities")!;
    const equityGroup = groups?.find((g) => g.name === "Owner Equity")!;
    const incomeGroup = groups?.find((g) => g.name === "Operating Income")!;
    const cosGroup = groups?.find((g) => g.name === "Direct Costs")!;
    const expenseGroup = groups?.find((g) => g.name === "Operating Expenses")!;

    const { data: categories } = await supabase
      .from("account_categories")
      .insert([
        { company_id: company.id, group_id: assetGroup.id, name: "Cash and Receivables" },
        { company_id: company.id, group_id: liabilityGroup.id, name: "Payables" },
        { company_id: company.id, group_id: equityGroup.id, name: "Capital" },
        { company_id: company.id, group_id: incomeGroup.id, name: "Sales" },
        { company_id: company.id, group_id: cosGroup.id, name: "Cost of Sales" },
        { company_id: company.id, group_id: expenseGroup.id, name: "Administrative" },
      ])
      .select();

    const assetsCategory = categories?.find((c) => c.name === "Cash and Receivables")!;
    const liabilityCategory = categories?.find((c) => c.name === "Payables")!;
    const equityCategory = categories?.find((c) => c.name === "Capital")!;
    const incomeCategory = categories?.find((c) => c.name === "Sales")!;
    const cosCategory = categories?.find((c) => c.name === "Cost of Sales")!;
    const expenseCategory = categories?.find((c) => c.name === "Administrative")!;

    await supabase.from("accounts").insert([
      { company_id: company.id, category_id: assetsCategory.id, code: "1000", name: "Cash", normal_balance: "debit" },
      { company_id: company.id, category_id: assetsCategory.id, code: "1010", name: "Bank", normal_balance: "debit" },
      { company_id: company.id, category_id: assetsCategory.id, code: "1100", name: "Accounts Receivable", normal_balance: "debit" },
      { company_id: company.id, category_id: assetsCategory.id, code: "1110", name: "AR Control", normal_balance: "debit" },
      { company_id: company.id, category_id: assetsCategory.id, code: "1120", name: "WHT Receivable", normal_balance: "debit" },
      { company_id: company.id, category_id: liabilityCategory.id, code: "2000", name: "Accounts Payable", normal_balance: "credit" },
      { company_id: company.id, category_id: liabilityCategory.id, code: "2100", name: "AP Control", normal_balance: "credit" },
      { company_id: company.id, category_id: liabilityCategory.id, code: "2200", name: "VAT Payable", normal_balance: "credit" },
      { company_id: company.id, category_id: liabilityCategory.id, code: "2210", name: "NHIL Payable", normal_balance: "credit" },
      { company_id: company.id, category_id: liabilityCategory.id, code: "2220", name: "GETFund Payable", normal_balance: "credit" },
      { company_id: company.id, category_id: liabilityCategory.id, code: "2300", name: "WHT Payable", normal_balance: "credit" },
      { company_id: company.id, category_id: equityCategory.id, code: "3000", name: "Capital", normal_balance: "credit" },
      { company_id: company.id, category_id: incomeCategory.id, code: "4000", name: "Sales Revenue", normal_balance: "credit" },
      { company_id: company.id, category_id: cosCategory.id, code: "5000", name: "Cost of Sales", normal_balance: "debit" },
      { company_id: company.id, category_id: expenseCategory.id, code: "6000", name: "Salaries Expense", normal_balance: "debit" },
    ]);

    const { data: fy } = await supabase
      .from("financial_years")
      .insert({
        company_id: company.id,
        start_date: "2025-10-01",
        end_date: "2026-09-30",
      })
      .select()
      .single();

    const periods = [] as Array<Record<string, string | number>>;
    let month = 10;
    let year = 2025;

    for (let i = 0; i < 12; i++) {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0);

      periods.push({
        company_id: company.id,
        financial_year_id: fy!.id,
        period_month: month,
        period_year: year,
        start_date: start.toISOString().slice(0, 10),
        end_date: end.toISOString().slice(0, 10),
      });

      month++;
      if (month === 13) {
        month = 1;
        year = 2026;
      }
    }

    await supabase.from("periods").insert(periods);

    const { data: customerGroup } = await supabase
      .from("customer_groups")
      .insert({ company_id: company.id, name: "General Customers" })
      .select()
      .single();

    const { data: supplierGroup } = await supabase
      .from("supplier_groups")
      .insert({ company_id: company.id, name: "General Suppliers" })
      .select()
      .single();

    await supabase.from("customers").insert({
      company_id: company.id,
      group_id: customerGroup?.id ?? null,
      name: "Default Customer",
      email: "customer@example.com",
      phone: "+233000000000",
    });

    await supabase.from("suppliers").insert({
      company_id: company.id,
      group_id: supplierGroup?.id ?? null,
      name: "Default Supplier",
      email: "supplier@example.com",
      phone: "+233000000001",
    });

    const { data: taxes } = await supabase
      .from("tax_rates")
      .insert([
        { company_id: company.id, name: "VAT", tax_type: "VAT", applies_to: "sales", rate: 15, is_withholding: false },
        { company_id: company.id, name: "NHIL", tax_type: "NHIL", applies_to: "sales", rate: 2.5, is_withholding: false },
        { company_id: company.id, name: "GETFund", tax_type: "GETFund", applies_to: "sales", rate: 2.5, is_withholding: false },
        { company_id: company.id, name: "WHT", tax_type: "WHT", applies_to: "withholding", rate: 5, is_withholding: true },
      ])
      .select();

    const { data: accounts } = await supabase
      .from("accounts")
      .select("id, code")
      .eq("company_id", company.id);

    const accountMap = new Map((accounts ?? []).map((acc) => [acc.code, acc.id]));

    await supabase.from("tax_accounts").insert(
      (taxes ?? []).map((tax) => ({
        company_id: company.id,
        tax_rate_id: tax.id,
        account_id:
          tax.name === "VAT"
            ? accountMap.get("2200")
            : tax.name === "NHIL"
            ? accountMap.get("2210")
            : tax.name === "GETFund"
            ? accountMap.get("2220")
            : accountMap.get("2300"),
      }))
    );

    await supabase.from("company_accounts").upsert({
      company_id: company.id,
      ar_control_account_id: accountMap.get("1110"),
      ap_control_account_id: accountMap.get("2100"),
      wht_receivable_account_id: accountMap.get("1120"),
      wht_payable_account_id: accountMap.get("2300"),
    });

    console.log(`Seeded ${company.name}`);
  }

  console.log("Seeding complete");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
