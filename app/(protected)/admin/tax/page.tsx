import { revalidatePath } from "next/cache";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createTaxRate, upsertCompanyAccounts, upsertTaxAccounts } from "@/lib/actions/arap-admin";
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
    .select("id, tax, rate, effective_from")
    .eq("company_id", companyId)
    .order("effective_from", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const { data: taxAccounts, error: taxAccountError } = await supabaseAdmin()
    .from("tax_accounts")
    .select(
      "vat_output_account_id, nhil_output_account_id, getfund_output_account_id, wht_receivable_account_id, wht_payable_account_id"
    )
    .eq("company_id", companyId)
    .maybeSingle();

  if (taxAccountError) {
    throw new Error(taxAccountError.message);
  }

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
    .select("ar_control_account_id, ap_control_account_id")
    .eq("company_id", companyId)
    .maybeSingle();

  if (companyAccountError) {
    throw new Error(companyAccountError.message);
  }

  async function createTaxAction(formData: FormData) {
    "use server";
    const tax = String(formData.get("tax") ?? "VAT").trim() as
      | "VAT"
      | "NHIL"
      | "GETFund"
      | "WHT";
    const effectiveFrom = String(formData.get("effective_from") ?? "");
    const rate = Number(formData.get("rate") ?? 0);

    if (!effectiveFrom) {
      throw new Error("Effective date is required.");
    }

    await createTaxRate({
      company_id: activeCompanyId,
      tax,
      rate,
      effective_from: effectiveFrom,
    });

    revalidatePath("/admin/tax");
  }

  async function taxAccountsAction(formData: FormData) {
    "use server";
    const vatOutput = String(formData.get("vat_output_account_id") ?? "");
    const nhilOutput = String(formData.get("nhil_output_account_id") ?? "");
    const getfundOutput = String(formData.get("getfund_output_account_id") ?? "");
    const whtReceivable = String(formData.get("wht_receivable_account_id") ?? "");
    const whtPayable = String(formData.get("wht_payable_account_id") ?? "");

    await upsertTaxAccounts({
      company_id: activeCompanyId,
      vat_output_account_id: vatOutput || null,
      nhil_output_account_id: nhilOutput || null,
      getfund_output_account_id: getfundOutput || null,
      wht_receivable_account_id: whtReceivable || null,
      wht_payable_account_id: whtPayable || null,
    });

    revalidatePath("/admin/tax");
  }

  async function companyAccountsAction(formData: FormData) {
    "use server";
    const arControl = String(formData.get("ar_control_account_id") ?? "");
    const apControl = String(formData.get("ap_control_account_id") ?? "");

    await upsertCompanyAccounts({
      company_id: activeCompanyId,
      ar_control_account_id: arControl || null,
      ap_control_account_id: apControl || null,
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
                <TableHead>Tax</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Effective</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(taxRates ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-sm text-zinc-500">
                    No tax rates yet.
                  </TableCell>
                </TableRow>
              ) : (
                taxRates?.map((tax) => (
                  <TableRow key={tax.id}>
                    <TableCell>{tax.tax}</TableCell>
                    <TableCell>{Number(tax.rate).toFixed(2)}%</TableCell>
                    <TableCell>{tax.effective_from}</TableCell>
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
              <Label htmlFor="tax">Tax type</Label>
              <Select id="tax" name="tax" required>
                <option value="VAT">VAT</option>
                <option value="NHIL">NHIL</option>
                <option value="GETFund">GETFund</option>
                <option value="WHT">WHT</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rate">Rate (%)</Label>
              <Input id="rate" name="rate" type="number" step="0.01" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="effective_from">Effective from</Label>
              <Input id="effective_from" name="effective_from" type="date" required />
            </div>
            <div className="md:col-span-2">
              <Button type="submit">Add tax rate</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tax accounts</CardTitle>
          <CardDescription>Map VAT/NHIL/GETFund/WHT accounts.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={taxAccountsAction} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="vat_output_account_id">VAT output</Label>
              <Select
                id="vat_output_account_id"
                name="vat_output_account_id"
                defaultValue={taxAccounts?.vat_output_account_id ?? ""}
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
              <Label htmlFor="nhil_output_account_id">NHIL output</Label>
              <Select
                id="nhil_output_account_id"
                name="nhil_output_account_id"
                defaultValue={taxAccounts?.nhil_output_account_id ?? ""}
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
              <Label htmlFor="getfund_output_account_id">GETFund output</Label>
              <Select
                id="getfund_output_account_id"
                name="getfund_output_account_id"
                defaultValue={taxAccounts?.getfund_output_account_id ?? ""}
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
                defaultValue={taxAccounts?.wht_receivable_account_id ?? ""}
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
                defaultValue={taxAccounts?.wht_payable_account_id ?? ""}
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
                Save tax accounts
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
            <div className="md:col-span-2">
              <Button type="submit">Save control accounts</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
