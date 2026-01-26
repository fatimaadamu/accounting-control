import Link from "next/link";
import { revalidatePath } from "next/cache";

import DocumentLinesForm from "@/components/document-lines-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { approveInvoice, createInvoiceDraft, getArReconciliation, postInvoice } from "@/lib/actions/arap";
import { getActiveCompanyId, getUserCompanyRoles, requireCompanyAccess, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function InvoicesPage() {
  const user = await requireUser();
  const companyId = await getActiveCompanyId();

  if (!companyId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>Select a company to continue.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  await requireCompanyAccess(user.id, companyId);
  const activeCompanyId = companyId as string;

  const roles = await getUserCompanyRoles(user.id);
  const canApprove = roles.some(
    (role) => role.company_id === companyId && ["Admin", "Manager"].includes(role.role)
  );

  const { data: customers, error: customerError } = await supabaseAdmin()
    .from("customers")
    .select("id, name, tax_exempt")
    .eq("company_id", companyId)
    .order("name");

  if (customerError) {
    throw new Error(customerError.message);
  }

  const { data: periods, error: periodError } = await supabaseAdmin()
    .from("periods")
    .select("id, period_month, period_year")
    .eq("company_id", companyId)
    .order("start_date", { ascending: true });

  if (periodError) {
    throw new Error(periodError.message);
  }

  const { data: accounts, error: accountError } = await supabaseAdmin()
    .from("accounts")
    .select("id, code, name")
    .eq("company_id", companyId)
    .order("code");

  if (accountError) {
    throw new Error(accountError.message);
  }

  const { data: taxRates, error: taxError } = await supabaseAdmin()
    .from("tax_rates")
    .select("id, name, rate, applies_to")
    .eq("company_id", companyId)
    .eq("applies_to", "sales")
    .order("name");

  if (taxError) {
    throw new Error(taxError.message);
  }

  const { data: invoices, error: invoiceError } = await supabaseAdmin()
    .from("ar_invoices")
    .select("id, invoice_date, due_date, narration, status, total_gross, customers ( name )")
    .eq("company_id", companyId)
    .order("invoice_date", { ascending: false })
    .limit(50);

  if (invoiceError) {
    throw new Error(invoiceError.message);
  }

  const reconciliation = await getArReconciliation(activeCompanyId);

  async function createAction(formData: FormData) {
    "use server";
    const customerId = String(formData.get("customer_id") ?? "");
    const periodId = String(formData.get("period_id") ?? "");
    const invoiceDate = String(formData.get("invoice_date") ?? "");
    const dueDate = String(formData.get("due_date") ?? "");
    const narration = String(formData.get("narration") ?? "").trim();
    const taxExempt = Boolean(formData.get("tax_exempt"));
    const vatRateId = String(formData.get("vat_rate_id") ?? "") || null;
    const nhilRateId = String(formData.get("nhil_rate_id") ?? "") || null;
    const getfundRateId = String(formData.get("getfund_rate_id") ?? "") || null;
    const linesJson = String(formData.get("lines_json") ?? "[]");
    const lines = JSON.parse(linesJson) as Array<{
      account_id: string;
      description: string;
      quantity: string;
      unit_price: string;
    }>;

    await createInvoiceDraft(
      activeCompanyId,
      customerId,
      periodId,
      invoiceDate,
      dueDate,
      narration,
      taxExempt,
      vatRateId,
      nhilRateId,
      getfundRateId,
      lines.map((line) => ({
        account_id: line.account_id,
        description: line.description,
        quantity: Number(line.quantity) || 0,
        unit_price: Number(line.unit_price) || 0,
      }))
    );

    revalidatePath("/staff/invoices");
  }

  async function approveAction(formData: FormData) {
    "use server";
    const invoiceId = String(formData.get("invoice_id") ?? "");
    await approveInvoice(invoiceId);
    revalidatePath("/staff/invoices");
  }

  async function postAction(formData: FormData) {
    "use server";
    const invoiceId = String(formData.get("invoice_id") ?? "");
    await postInvoice(invoiceId);
    revalidatePath("/staff/invoices");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>AR reconciliation</CardTitle>
          <CardDescription>Control vs customer balances.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-600">
            Invoices: {reconciliation.invoiceTotal.toFixed(2)} | Receipts: {reconciliation.receiptTotal.toFixed(2)} | Difference: {reconciliation.difference.toFixed(2)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>New invoice</CardTitle>
          <CardDescription>Create an invoice draft for approval.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createAction} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Customer</Label>
                <Select name="customer_id" required>
                  <option value="">Select customer</option>
                  {(customers ?? []).map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Period</Label>
                <Select name="period_id" required>
                  <option value="">Select period</option>
                  {(periods ?? []).map((period) => (
                    <option key={period.id} value={period.id}>
                      {period.period_year}-{String(period.period_month).padStart(2, "0")}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Invoice date</Label>
                <Input name="invoice_date" type="date" required />
              </div>
              <div className="space-y-2">
                <Label>Due date</Label>
                <Input name="due_date" type="date" required />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Narration</Label>
                <Input name="narration" />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>VAT rate</Label>
                <Select name="vat_rate_id">
                  <option value="">None</option>
                  {(taxRates ?? []).map((tax) => (
                    <option key={tax.id} value={tax.id}>
                      {tax.name} ({Number(tax.rate).toFixed(2)}%)
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>NHIL rate</Label>
                <Select name="nhil_rate_id">
                  <option value="">None</option>
                  {(taxRates ?? []).map((tax) => (
                    <option key={tax.id} value={tax.id}>
                      {tax.name} ({Number(tax.rate).toFixed(2)}%)
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>GETFund rate</Label>
                <Select name="getfund_rate_id">
                  <option value="">None</option>
                  {(taxRates ?? []).map((tax) => (
                    <option key={tax.id} value={tax.id}>
                      {tax.name} ({Number(tax.rate).toFixed(2)}%)
                    </option>
                  ))}
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input type="checkbox" name="tax_exempt" /> Tax exempt
              </label>
            </div>

            <DocumentLinesForm accounts={accounts ?? []} />
            <Button type="submit">Save draft</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent invoices</CardTitle>
          <CardDescription>Latest 50 invoices for the active company.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(invoices ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-zinc-500">
                    No invoices yet.
                  </TableCell>
                </TableRow>
              ) : (
                invoices?.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell>{invoice.invoice_date}</TableCell>
                    <TableCell>
                      {(() => {
                        const customer = Array.isArray(invoice.customers)
                          ? invoice.customers[0]
                          : invoice.customers;
                        return (customer as { name: string } | null)?.name ?? "-";
                      })()}
                    </TableCell>
                    <TableCell>{Number(invoice.total_gross).toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          invoice.status === "posted"
                            ? "success"
                            : invoice.status === "approved"
                            ? "warning"
                            : "default"
                        }
                      >
                        {invoice.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-y-2">
                      <Link
                        href={`/staff/invoices/${invoice.id}`}
                        className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                      >
                        View
                      </Link>
                      {canApprove && invoice.status === "draft" && (
                        <form action={approveAction}>
                          <input type="hidden" name="invoice_id" value={invoice.id} />
                          <Button type="submit" variant="outline">
                            Approve
                          </Button>
                        </form>
                      )}
                      {canApprove && invoice.status === "approved" && (
                        <form action={postAction}>
                          <input type="hidden" name="invoice_id" value={invoice.id} />
                          <Button type="submit" variant="outline">
                            Post
                          </Button>
                        </form>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
