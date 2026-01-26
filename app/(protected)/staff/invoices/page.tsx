import Link from "next/link";
import { revalidatePath } from "next/cache";

import DocumentLinesForm from "@/components/document-lines-form";
import ReconciliationBanner from "@/components/reconciliation-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  approveInvoice,
  createInvoiceDraft,
  getArReconciliation,
  postInvoice,
  rejectInvoice,
  submitInvoice,
} from "@/lib/actions/arap";
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

  const { data: invoices, error: invoiceError } = await supabaseAdmin()
    .from("invoices")
    .select("id, invoice_no, invoice_date, due_date, status, total_gross, created_by, customers ( name )")
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
    const invoiceNo = String(formData.get("invoice_no") ?? "").trim();
    const invoiceDate = String(formData.get("invoice_date") ?? "");
    const dueDateRaw = String(formData.get("due_date") ?? "");
    const narration = String(formData.get("narration") ?? "").trim();
    const linesJson = String(formData.get("lines_json") ?? "[]");
    const lines = JSON.parse(linesJson) as Array<{
      account_id: string;
      description: string;
      quantity: string;
      unit_price: string;
    }>;

    if (!invoiceNo) {
      throw new Error("Invoice number is required.");
    }

    await createInvoiceDraft({
      company_id: activeCompanyId,
      customer_id: customerId,
      period_id: periodId,
      invoice_no: invoiceNo,
      invoice_date: invoiceDate,
      due_date: dueDateRaw || null,
      narration,
      lines: lines.map((line) => ({
        account_id: line.account_id,
        description: line.description,
        quantity: Number(line.quantity) || 0,
        unit_price: Number(line.unit_price) || 0,
      })),
    });

    revalidatePath("/staff/invoices");
  }

  async function submitAction(formData: FormData) {
    "use server";
    const invoiceId = String(formData.get("invoice_id") ?? "");
    await submitInvoice(invoiceId);
    revalidatePath("/staff/invoices");
  }

  async function approveAction(formData: FormData) {
    "use server";
    const invoiceId = String(formData.get("invoice_id") ?? "");
    await approveInvoice(invoiceId);
    revalidatePath("/staff/invoices");
  }

  async function rejectAction(formData: FormData) {
    "use server";
    const invoiceId = String(formData.get("invoice_id") ?? "");
    const note = String(formData.get("reject_note") ?? "").trim();
    await rejectInvoice(invoiceId, note || "Rejected");
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
      <ReconciliationBanner
        title="AR reconciliation"
        description="Control vs customer balances."
        controlBalance={reconciliation.arControlBalance}
        subledgerBalance={reconciliation.totalCustomerBalance}
        difference={reconciliation.difference}
        detailsHref="/staff/reconciliation?type=ar"
      />

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
                      {customer.name} {customer.tax_exempt ? "(Tax exempt)" : ""}
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
                <Label>Invoice no</Label>
                <Input name="invoice_no" required />
              </div>
              <div className="space-y-2">
                <Label>Invoice date</Label>
                <Input name="invoice_date" type="date" required />
              </div>
              <div className="space-y-2">
                <Label>Due date</Label>
                <Input name="due_date" type="date" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Narration</Label>
                <Input name="narration" />
              </div>
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
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(invoices ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-zinc-500">
                    No invoices yet.
                  </TableCell>
                </TableRow>
              ) : (
                invoices?.map((invoice) => {
                  const customer = Array.isArray(invoice.customers)
                    ? invoice.customers[0]
                    : invoice.customers;
                  return (
                    <TableRow key={invoice.id}>
                      <TableCell>{invoice.invoice_date}</TableCell>
                      <TableCell>{invoice.invoice_no}</TableCell>
                      <TableCell>{(customer as { name: string } | null)?.name ?? "-"}</TableCell>
                      <TableCell>{Number(invoice.total_gross).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            invoice.status === "posted"
                              ? "success"
                              : invoice.status === "approved"
                              ? "warning"
                              : invoice.status === "submitted"
                              ? "default"
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
                        {invoice.status === "draft" && invoice.created_by === user.id && (
                          <form action={submitAction}>
                            <input type="hidden" name="invoice_id" value={invoice.id} />
                            <Button type="submit" variant="outline">
                              Submit
                            </Button>
                          </form>
                        )}
                        {canApprove && invoice.status === "submitted" && invoice.created_by !== user.id && (
                          <form action={approveAction}>
                            <input type="hidden" name="invoice_id" value={invoice.id} />
                            <Button type="submit" variant="outline">
                              Approve
                            </Button>
                          </form>
                        )}
                        {canApprove && invoice.status === "submitted" && invoice.created_by !== user.id && (
                          <form action={rejectAction} className="flex items-center gap-2">
                            <input type="hidden" name="invoice_id" value={invoice.id} />
                            <Input name="reject_note" placeholder="Reject note" />
                            <Button type="submit" variant="ghost">
                              Reject
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
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
