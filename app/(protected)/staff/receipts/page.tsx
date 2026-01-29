import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import AllocationsForm from "@/components/allocations-form";
import ReconciliationBanner from "@/components/reconciliation-banner";
import ToastMessage from "@/components/toast-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  createReceiptDraft,
  deleteReceiptDraft,
  getArReconciliation,
  postReceipt,
  submitReceipt,
} from "@/lib/actions/arap";
import { ensureActiveCompanyId, getUserCompanyRoles, requireCompanyAccess, requireUser } from "@/lib/auth";
import { canAnyRole } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; toast?: string; message?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const user = await requireUser();
  const companyId = await ensureActiveCompanyId(user.id, "/staff/receipts");

  if (!companyId) {
    return null;
  }

  await requireCompanyAccess(user.id, companyId);
  const activeCompanyId = companyId as string;

  const roles = await getUserCompanyRoles(user.id);
  const companyRoles = roles
    .filter((role) => role.company_id === companyId)
    .map((role) => role.role);
  const canCreate = canAnyRole(companyRoles, null, "CREATE").allowed;
  const canSubmitDraft = canAnyRole(companyRoles, "draft", "SUBMIT").allowed;
  const canPostSubmitted = canAnyRole(companyRoles, "submitted", "POST").allowed;
  const canDeleteDraft = canAnyRole(companyRoles, "draft", "DELETE_DRAFT").allowed;
  const isAdmin = companyRoles.includes("Admin");

  const { data: customers, error: customerError } = await supabaseAdmin()
    .from("customers")
    .select("id, name, wht_applicable")
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

  if ((periods ?? []).length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Receipts</CardTitle>
          <CardDescription>
            No periods for this company yet. Ask Admin to set up periods.
          </CardDescription>
        </CardHeader>
      </Card>
    );
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
    .select("id, invoice_no, total_gross, customers ( name )")
    .eq("company_id", companyId)
    .eq("status", "posted");

  if (invoiceError) {
    throw new Error(invoiceError.message);
  }

  const { data: allocations, error: allocError } = await supabaseAdmin()
    .from("receipt_allocations")
    .select("invoice_id, amount_allocated, receipts!inner(status)")
    .eq("receipts.status", "posted");

  if (allocError) {
    throw new Error(allocError.message);
  }

  const allocationTotals = new Map<string, number>();
  for (const alloc of allocations ?? []) {
    allocationTotals.set(
      alloc.invoice_id,
      (allocationTotals.get(alloc.invoice_id) ?? 0) + Number(alloc.amount_allocated || 0)
    );
  }

  const allocationOptions = (invoices ?? [])
    .map((invoice) => {
      const allocated = allocationTotals.get(invoice.id) ?? 0;
      const outstanding = Number(invoice.total_gross) - allocated;
      const customer = Array.isArray(invoice.customers)
        ? invoice.customers[0]
        : invoice.customers;
      return {
        id: invoice.id,
        label: `${invoice.invoice_no} - ${(customer as { name: string } | null)?.name ?? "Customer"}`,
        amount_due: outstanding,
      };
    })
    .filter((option) => option.amount_due > 0);

  const { data: receipts, error: receiptError } = await supabaseAdmin()
    .from("receipts")
    .select("id, receipt_no, receipt_date, status, amount_received, wht_deducted, created_by, customers ( name )")
    .eq("company_id", companyId)
    .order("receipt_date", { ascending: false })
    .limit(50);

  if (receiptError) {
    throw new Error(receiptError.message);
  }

  const reconciliation = await getArReconciliation(activeCompanyId);

  async function createAction(formData: FormData) {
    "use server";
    const customerId = String(formData.get("customer_id") ?? "");
    const periodId = String(formData.get("period_id") ?? "");
    const receiptNo = String(formData.get("receipt_no") ?? "").trim();
    const receiptDate = String(formData.get("receipt_date") ?? "");
    const method = String(formData.get("method") ?? "cash") as
      | "bank"
      | "momo"
      | "cash"
      | "cheque";
    const cashAccountId = String(formData.get("cash_account_id") ?? "");
    const amountReceived = Number(formData.get("amount_received") ?? 0);
    const whtDeducted = Number(formData.get("wht_deducted") ?? 0);
    const allocationsJson = String(formData.get("allocations_json") ?? "[]");
    const allocations = JSON.parse(allocationsJson) as Array<{ doc_id: string; amount: string }>;

    if (!receiptNo) {
      throw new Error("Receipt number is required.");
    }

    const normalizedAllocations = allocations
      .map((alloc) => ({
        doc_id: alloc.doc_id,
        amount: Number(alloc.amount) || 0,
      }))
      .filter((alloc) => alloc.doc_id && alloc.amount > 0);

    if (normalizedAllocations.length === 0) {
      redirect(
        "/staff/receipts?error=allocations&toast=error&message=Allocate%20at%20least%20one%20invoice."
      );
    }

    try {
      await createReceiptDraft({
        company_id: activeCompanyId,
        customer_id: customerId,
        period_id: periodId,
        receipt_no: receiptNo,
        receipt_date: receiptDate,
        method,
        cash_account_id: cashAccountId,
        amount_received: amountReceived,
        wht_deducted: whtDeducted,
        allocations: normalizedAllocations,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save receipt.";
      redirect(`/staff/receipts?toast=error&message=${encodeURIComponent(message)}`);
    }

    revalidatePath("/staff/receipts");
    redirect("/staff/receipts?toast=saved");
  }

  async function submitAction(formData: FormData) {
    "use server";
    const receiptId = String(formData.get("receipt_id") ?? "");
    try {
      await submitReceipt(receiptId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to submit receipt.";
      redirect(`/staff/receipts?toast=error&message=${encodeURIComponent(message)}`);
    }
    revalidatePath("/staff/receipts");
    redirect("/staff/receipts?toast=submitted");
  }

  async function postAction(formData: FormData) {
    "use server";
    const receiptId = String(formData.get("receipt_id") ?? "");
    try {
      await postReceipt(receiptId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to post receipt.";
      redirect(`/staff/receipts?toast=error&message=${encodeURIComponent(message)}`);
    }
    revalidatePath("/staff/receipts");
    redirect("/staff/receipts?toast=posted");
  }

  async function submitAndPostAction(formData: FormData) {
    "use server";
    const receiptId = String(formData.get("receipt_id") ?? "");
    try {
      await submitReceipt(receiptId);
      await postReceipt(receiptId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to submit and post receipt.";
      redirect(`/staff/receipts?toast=error&message=${encodeURIComponent(message)}`);
    }
    revalidatePath("/staff/receipts");
    redirect("/staff/receipts?toast=posted");
  }

  async function deleteAction(formData: FormData) {
    "use server";
    const receiptId = String(formData.get("receipt_id") ?? "");
    try {
      await deleteReceiptDraft(receiptId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to delete receipt.";
      redirect(`/staff/receipts?toast=error&message=${encodeURIComponent(message)}`);
    }
    revalidatePath("/staff/receipts");
    redirect("/staff/receipts?toast=deleted");
  }

  return (
    <div className="space-y-6">
      {resolvedSearchParams?.toast && (
        <ToastMessage
          kind={resolvedSearchParams.toast === "error" ? "error" : "success"}
          message={
            resolvedSearchParams.toast === "saved"
              ? "Receipt saved"
              : resolvedSearchParams.toast === "submitted"
              ? "Receipt submitted"
              : resolvedSearchParams.toast === "posted"
              ? "Receipt posted"
              : resolvedSearchParams.toast === "deleted"
              ? "Receipt deleted"
              : resolvedSearchParams.message ?? "Action completed"
          }
        />
      )}
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
          <CardTitle>New receipt</CardTitle>
          <CardDescription>Record customer receipts and allocate to invoices.</CardDescription>
        </CardHeader>
        <CardContent>
          {resolvedSearchParams?.error === "allocations" && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Allocate at least one invoice.
            </div>
          )}
          {!canCreate ? (
            <p className="text-sm text-zinc-600">
              You do not have permission to create receipts.
            </p>
          ) : (
            <form action={createAction} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Customer</Label>
                  <Select name="customer_id" required>
                    <option value="">Select customer</option>
                    {(customers ?? []).map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name} {customer.wht_applicable ? "" : "(No WHT)"}
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
                  <Label>Receipt no</Label>
                  <Input name="receipt_no" required />
                </div>
                <div className="space-y-2">
                  <Label>Receipt date</Label>
                  <Input name="receipt_date" type="date" required />
                </div>
                <div className="space-y-2">
                  <Label>Method</Label>
                  <Select name="method" required>
                    <option value="cash">Cash</option>
                    <option value="bank">Bank</option>
                    <option value="momo">Mobile money</option>
                    <option value="cheque">Cheque</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Cash/Bank account</Label>
                  <Select name="cash_account_id" required>
                    <option value="">Select account</option>
                    {(accounts ?? []).map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.code} - {account.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Amount received</Label>
                  <Input name="amount_received" type="number" step="0.01" />
                </div>
                <div className="space-y-2">
                  <Label>WHT deducted</Label>
                  <Input name="wht_deducted" type="number" step="0.01" />
                </div>
              </div>

              {allocationOptions.length === 0 ? (
                <p className="text-sm text-zinc-600">
                  No posted invoices available to allocate. Post an invoice first.
                </p>
              ) : (
                <AllocationsForm
                  options={allocationOptions}
                  settlementAmountName="amount_received"
                  whtAmountName="wht_deducted"
                />
              )}
              <Button type="submit" disabled={allocationOptions.length === 0}>
                Save draft
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent receipts</CardTitle>
          <CardDescription>Latest 50 receipts for the active company.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Receipt</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(receipts ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-zinc-500">
                    No receipts yet.
                  </TableCell>
                </TableRow>
              ) : (
                receipts?.map((receipt) => {
                  const customer = Array.isArray(receipt.customers)
                    ? receipt.customers[0]
                    : receipt.customers;
                  return (
                    <TableRow key={receipt.id}>
                      <TableCell>{receipt.receipt_date}</TableCell>
                      <TableCell>{receipt.receipt_no}</TableCell>
                      <TableCell>{(customer as { name: string } | null)?.name ?? "-"}</TableCell>
                      <TableCell>
                        {Number(receipt.amount_received).toFixed(2)} (WHT {Number(receipt.wht_deducted).toFixed(2)})
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            receipt.status === "posted"
                              ? "success"
                              : receipt.status === "approved"
                              ? "warning"
                              : receipt.status === "submitted"
                              ? "default"
                              : "default"
                          }
                        >
                          {receipt.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="space-y-2">
                        {receipt.status === "draft" && canSubmitDraft && (
                          <form action={submitAction}>
                            <input type="hidden" name="receipt_id" value={receipt.id} />
                            <Button type="submit" variant="outline">
                              Submit
                            </Button>
                          </form>
                        )}
                        {receipt.status === "draft" &&
                          isAdmin &&
                          canSubmitDraft &&
                          canPostSubmitted && (
                            <form action={submitAndPostAction}>
                              <input type="hidden" name="receipt_id" value={receipt.id} />
                              <Button type="submit">
                                Submit &amp; Post
                              </Button>
                            </form>
                          )}
                        {receipt.status === "submitted" && canPostSubmitted && (
                          <form action={postAction}>
                            <input type="hidden" name="receipt_id" value={receipt.id} />
                            <Button type="submit" variant="outline">
                              Post
                            </Button>
                          </form>
                        )}
                        {receipt.status === "draft" && canDeleteDraft && (
                          <form action={deleteAction}>
                            <input type="hidden" name="receipt_id" value={receipt.id} />
                            <Button type="submit" variant="ghost">
                              Delete
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
