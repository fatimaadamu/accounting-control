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
  createVoucherDraft,
  deleteVoucherDraft,
  getApReconciliation,
  postVoucher,
  submitVoucher,
} from "@/lib/actions/arap";
import { ensureActiveCompanyId, getUserCompanyRoles, requireCompanyAccess, requireUser } from "@/lib/auth";
import { canAnyRole } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function PaymentVouchersPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; toast?: string; message?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const user = await requireUser();
  const companyId = await ensureActiveCompanyId(user.id, "/staff/payment-vouchers");

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

  if ((periods ?? []).length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Payment vouchers</CardTitle>
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

    const normalizedAllocations = allocations
      .map((alloc) => ({
        doc_id: alloc.doc_id,
        amount: Number(alloc.amount) || 0,
      }))
      .filter((alloc) => alloc.doc_id && alloc.amount > 0);

    if (normalizedAllocations.length === 0) {
      redirect(
        "/staff/payment-vouchers?error=allocations&toast=error&message=Allocate%20at%20least%20one%20bill."
      );
    }

    try {
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
        allocations: normalizedAllocations,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save voucher.";
      redirect(`/staff/payment-vouchers?toast=error&message=${encodeURIComponent(message)}`);
    }

    revalidatePath("/staff/payment-vouchers");
    redirect("/staff/payment-vouchers?toast=saved");
  }

  async function submitAction(formData: FormData) {
    "use server";
    const voucherId = String(formData.get("voucher_id") ?? "");
    try {
      await submitVoucher(voucherId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to submit voucher.";
      redirect(`/staff/payment-vouchers?toast=error&message=${encodeURIComponent(message)}`);
    }
    revalidatePath("/staff/payment-vouchers");
    redirect("/staff/payment-vouchers?toast=submitted");
  }

  async function postAction(formData: FormData) {
    "use server";
    const voucherId = String(formData.get("voucher_id") ?? "");
    try {
      await postVoucher(voucherId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to post voucher.";
      redirect(`/staff/payment-vouchers?toast=error&message=${encodeURIComponent(message)}`);
    }
    revalidatePath("/staff/payment-vouchers");
    redirect("/staff/payment-vouchers?toast=posted");
  }

  async function submitAndPostAction(formData: FormData) {
    "use server";
    const voucherId = String(formData.get("voucher_id") ?? "");
    try {
      await submitVoucher(voucherId);
      await postVoucher(voucherId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to submit and post voucher.";
      redirect(`/staff/payment-vouchers?toast=error&message=${encodeURIComponent(message)}`);
    }
    revalidatePath("/staff/payment-vouchers");
    redirect("/staff/payment-vouchers?toast=posted");
  }

  async function deleteAction(formData: FormData) {
    "use server";
    const voucherId = String(formData.get("voucher_id") ?? "");
    try {
      await deleteVoucherDraft(voucherId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to delete voucher.";
      redirect(`/staff/payment-vouchers?toast=error&message=${encodeURIComponent(message)}`);
    }
    revalidatePath("/staff/payment-vouchers");
    redirect("/staff/payment-vouchers?toast=deleted");
  }

  return (
    <div className="space-y-6">
      {resolvedSearchParams?.toast && (
        <ToastMessage
          kind={resolvedSearchParams.toast === "error" ? "error" : "success"}
          message={
            resolvedSearchParams.toast === "saved"
              ? "Voucher saved"
              : resolvedSearchParams.toast === "submitted"
              ? "Voucher submitted"
              : resolvedSearchParams.toast === "posted"
              ? "Voucher posted"
              : resolvedSearchParams.toast === "deleted"
              ? "Voucher deleted"
              : resolvedSearchParams.message ?? "Action completed"
          }
        />
      )}
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
          {resolvedSearchParams?.error === "allocations" && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Allocate at least one bill.
            </div>
          )}
          {!canCreate ? (
            <p className="text-sm text-zinc-600">
              You do not have permission to create vouchers.
            </p>
          ) : (
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

              {allocationOptions.length === 0 ? (
                <p className="text-sm text-zinc-600">
                  No posted bills available to allocate. Post a bill first.
                </p>
              ) : (
                <AllocationsForm
                  options={allocationOptions}
                  settlementAmountName="amount_paid"
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
                        {voucher.status === "draft" && canSubmitDraft && (
                          <form action={submitAction}>
                            <input type="hidden" name="voucher_id" value={voucher.id} />
                            <Button type="submit" variant="outline">
                              Submit
                            </Button>
                          </form>
                        )}
                        {voucher.status === "draft" &&
                          isAdmin &&
                          canSubmitDraft &&
                          canPostSubmitted && (
                            <form action={submitAndPostAction}>
                              <input type="hidden" name="voucher_id" value={voucher.id} />
                              <Button type="submit">
                                Submit &amp; Post
                              </Button>
                            </form>
                          )}
                        {voucher.status === "submitted" && canPostSubmitted && (
                          <form action={postAction}>
                            <input type="hidden" name="voucher_id" value={voucher.id} />
                            <Button type="submit" variant="outline">
                              Post
                            </Button>
                          </form>
                        )}
                        {voucher.status === "draft" && canDeleteDraft && (
                          <form action={deleteAction}>
                            <input type="hidden" name="voucher_id" value={voucher.id} />
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
