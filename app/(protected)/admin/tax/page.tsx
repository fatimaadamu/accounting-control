import { revalidatePath } from "next/cache";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createTaxRate, mapTaxAccount, upsertCompanyAccounts } from "@/lib/actions/arap-admin";
import { getActiveCompanyId, requireCompanyRole, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function TaxPage() {
  const user = await requireUser();
  const companyId = await getActiveCompanyId();

  if (!companyId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Taxes & mappings</CardTitle>
          <CardDescription>Select a company to continue.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  await requireCompanyRole(user.id, companyId, ["Admin"]);
  const activeCompanyId = companyId as string;

  const { data: taxRates, error } = await supabaseAdmin()
    .from("tax_rates")
    .select("id, name, tax_type, rate, applies_to, is_withholding")
    .eq("company_id", companyId)
    .order("name");

  if (error) {
    throw new Error(error.message);
  }

  const { data: taxAccounts, error: taxAccountError } = await supabaseAdmin()
    .from("tax_accounts")
    .select("tax_rate_id, account_id")
    .eq("company_id", companyId);

  if (taxAccountError) {
    throw new Error(taxAccountError.message);
  }

  const taxAccountMap = new Map(
    (taxAccounts ?? []).map((row) => [row.tax_rate_id, row.account_id])
  );

  const { data: accounts, error: accountError } = await supabaseAdmin()
    .from("accounts")
    .select("id, code, name")
    .eq("company_id", companyId)
    .order("code");

  if (accountError) {
    throw new Error(accountError.message);
  }

  const { data: companyAccounts, error: companyAccountError } = await supabaseAdmin()
    .from("company_accounts")
    .select(
      "ar_control_account_id, ap_control_account_id, wht_receivable_account_id, wht_payable_account_id"
    )
    .eq("company_id", companyId)
    .maybeSingle();

  if (companyAccountError) {
    throw new Error(companyAccountError.message);
  }

  async function createTaxAction(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    const taxType = String(formData.get("tax_type") ?? "").trim();
    const appliesTo = String(formData.get("applies_to") ?? "sales").trim();
    const rate = Number(formData.get("rate") ?? 0);
    const isWithholding = Boolean(formData.get("is_withholding"));

    if (!name) {
      throw new Error("Tax name is required.");
    }

    await createTaxRate({
      company_id: activeCompanyId,
      name,
      tax_type: taxType || name,
      applies_to: appliesTo,
      rate,
      is_withholding: isWithholding,
    });

    revalidatePath("/admin/tax");
  }

  async function mapTaxAction(formData: FormData) {
    "use server";
    const taxRateId = String(formData.get("tax_rate_id") ?? "");
    const accountId = String(formData.get("account_id") ?? "");

    if (!taxRateId || !accountId) {
      throw new Error("Tax rate and account are required.");
    }

    await mapTaxAccount({
      company_id: activeCompanyId,
      tax_rate_id: taxRateId,
      account_id: accountId,
    });

    revalidatePath("/admin/tax");
  }

  async function companyAccountsAction(formData: FormData) {
    "use server";
    const arControl = String(formData.get("ar_control_account_id") ?? "");
    const apControl = String(formData.get("ap_control_account_id") ?? "");
    const whtReceivable = String(formData.get("wht_receivable_account_id") ?? "");
    const whtPayable = String(formData.get("wht_payable_account_id") ?? "");

    await upsertCompanyAccounts({
      company_id: activeCompanyId,
      ar_control_account_id: arControl || null,
      ap_control_account_id: apControl || null,
      wht_receivable_account_id: whtReceivable || null,
      wht_payable_account_id: whtPayable || null,
    });

    revalidatePath("/admin/tax");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Tax rates</CardTitle>
          <CardDescription>Create and map tax rates to GL accounts.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Applies to</TableHead>
                <TableHead>Account mapped</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(taxRates ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-zinc-500">
                    No tax rates yet.
                  </TableCell>
                </TableRow>
              ) : (
                taxRates?.map((tax) => (
                  <TableRow key={tax.id}>
                    <TableCell>{tax.name}</TableCell>
                    <TableCell>{tax.tax_type}</TableCell>
                    <TableCell>{Number(tax.rate).toFixed(2)}%</TableCell>
                    <TableCell>{tax.applies_to}</TableCell>
                    <TableCell>
                      {taxAccountMap.get(tax.id) ? "Yes" : "No"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create tax rate</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createTaxAction} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tax_type">Tax type</Label>
              <Input id="tax_type" name="tax_type" placeholder="VAT/NHIL/GETFund" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rate">Rate (%)</Label>
              <Input id="rate" name="rate" type="number" step="0.01" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="applies_to">Applies to</Label>
              <Select id="applies_to" name="applies_to">
                <option value="sales">Sales</option>
                <option value="purchases">Purchases</option>
                <option value="withholding">Withholding</option>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" name="is_withholding" /> Withholding tax
            </label>
            <div className="md:col-span-2">
              <Button type="submit">Add tax rate</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Map tax account</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={mapTaxAction} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tax_rate_id">Tax rate</Label>
              <Select id="tax_rate_id" name="tax_rate_id">
                <option value="">Select tax rate</option>
                {(taxRates ?? []).map((tax) => (
                  <option key={tax.id} value={tax.id}>
                    {tax.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="account_id">GL account</Label>
              <Select id="account_id" name="account_id">
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
                Map account
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Control accounts</CardTitle>
          <CardDescription>Required for posting AR/AP and WHT.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={companyAccountsAction} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ar_control_account_id">AR control</Label>
              <Select
                id="ar_control_account_id"
                name="ar_control_account_id"
                defaultValue={companyAccounts?.ar_control_account_id ?? ""}
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
              <Label htmlFor="ap_control_account_id">AP control</Label>
              <Select
                id="ap_control_account_id"
                name="ap_control_account_id"
                defaultValue={companyAccounts?.ap_control_account_id ?? ""}
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
              <Label htmlFor="wht_receivable_account_id">WHT receivable</Label>
              <Select
                id="wht_receivable_account_id"
                name="wht_receivable_account_id"
                defaultValue={companyAccounts?.wht_receivable_account_id ?? ""}
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
              <Label htmlFor="wht_payable_account_id">WHT payable</Label>
              <Select
                id="wht_payable_account_id"
                name="wht_payable_account_id"
                defaultValue={companyAccounts?.wht_payable_account_id ?? ""}
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
              <Button type="submit">Save control accounts</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
