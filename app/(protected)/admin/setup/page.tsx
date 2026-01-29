import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import ToastMessage from "@/components/toast-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { upsertCocoaAccountConfig } from "@/lib/actions/ctro-admin";
import { ensureActiveCompanyId, requireCompanyRole, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isSchemaCacheError, schemaCacheBannerMessage } from "@/lib/supabase/schema-cache";

type AccountSeed = {
  code: string;
  name: string;
  type: "Assets" | "Liabilities" | "Income" | "Expenses";
  is_control?: boolean;
};

const COA_SEED: AccountSeed[] = [
  { code: "1001", name: "Bank - Main", type: "Assets" },
  { code: "1002", name: "Cash on Hand", type: "Assets" },
  { code: "1100", name: "Accounts Receivable (Control)", type: "Assets", is_control: true },
  { code: "2200", name: "Withholding Tax Receivable", type: "Assets", is_control: true },
  { code: "2000", name: "Accounts Payable (Control)", type: "Liabilities", is_control: true },
  { code: "2100", name: "Withholding Tax Payable", type: "Liabilities", is_control: true },
  { code: "4000", name: "Sales Income", type: "Income" },
  { code: "6000", name: "General Expenses", type: "Expenses" },
];

const getOrCreateAccountType = async (name: string) => {
  const { data: existing } = await supabaseAdmin()
    .from("account_types")
    .select("id, name")
    .eq("name", name)
    .maybeSingle();

  if (existing?.id) {
    return existing.id as string;
  }

  const { data, error } = await supabaseAdmin()
    .from("account_types")
    .insert({ name })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data.id as string;
};

const getOrCreateHeader = async (companyId: string, typeId: string, name: string) => {
  const { data: existing } = await supabaseAdmin()
    .from("account_headers")
    .select("id")
    .eq("company_id", companyId)
    .eq("account_type_id", typeId)
    .eq("name", name)
    .maybeSingle();

  if (existing?.id) {
    return existing.id as string;
  }

  const { data, error } = await supabaseAdmin()
    .from("account_headers")
    .insert({ company_id: companyId, account_type_id: typeId, name })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data.id as string;
};

const getOrCreateGroup = async (companyId: string, headerId: string, name: string) => {
  const { data: existing } = await supabaseAdmin()
    .from("account_groups")
    .select("id")
    .eq("company_id", companyId)
    .eq("header_id", headerId)
    .eq("name", name)
    .maybeSingle();

  if (existing?.id) {
    return existing.id as string;
  }

  const { data, error } = await supabaseAdmin()
    .from("account_groups")
    .insert({ company_id: companyId, header_id: headerId, name })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data.id as string;
};

const getOrCreateCategory = async (companyId: string, groupId: string, name: string) => {
  const { data: existing } = await supabaseAdmin()
    .from("account_categories")
    .select("id")
    .eq("company_id", companyId)
    .eq("group_id", groupId)
    .eq("name", name)
    .maybeSingle();

  if (existing?.id) {
    return existing.id as string;
  }

  const { data, error } = await supabaseAdmin()
    .from("account_categories")
    .insert({ company_id: companyId, group_id: groupId, name })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data.id as string;
};

const ensureFinancialYear = async (companyId: string) => {
  const startDate = "2025-10-01";
  const endDate = "2026-09-30";

  const { data: existing } = await supabaseAdmin()
    .from("financial_years")
    .select("id")
    .eq("company_id", companyId)
    .eq("start_date", startDate)
    .eq("end_date", endDate)
    .maybeSingle();

  if (existing?.id) {
    return existing.id as string;
  }

  const { data, error } = await supabaseAdmin()
    .from("financial_years")
    .insert({ company_id: companyId, start_date: startDate, end_date: endDate })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data.id as string;
};

const buildPeriods = () => {
  const periods: Array<{
    period_month: number;
    period_year: number;
    start_date: string;
    end_date: string;
  }> = [];

  const start = new Date(2025, 9, 1); // Oct 2025
  for (let i = 0; i < 12; i += 1) {
    const date = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const startDate = new Date(date.getFullYear(), date.getMonth(), 1);
    const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    periods.push({
      period_month: startDate.getMonth() + 1,
      period_year: startDate.getFullYear(),
      start_date: startDate.toISOString().slice(0, 10),
      end_date: endDate.toISOString().slice(0, 10),
    });
  }

  return periods;
};

