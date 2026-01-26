import { revalidatePath } from "next/cache";

import AllocationsForm from "@/components/allocations-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { approvePaymentVoucher, createPaymentVoucherDraft, getApReconciliation, postPaymentVoucher } from "@/lib/actions/arap";
import { getActiveCompanyId, getUserCompanyRoles, requireCompanyAccess, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function PaymentVouchersPage() {
  const user = await requireUser();
  const companyId = await getActiveCompanyId();

  if (!companyId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Payment vouchers</CardTitle>
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

  const { data: suppliers, error: supplierError } = await supabaseAdmin()
    .from("suppliers")
    .select("id, name")
    .eq("company_id", companyId)
    .order("name");

  if (supplierError) {
    throw new Error(supplierError.message);
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

  const { data: bills, error: billError } = await supabaseAdmin()
    .from("ap_bills")
    .select("id, total_gross, suppliers ( name )")
    .eq("company_id", companyId)
    .eq("status", "posted");

  if (billError) {
    throw new Error(billError.message);
  }

  const { data: allocations, error: allocError } = await supabaseAdmin()
    .from("ap_payment_allocations")
    .select("bill_id, amount, ap_payment_vouchers!inner(status)")
    .eq("ap_payment_vouchers.status", "posted");

  if (allocError) {
    throw new Error(allocError.message);
  }

  const allocationTotals = new Map<string, number>();
  for (const alloc of allocations ?? []) {
    allocationTotals.set(
      alloc.bill_id,
      (allocationTotals.get(alloc.bill_id) ?? 0) + Number(alloc.amount || 0)
    );
  }

  const allocationOptions = (bills ?? [])
    .map((bill) => {
      const allocated = allocationTotals.get(bill.id) ?? 0;
      const outstanding = Number(bill.total_gross) - allocated;
      const supplier = Array.isArray(bill.suppliers)
        ? bill.suppliers[0]
        : bill.suppliers;
      return {
        id: bill.id,
        label: `${(supplier as { name: string } | null)?.name ?? "Supplier"}`,
        amount_due: outstanding,
      };
    })
    .filter((option) => option.amount_due > 0);

  const { data: payments, error: paymentError } = await supabaseAdmin()
    .from("ap_payment_vouchers")
    .select("id, payment_date, status, total_paid, suppliers ( name )")
    .eq("company_id", companyId)
    .order("payment_date", { ascending: false })
    .limit(50);

  if (paymentError) {
    throw new Error(paymentError.message);
  }

  const reconciliation = await getApReconciliation(activeCompanyId);

  async function createAction(formData: FormData) {
    "use server";
    const supplierId = String(formData.get("supplier_id") ?? "");
    const periodId = String(formData.get("period_id") ?? "");
    const paymentDate = String(formData.get("payment_date") ?? "");
    const cashAccountId = String(formData.get("cash_account_id") ?? "");
    const narration = String(formData.get("narration") ?? "").trim();
    const totalPaid = Number(formData.get("total_paid") ?? 0);
    const whtDeducted = Number(formData.get("wht_deducted") ?? 0);
    const allocationsJson = String(formData.get("allocations_json") ?? "[]");
    const allocations = JSON.parse(allocationsJson) as Array<{ doc_id: string; amount: string }>;

    await createPaymentVoucherDraft(
      activeCompanyId,
      supplierId,
      periodId,
      paymentDate,
      cashAccountId,
      narration,
      totalPaid,
      whtDeducted,
      allocations.map((alloc) => ({
        doc_id: alloc.doc_id,
        amount: Number(alloc.amount) || 0,
      }))
    );

    revalidatePath("/staff/payment-vouchers");
  }

  async function approveAction(formData: FormData) {
    "use server";
    const paymentId = String(formData.get("payment_id") ?? "");
    await approvePaymentVoucher(paymentId);
    revalidatePath("/staff/payment-vouchers");
  }

  async function postAction(formData: FormData) {
    "use server";
    const paymentId = String(formData.get("payment_id") ?? "");
    await postPaymentVoucher(paymentId);
    revalidatePath("/staff/payment-vouchers");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>AP reconciliation</CardTitle>
          <CardDescription>Control vs supplier balances.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-600">
            Bills: {reconciliation.billTotal.toFixed(2)} | Payments: {reconciliation.paymentTotal.toFixed(2)} | Difference: {reconciliation.difference.toFixed(2)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>New payment voucher</CardTitle>
          <CardDescription>Allocate payments to supplier bills.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createAction} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Supplier</Label>
                <Select name="supplier_id" required>
                  <option value="">Select supplier</option>
                  {(suppliers ?? []).map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
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
                <Label>Payment date</Label>
                <Input name="payment_date" type="date" required />
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
                <Label>Total paid</Label>
                <Input name="total_paid" type="number" step="0.01" />
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
          <CardTitle>Recent payment vouchers</CardTitle>
          <CardDescription>Latest 50 payment vouchers for the active company.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(payments ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-zinc-500">
                    No payment vouchers yet.
                  </TableCell>
                </TableRow>
              ) : (
                payments?.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{payment.payment_date}</TableCell>
                    <TableCell>
                      {(() => {
                        const supplier = Array.isArray(payment.suppliers)
                          ? payment.suppliers[0]
                          : payment.suppliers;
                        return (supplier as { name: string } | null)?.name ?? "-";
                      })()}
                    </TableCell>
                    <TableCell>{Number(payment.total_paid).toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          payment.status === "posted"
                            ? "success"
                            : payment.status === "approved"
                            ? "warning"
                            : "default"
                        }
                      >
                        {payment.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-y-2">
                      {canApprove && payment.status === "draft" && (
                        <form action={approveAction}>
                          <input type="hidden" name="payment_id" value={payment.id} />
                          <Button type="submit" variant="outline">
                            Approve
                          </Button>
                        </form>
                      )}
                      {canApprove && payment.status === "approved" && (
                        <form action={postAction}>
                          <input type="hidden" name="payment_id" value={payment.id} />
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
