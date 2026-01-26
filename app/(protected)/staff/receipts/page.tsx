import { revalidatePath } from "next/cache";

import AllocationsForm from "@/components/allocations-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { approveReceipt, createReceiptDraft, getArReconciliation, postReceipt } from "@/lib/actions/arap";
import { getActiveCompanyId, getUserCompanyRoles, requireCompanyAccess, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function ReceiptsPage() {
  const user = await requireUser();
  const companyId = await getActiveCompanyId();

  if (!companyId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Receipts</CardTitle>
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
    .select("id, name")
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
    .from("ar_invoices")
    .select("id, total_gross, customers ( name )")
    .eq("company_id", companyId)
    .eq("status", "posted");

  if (invoiceError) {
    throw new Error(invoiceError.message);
  }

  const { data: allocations, error: allocError } = await supabaseAdmin()
    .from("ar_receipt_allocations")
    .select("invoice_id, amount, ar_receipts!inner(status)")
    .eq("ar_receipts.status", "posted");

  if (allocError) {
    throw new Error(allocError.message);
  }

  const allocationTotals = new Map<string, number>();
  for (const alloc of allocations ?? []) {
    allocationTotals.set(
      alloc.invoice_id,
      (allocationTotals.get(alloc.invoice_id) ?? 0) + Number(alloc.amount || 0)
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
        label: `${(customer as { name: string } | null)?.name ?? "Customer"}`,
        amount_due: outstanding,
      };
    })
    .filter((option) => option.amount_due > 0);

  const { data: receipts, error: receiptError } = await supabaseAdmin()
    .from("ar_receipts")
    .select("id, receipt_date, status, total_received, customers ( name )")
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
    const receiptDate = String(formData.get("receipt_date") ?? "");
    const cashAccountId = String(formData.get("cash_account_id") ?? "");
    const narration = String(formData.get("narration") ?? "").trim();
    const totalReceived = Number(formData.get("total_received") ?? 0);
    const whtDeducted = Number(formData.get("wht_deducted") ?? 0);
    const allocationsJson = String(formData.get("allocations_json") ?? "[]");
    const allocations = JSON.parse(allocationsJson) as Array<{ doc_id: string; amount: string }>;

    await createReceiptDraft(
      activeCompanyId,
      customerId,
      periodId,
      receiptDate,
      cashAccountId,
      narration,
      totalReceived,
      whtDeducted,
      allocations.map((alloc) => ({
        doc_id: alloc.doc_id,
        amount: Number(alloc.amount) || 0,
      }))
    );

    revalidatePath("/staff/receipts");
  }

  async function approveAction(formData: FormData) {
    "use server";
    const receiptId = String(formData.get("receipt_id") ?? "");
    await approveReceipt(receiptId);
    revalidatePath("/staff/receipts");
  }

  async function postAction(formData: FormData) {
    "use server";
    const receiptId = String(formData.get("receipt_id") ?? "");
    await postReceipt(receiptId);
    revalidatePath("/staff/receipts");
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
          <CardTitle>New receipt</CardTitle>
          <CardDescription>Record customer receipts and allocate to invoices.</CardDescription>
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
                <Label>Receipt date</Label>
                <Input name="receipt_date" type="date" required />
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
                <Label>Total received</Label>
                <Input name="total_received" type="number" step="0.01" />
              </div>
              <div className="space-y-2">
                <Label>WHT deducted</Label>
                <Input name="wht_deducted" type="number" step="0.01" />
              </div>
              <div className="space-y-2 md:col-span-3">
                <Label>Narration</Label>
                <Input name="narration" />
              </div>
            </div>

            <AllocationsForm options={allocationOptions} />
            <Button type="submit">Save draft</Button>
          </form>
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
                <TableHead>Customer</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(receipts ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-zinc-500">
                    No receipts yet.
                  </TableCell>
                </TableRow>
              ) : (
                receipts?.map((receipt) => (
                  <TableRow key={receipt.id}>
                    <TableCell>{receipt.receipt_date}</TableCell>
                    <TableCell>
                      {(() => {
                        const customer = Array.isArray(receipt.customers)
                          ? receipt.customers[0]
                          : receipt.customers;
                        return (customer as { name: string } | null)?.name ?? "-";
                      })()}
                    </TableCell>
                    <TableCell>{Number(receipt.total_received).toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          receipt.status === "posted"
                            ? "success"
                            : receipt.status === "approved"
                            ? "warning"
                            : "default"
                        }
                      >
                        {receipt.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-y-2">
                      {canApprove && receipt.status === "draft" && (
                        <form action={approveAction}>
                          <input type="hidden" name="receipt_id" value={receipt.id} />
                          <Button type="submit" variant="outline">
                            Approve
                          </Button>
                        </form>
                      )}
                      {canApprove && receipt.status === "approved" && (
                        <form action={postAction}>
                          <input type="hidden" name="receipt_id" value={receipt.id} />
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
