import { revalidatePath } from "next/cache";

import AllocationsForm from "@/components/allocations-form";
import ReconciliationBanner from "@/components/reconciliation-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  approveVoucher,
  createVoucherDraft,
  getApReconciliation,
  postVoucher,
  rejectVoucher,
  submitVoucher,
} from "@/lib/actions/arap";
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
    .select("id, name, wht_applicable")
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
    .from("bills")
    .select("id, bill_no, total_gross, suppliers ( name )")
    .eq("company_id", companyId)
    .eq("status", "posted");

  if (billError) {
    throw new Error(billError.message);
  }

  const { data: allocations, error: allocError } = await supabaseAdmin()
    .from("payment_allocations")
    .select("bill_id, amount_allocated, payment_vouchers!inner(status)")
    .eq("payment_vouchers.status", "posted");

  if (allocError) {
    throw new Error(allocError.message);
  }

  const allocationTotals = new Map<string, number>();
  for (const alloc of allocations ?? []) {
    allocationTotals.set(
      alloc.bill_id,
      (allocationTotals.get(alloc.bill_id) ?? 0) + Number(alloc.amount_allocated || 0)
    );
  }

  const allocationOptions = (bills ?? [])
    .map((bill) => {
      const allocated = allocationTotals.get(bill.id) ?? 0;
      const outstanding = Number(bill.total_gross) - allocated;
      const supplier = Array.isArray(bill.suppliers) ? bill.suppliers[0] : bill.suppliers;
      return {
        id: bill.id,
        label: `${bill.bill_no} - ${(supplier as { name: string } | null)?.name ?? "Supplier"}`,
        amount_due: outstanding,
      };
    })
    .filter((option) => option.amount_due > 0);

  const { data: vouchers, error: voucherError } = await supabaseAdmin()
    .from("payment_vouchers")
    .select("id, voucher_no, payment_date, status, amount_paid, wht_deducted, created_by, suppliers ( name )")
    .eq("company_id", companyId)
    .order("payment_date", { ascending: false })
    .limit(50);

  if (voucherError) {
    throw new Error(voucherError.message);
  }

  const reconciliation = await getApReconciliation(activeCompanyId);

  async function createAction(formData: FormData) {
    "use server";
    const supplierId = String(formData.get("supplier_id") ?? "");
    const periodId = String(formData.get("period_id") ?? "");
    const voucherNo = String(formData.get("voucher_no") ?? "").trim();
    const paymentDate = String(formData.get("payment_date") ?? "");
    const method = String(formData.get("method") ?? "cash") as
      | "bank"
      | "momo"
      | "cash"
      | "cheque";
    const cashAccountId = String(formData.get("cash_account_id") ?? "");
    const amountPaid = Number(formData.get("amount_paid") ?? 0);
    const whtDeducted = Number(formData.get("wht_deducted") ?? 0);
    const allocationsJson = String(formData.get("allocations_json") ?? "[]");
    const allocations = JSON.parse(allocationsJson) as Array<{ doc_id: string; amount: string }>;

    if (!voucherNo) {
      throw new Error("Voucher number is required.");
    }

    await createVoucherDraft({
      company_id: activeCompanyId,
      supplier_id: supplierId,
      period_id: periodId,
      voucher_no: voucherNo,
      payment_date: paymentDate,
      method,
      cash_account_id: cashAccountId,
      amount_paid: amountPaid,
      wht_deducted: whtDeducted,
      allocations: allocations.map((alloc) => ({
        doc_id: alloc.doc_id,
        amount: Number(alloc.amount) || 0,
      })),
    });

    revalidatePath("/staff/payment-vouchers");
  }

  async function submitAction(formData: FormData) {
    "use server";
    const voucherId = String(formData.get("voucher_id") ?? "");
    await submitVoucher(voucherId);
    revalidatePath("/staff/payment-vouchers");
  }

  async function approveAction(formData: FormData) {
    "use server";
    const voucherId = String(formData.get("voucher_id") ?? "");
    await approveVoucher(voucherId);
    revalidatePath("/staff/payment-vouchers");
  }

  async function rejectAction(formData: FormData) {
    "use server";
    const voucherId = String(formData.get("voucher_id") ?? "");
    const note = String(formData.get("reject_note") ?? "").trim();
    await rejectVoucher(voucherId, note || "Rejected");
    revalidatePath("/staff/payment-vouchers");
  }

  async function postAction(formData: FormData) {
    "use server";
    const voucherId = String(formData.get("voucher_id") ?? "");
    await postVoucher(voucherId);
    revalidatePath("/staff/payment-vouchers");
  }

  return (
    <div className="space-y-6">
      <ReconciliationBanner
        title="AP reconciliation"
        description="Control vs supplier balances."
        controlBalance={reconciliation.apControlBalance}
        subledgerBalance={reconciliation.totalSupplierBalance}
        difference={reconciliation.difference}
        detailsHref="/staff/reconciliation?type=ap"
      />

      <Card>
        <CardHeader>
          <CardTitle>New payment voucher</CardTitle>
          <CardDescription>Record payments and allocate to bills.</CardDescription>
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
                      {supplier.name} {supplier.wht_applicable ? "" : "(No WHT)"}
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
                <Label>Voucher no</Label>
                <Input name="voucher_no" required />
              </div>
              <div className="space-y-2">
                <Label>Payment date</Label>
                <Input name="payment_date" type="date" required />
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
                <Label>Amount paid</Label>
                <Input name="amount_paid" type="number" step="0.01" />
              </div>
              <div className="space-y-2">
                <Label>WHT deducted</Label>
                <Input name="wht_deducted" type="number" step="0.01" />
              </div>
            </div>

            <AllocationsForm options={allocationOptions} />
            <Button type="submit">Save draft</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent vouchers</CardTitle>
          <CardDescription>Latest 50 payment vouchers for the active company.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Voucher</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(vouchers ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-zinc-500">
                    No vouchers yet.
                  </TableCell>
                </TableRow>
              ) : (
                vouchers?.map((voucher) => {
                  const supplier = Array.isArray(voucher.suppliers)
                    ? voucher.suppliers[0]
                    : voucher.suppliers;
                  return (
                    <TableRow key={voucher.id}>
                      <TableCell>{voucher.payment_date}</TableCell>
                      <TableCell>{voucher.voucher_no}</TableCell>
                      <TableCell>{(supplier as { name: string } | null)?.name ?? "-"}</TableCell>
                      <TableCell>
                        {Number(voucher.amount_paid).toFixed(2)} (WHT {Number(voucher.wht_deducted).toFixed(2)})
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            voucher.status === "posted"
                              ? "success"
                              : voucher.status === "approved"
                              ? "warning"
                              : voucher.status === "submitted"
                              ? "default"
                              : "default"
                          }
                        >
                          {voucher.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="space-y-2">
                        {voucher.status === "draft" && voucher.created_by === user.id && (
                          <form action={submitAction}>
                            <input type="hidden" name="voucher_id" value={voucher.id} />
                            <Button type="submit" variant="outline">
                              Submit
                            </Button>
                          </form>
                        )}
                        {canApprove && voucher.status === "submitted" && voucher.created_by !== user.id && (
                          <form action={approveAction}>
                            <input type="hidden" name="voucher_id" value={voucher.id} />
                            <Button type="submit" variant="outline">
                              Approve
                            </Button>
                          </form>
                        )}
                        {canApprove && voucher.status === "submitted" && voucher.created_by !== user.id && (
                          <form action={rejectAction} className="flex items-center gap-2">
                            <input type="hidden" name="voucher_id" value={voucher.id} />
                            <Input name="reject_note" placeholder="Reject note" />
                            <Button type="submit" variant="ghost">
                              Reject
                            </Button>
                          </form>
                        )}
                        {canApprove && voucher.status === "approved" && (
                          <form action={postAction}>
                            <input type="hidden" name="voucher_id" value={voucher.id} />
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