export default async function AdminSetupPage({
  searchParams,
}: {
  searchParams?: Promise<{ toast?: string; message?: string; created?: string; existed?: string; errors?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const user = await requireUser();
  const companyId = await ensureActiveCompanyId(user.id, "/admin/setup");

  if (!companyId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Setup</CardTitle>
          <CardDescription>No company access yet. Please contact Admin.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  await requireCompanyRole(user.id, companyId, ["Admin"]);
  const activeCompanyId = companyId as string;
  const renderSchemaBanner = () => (
    <Card>
      <CardHeader>
        <CardTitle>Setup</CardTitle>
        <CardDescription>{schemaCacheBannerMessage}</CardDescription>
      </CardHeader>
    </Card>
  );

  const decodeList = (value?: string) =>
    value ? value.split("|").map((item) => decodeURIComponent(item)).filter(Boolean) : [];

  const createdItems = decodeList(resolvedSearchParams?.created);
  const existedItems = decodeList(resolvedSearchParams?.existed);
  const errorItems = decodeList(resolvedSearchParams?.errors);

  const { data: accounts, error: accountsError } = await supabaseAdmin()
    .from("accounts")
    .select("id, code, name")
    .eq("company_id", activeCompanyId)
    .order("code");

  if (accountsError) {
    if (isSchemaCacheError(accountsError)) {
      return renderSchemaBanner();
    }
    throw new Error(accountsError.message);
  }

  let cocoaAccountsAvailable = true;
  let cocoaAccountConfig:
    | {
        stock_field_account_id: string | null;
        stock_evac_account_id: string | null;
        stock_margin_account_id: string | null;
        advances_account_id: string | null;
        buyer_margin_income_account_id: string | null;
        evacuation_payable_account_id: string | null;
      }
    | null = null;
  const { data: cocoaConfigData, error: cocoaConfigError } = await supabaseAdmin()
    .from("cocoa_account_config")
    .select(
      "stock_field_account_id, stock_evac_account_id, stock_margin_account_id, advances_account_id, buyer_margin_income_account_id, evacuation_payable_account_id"
    )
    .eq("company_id", activeCompanyId)
    .maybeSingle();

  if (cocoaConfigError) {
    if (
      isSchemaCacheError(cocoaConfigError) ||
      cocoaConfigError.message.includes("Could not find the table")
    ) {
      return renderSchemaBanner();
    }
    throw new Error(cocoaConfigError.message);
  } else {
    cocoaAccountConfig = cocoaConfigData ?? null;
  }

  async function createFiscalYearAction() {
    "use server";
    const created: string[] = [];
    const existed: string[] = [];
    try {
      const { data: existingFy } = await supabaseAdmin()
        .from("financial_years")
        .select("id")
        .eq("company_id", activeCompanyId)
        .eq("start_date", "2025-10-01")
        .eq("end_date", "2026-09-30")
        .maybeSingle();

      let fyId = existingFy?.id as string | undefined;
      if (!fyId) {
        fyId = await ensureFinancialYear(activeCompanyId);
        created.push("Financial Year 2025-10-01 to 2026-09-30");
      } else {
        existed.push("Financial Year 2025-10-01 to 2026-09-30");
      }
      const periods = buildPeriods().map((period) => ({
        ...period,
        company_id: activeCompanyId,
        financial_year_id: fyId,
      }));

      const { data: existingPeriods } = await supabaseAdmin()
        .from("periods")
        .select("id")
        .eq("company_id", activeCompanyId)
        .eq("financial_year_id", fyId);

      const { error } = await supabaseAdmin()
        .from("periods")
        .upsert(periods, {
          onConflict: "company_id,financial_year_id,period_month,period_year",
        });

      if (error) {
        throw new Error(error.message);
      }

      const existingCount = existingPeriods?.length ?? 0;
      if (existingCount > 0) {
        existed.push("Periods (Oct 2025 - Sep 2026)");
      } else {
        created.push("Periods (Oct 2025 - Sep 2026)");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create periods.";
      redirect(
        `/admin/setup?toast=error&message=${encodeURIComponent(message)}&created=${created
          .map(encodeURIComponent)
          .join("|")}&existed=${existed.map(encodeURIComponent).join("|")}&errors=${encodeURIComponent(message)}`
      );
    }

    revalidatePath("/admin/setup");
    redirect(
      `/admin/setup?toast=success&message=Financial%20year%20updated.&created=${created
        .map(encodeURIComponent)
        .join("|")}&existed=${existed.map(encodeURIComponent).join("|")}`
    );
  }

  async function seedCoaAction() {
    "use server";
    const created: string[] = [];
    const existed: string[] = [];
    try {
      const typeIds = new Map<string, string>();
      for (const typeName of ["Assets", "Liabilities", "Income", "Expenses"]) {
        typeIds.set(typeName, await getOrCreateAccountType(typeName));
      }

      const categoryIds = new Map<string, string>();
      for (const typeName of typeIds.keys()) {
        const typeId = typeIds.get(typeName)!;
        const headerId = await getOrCreateHeader(activeCompanyId, typeId, typeName);
        const groupId = await getOrCreateGroup(activeCompanyId, headerId, "General");
        const categoryId = await getOrCreateCategory(activeCompanyId, groupId, "General");
        categoryIds.set(typeName, categoryId);
      }

      const accountRows = COA_SEED.map((account) => ({
        company_id: activeCompanyId,
        category_id: categoryIds.get(account.type)!,
        code: account.code,
        name: account.name,
        normal_balance:
          account.type === "Assets" || account.type === "Expenses" ? "debit" : "credit",
        is_control: account.is_control ?? false,
        is_active: true,
      }));

      const { data: existingAccounts } = await supabaseAdmin()
        .from("accounts")
        .select("code")
        .eq("company_id", activeCompanyId)
        .in(
          "code",
          COA_SEED.map((account) => account.code)
        );

      const existingCodes = new Set((existingAccounts ?? []).map((row) => row.code));

      const { data: accounts, error } = await supabaseAdmin()
        .from("accounts")
        .upsert(accountRows, { onConflict: "company_id,code" })
        .select("id, code");

      if (error) {
        throw new Error(error.message);
      }

      const accountMap = new Map<string, string>();
      for (const row of accounts ?? []) {
        accountMap.set(row.code, row.id);
      }

      try {
        const arControl = accountMap.get("1100") ?? null;
        const apControl = accountMap.get("2000") ?? null;
        if (arControl || apControl) {
          await supabaseAdmin().from("company_accounts").upsert({
            company_id: activeCompanyId,
            ar_control_account_id: arControl,
            ap_control_account_id: apControl,
          });
        }
      } catch {
        // Ignore if company_accounts does not exist yet.
      }

      for (const account of COA_SEED) {
        if (existingCodes.has(account.code)) {
          existed.push(`${account.code} ${account.name}`);
        } else {
          created.push(`${account.code} ${account.name}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to seed COA.";
      redirect(
        `/admin/setup?toast=error&message=${encodeURIComponent(message)}&created=${created
          .map(encodeURIComponent)
          .join("|")}&existed=${existed.map(encodeURIComponent).join("|")}&errors=${encodeURIComponent(message)}`
      );
    }

    revalidatePath("/admin/setup");
    redirect(
      `/admin/setup?toast=success&message=Chart%20of%20accounts%20seeded.&created=${created
        .map(encodeURIComponent)
        .join("|")}&existed=${existed.map(encodeURIComponent).join("|")}`
    );
  }

  async function cocoaAccountsAction(formData: FormData) {
    "use server";
    const cocoaField = String(formData.get("stock_field_account_id") ?? "");
    const cocoaEvac = String(formData.get("stock_evac_account_id") ?? "");
    const cocoaMargin = String(formData.get("stock_margin_account_id") ?? "");
    const advances = String(formData.get("advances_account_id") ?? "");
    const marginIncome = String(formData.get("buyer_margin_income_account_id") ?? "");
    const evacPayable = String(formData.get("evacuation_payable_account_id") ?? "");

    await upsertCocoaAccountConfig({
      company_id: activeCompanyId,
      stock_field_account_id: cocoaField || null,
      stock_evac_account_id: cocoaEvac || null,
      stock_margin_account_id: cocoaMargin || null,
      advances_account_id: advances || null,
      buyer_margin_income_account_id: marginIncome || null,
      evacuation_payable_account_id: evacPayable || null,
    });

    revalidatePath("/admin/setup");
  }

  return (
    <div className="space-y-6">
      {resolvedSearchParams?.toast && (
        <ToastMessage
          kind={resolvedSearchParams.toast === "error" ? "error" : "success"}
          message={resolvedSearchParams.message ?? "Action completed"}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Admin setup</CardTitle>
          <CardDescription>Run these once per company. Safe to rerun.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form action={createFiscalYearAction} className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-zinc-900">
                Create FY 2025-10 to 2026-09 + 12 periods
              </p>
              <p className="text-sm text-zinc-500">
                Creates the FY and monthly periods if missing.
              </p>
            </div>
            <Button type="submit">Create periods</Button>
          </form>
          <form action={seedCoaAction} className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-zinc-900">Seed minimum COA pack</p>
              <p className="text-sm text-zinc-500">
                Cash, Bank, AR/AP Control, WHT, Sales Income, General Expense.
              </p>
            </div>
            <Button type="submit" variant="outline">
              Seed COA
            </Button>
          </form>
        </CardContent>
      </Card>

      {cocoaAccountsAvailable ? (
        <Card>
          <CardHeader>
            <CardTitle>Cocoa Accounts</CardTitle>
            <CardDescription>Configure cocoa accounts for CTRO posting.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={cocoaAccountsAction} className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="stock_field_account_id">Cocoa Stock - Field</Label>
                <Select
                  id="stock_field_account_id"
                  name="stock_field_account_id"
                  defaultValue={cocoaAccountConfig?.stock_field_account_id ?? ""}
                >
                  <option value="">Select account</option>
                  {(accounts ?? []).map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="stock_evac_account_id">Cocoa Stock - Evacuation</Label>
                <Select
                  id="stock_evac_account_id"
                  name="stock_evac_account_id"
                  defaultValue={cocoaAccountConfig?.stock_evac_account_id ?? ""}
                >
                  <option value="">Select account</option>
                  {(accounts ?? []).map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="stock_margin_account_id">Cocoa Stock - Margin</Label>
                <Select
                  id="stock_margin_account_id"
                  name="stock_margin_account_id"
                  defaultValue={cocoaAccountConfig?.stock_margin_account_id ?? ""}
                >
                  <option value="">Select account</option>
                  {(accounts ?? []).map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="advances_account_id">Advances to Agents</Label>
                <Select
                  id="advances_account_id"
                  name="advances_account_id"
                  defaultValue={cocoaAccountConfig?.advances_account_id ?? ""}
                >
                  <option value="">Select account</option>
                  {(accounts ?? []).map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="buyer_margin_income_account_id">Buyer/LBC Margin Income</Label>
                <Select
                  id="buyer_margin_income_account_id"
                  name="buyer_margin_income_account_id"
                  defaultValue={cocoaAccountConfig?.buyer_margin_income_account_id ?? ""}
                >
                  <option value="">Select account</option>
                  {(accounts ?? []).map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="evacuation_payable_account_id">Evacuation Payable</Label>
                <Select
                  id="evacuation_payable_account_id"
                  name="evacuation_payable_account_id"
                  defaultValue={cocoaAccountConfig?.evacuation_payable_account_id ?? ""}
                >
                  <option value="">Select account</option>
                  {(accounts ?? []).map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="md:col-span-2">
                <Button type="submit" variant="outline">
                  Save cocoa accounts
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Cocoa Accounts</CardTitle>
            <CardDescription>
              Cocoa accounts table not available yet. Apply migration 007_cocoa_account_config.sql.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Results</CardTitle>
          <CardDescription>Latest setup action outcome.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-zinc-700">
          {createdItems.length === 0 && existedItems.length === 0 && errorItems.length === 0 ? (
            <p className="text-zinc-500">Run an action to see results.</p>
          ) : (
            <>
              {createdItems.length > 0 && (
                <div>
                  <p className="font-medium text-zinc-900">Created</p>
                  <ul className="list-disc pl-5">
                    {createdItems.map((item) => (
                      <li key={`created-${item}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {existedItems.length > 0 && (
                <div>
                  <p className="font-medium text-zinc-900">Already existed</p>
                  <ul className="list-disc pl-5">
                    {existedItems.map((item) => (
                      <li key={`existed-${item}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {errorItems.length > 0 && (
                <div>
                  <p className="font-medium text-red-700">Errors</p>
                  <ul className="list-disc pl-5 text-red-700">
                    {errorItems.map((item) => (
                      <li key={`error-${item}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
