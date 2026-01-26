import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function seed() {
  console.log("🌱 Seeding database...");

  // 1. Companies
  const { data: companies, error: companyError } = await supabase
    .from("companies")
    .insert([
      { name: "Cocoa Merchants Ghana Limited" },
      { name: "Tradeco International" },
    ])
    .select();

  if (companyError) throw companyError;
  console.log("✓ Companies created");

  // 2. Account Types
  const { data: accountTypes, error: atError } = await supabase
    .from("account_types")
    .insert([
      { name: "Assets" },
      { name: "Liabilities" },
      { name: "Equity" },
      { name: "Income" },
      { name: "Expenses" },
    ])
    .select();

  if (atError) throw atError;
  console.log("✓ Account types created");

  // 3. Minimal COA per company
  for (const company of companies!) {
    const assetType = accountTypes!.find(a => a.name === "Assets")!;
    const equityType = accountTypes!.find(a => a.name === "Equity")!;

    const { data: headers } = await supabase
      .from("account_headers")
      .insert([
        { company_id: company.id, account_type_id: assetType.id, name: "Assets" },
        { company_id: company.id, account_type_id: equityType.id, name: "Equity" },
      ])
      .select();

    const assetHeader = headers!.find(h => h.name === "Assets")!;
    const equityHeader = headers!.find(h => h.name === "Equity")!;

    const { data: groups } = await supabase
      .from("account_groups")
      .insert([
        { company_id: company.id, header_id: assetHeader.id, name: "Current Assets" },
        { company_id: company.id, header_id: equityHeader.id, name: "Capital" },
      ])
      .select();

    const caGroup = groups!.find(g => g.name === "Current Assets")!;
    const capGroup = groups!.find(g => g.name === "Capital")!;

    const { data: categories } = await supabase
      .from("account_categories")
      .insert([
        { company_id: company.id, group_id: caGroup.id, name: "Cash" },
        { company_id: company.id, group_id: capGroup.id, name: "Owner Capital" },
      ])
      .select();

    const cashCat = categories!.find(c => c.name === "Cash")!;
    const capCat = categories!.find(c => c.name === "Owner Capital")!;

    await supabase.from("accounts").insert([
      {
        company_id: company.id,
        category_id: cashCat.id,
        code: "1000",
        name: "Cash",
        normal_balance: "debit",
      },
      {
        company_id: company.id,
        category_id: capCat.id,
        code: "3000",
        name: "Capital",
        normal_balance: "credit",
      },
    ]);

    console.log(`✓ COA created for ${company.name}`);
  }

  // 4. Financial Year + Periods (Oct 2025 – Sep 2026)
  for (const company of companies!) {
    const { data: fy } = await supabase
      .from("financial_years")
      .insert({
        company_id: company.id,
        start_date: "2025-10-01",
        end_date: "2026-09-30",
      })
      .select()
      .single();

    const periods = [];
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
    console.log(`✓ FY + periods created for ${company.name}`);
  }

  console.log("🎉 Seeding complete");
}

seed().catch(err => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});