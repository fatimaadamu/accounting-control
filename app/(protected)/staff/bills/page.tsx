import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import DocumentLinesForm from "@/components/document-lines-form";
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
  createBillDraft,
  deleteBillDraft,
  getApReconciliation,
  postBill,
  submitBill,
} from "@/lib/actions/arap";
import { ensureActiveCompanyId, getUserCompanyRoles, requireCompanyAccess, requireUser } from "@/lib/auth";
import { canAnyRole } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function BillsPage({
  searchParams,
}: {
  searchParams?: Promise<{ toast?: string; message?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const user = await requireUser();
  const companyId = await ensureActiveCompanyId(user.id, "/staff/bills");

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

  const supabase = await createSupabaseServerClient();
  const { data: accounts, error: accountError } = await supabase
    .from("accounts")
    .select(
      "id, code, name, is_active, account_categories!inner(account_groups!inner(account_headers!inner(name)))"
    )
    .eq("company_id", companyId)
    .eq("is_active", true)
    .eq("account_categories.account_groups.account_headers.name", "Expenses")
    .order("code");

  if (accountError) {
    throw new Error(accountError.message);
  }

  if ((periods ?? []).length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Bills</CardTitle>
          <CardDescription>
            No periods for this company yet. Ask Admin to set up periods.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { data: bills, error: billError } = await supabaseAdmin()
    .from("bills")
    .select("id, bill_no, bill_date, due_date, status, total_gross, created_by, suppliers ( name )")
    .eq("company_id", companyId)
    .order("bill_date", { ascending: false })
    .limit(50);

  if (billError) {
    throw new Error(billError.message);
  }

  const reconciliation = await getApReconciliation(activeCompanyId);

  async function createAction(formData: FormData) {
    "use server";
    const supplierId = String(formData.get("supplier_id") ?? "");
    const periodId = String(formData.get("period_id") ?? "");
    const billNo = String(formData.get("bill_no") ?? "").trim();
    const billDate = String(formData.get("bill_date") ?? "");
    const dueDateRaw = String(formData.get("due_date") ?? "");
    const narration = String(formData.get("narration") ?? "").trim();
    const linesJson = String(formData.get("lines_json") ?? "[]");
    const lines = JSON.parse(linesJson) as Array<{
      account_id: string;
      description: string;
      quantity: string;
      unit_price: string;
    }>;

    if (!billNo) {
      throw new Error("Bill number is required.");
    }

    await createBillDraft({
      company_id: activeCompanyId,
      supplier_id: supplierId,
      period_id: periodId,
      bill_no: billNo,
      bill_date: billDate,
      due_date: dueDateRaw || null,
      narration,
      lines: lines.map((line) => ({
        account_id: line.account_id,
        description: line.description,
        quantity: Number(line.quantity) || 0,
        unit_price: Number(line.unit_price) || 0,
      })),
    });

    revalidatePath("/staff/bills");
    redirect("/staff/bills?toast=saved");
  }

  async function submitAction(formData: FormData) {
    "use server";
    const billId = String(formData.get("bill_id") ?? "");
    try {
      await submitBill(billId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to submit bill.";
      redirect(`/staff/bills?toast=error&message=${encodeURIComponent(message)}`);
    }
    revalidatePath("/staff/bills");
    redirect("/staff/bills?toast=submitted");
  }

  async function postAction(formData: FormData) {
    "use server";
    const billId = String(formData.get("bill_id") ?? "");
    try {
      await postBill(billId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to post bill.";
      redirect(`/staff/bills?toast=error&message=${encodeURIComponent(message)}`);
    }
    revalidatePath("/staff/bills");
    redirect("/staff/bills?toast=posted");
  }

  async function submitAndPostAction(formData: FormData) {
    "use server";
    const billId = String(formData.get("bill_id") ?? "");
    try {
      await submitBill(billId);
      await postBill(billId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to submit and post bill.";
      redirect(`/staff/bills?toast=error&message=${encodeURIComponent(message)}`);
    }
    revalidatePath("/staff/bills");
    redirect("/staff/bills?toast=posted");
  }

  async function deleteAction(formData: FormData) {
    "use server";
    const billId = String(formData.get("bill_id") ?? "");
    try {
      await deleteBillDraft(billId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete bill.";
      redirect(`/staff/bills?toast=error&message=${encodeURIComponent(message)}`);
    }
    revalidatePath("/staff/bills");
    redirect("/staff/bills?toast=deleted");
  }

  return (
    <div className="space-y-6">
      {resolvedSearchParams?.toast && (
        <ToastMessage
          kind={resolvedSearchParams.toast === "error" ? "error" : "success"}
          message={
            resolvedSearchParams.toast === "saved"
              ? "Bill saved"
              : resolvedSearchParams.toast === "submitted"
              ? "Bill submitted"
              : resolvedSearchParams.toast === "posted"
              ? "Bill posted"
              : resolvedSearchParams.toast === "deleted"
              ? "Bill deleted"
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
          <CardTitle>New bill</CardTitle>
          <CardDescription>Create a bill draft.</CardDescription>
        </CardHeader>
        <CardContent>
          {!canCreate ? (
            <p className="text-sm text-zinc-600">
              You do not have permission to create bills.
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
                  <Label>Bill no</Label>
                  <Input name="bill_no" required />
                </div>
                <div className="space-y-2">
                  <Label>Bill date</Label>
                  <Input name="bill_date" type="date" required />
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

              {accounts && accounts.length === 0 ? (
                <p className="text-sm text-zinc-600">
                  No expense accounts available. Ask Admin to add an expense account.
                </p>
              ) : (
                <DocumentLinesForm accounts={accounts ?? []} />
              )}
              <Button type="submit">Save draft</Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent bills</CardTitle>
          <CardDescription>Latest 50 bills for the active company.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Bill</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(bills ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-zinc-500">
                    No bills yet.
                  </TableCell>
                </TableRow>
              ) : (
                bills?.map((bill) => {
                  const supplier = Array.isArray(bill.suppliers)
                    ? bill.suppliers[0]
                    : bill.suppliers;
                  return (
                    <TableRow key={bill.id}>
                      <TableCell>{bill.bill_date}</TableCell>
                      <TableCell>{bill.bill_no}</TableCell>
                      <TableCell>{(supplier as { name: string } | null)?.name ?? "-"}</TableCell>
                      <TableCell>{Number(bill.total_gross).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            bill.status === "posted"
                              ? "success"
                              : bill.status === "approved"
                              ? "warning"
                              : bill.status === "submitted"
                              ? "default"
                              : "default"
                          }
                        >
                          {bill.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="space-y-2">
                        <Link
                          href={`/staff/bills/${bill.id}`}
                          className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                        >
                          View
                        </Link>
                        {bill.status === "draft" && canSubmitDraft && (
                          <form action={submitAction}>
                            <input type="hidden" name="bill_id" value={bill.id} />
                            <Button type="submit" variant="outline">
                              Submit
                            </Button>
                          </form>
                        )}
                        {bill.status === "draft" &&
                          isAdmin &&
                          canSubmitDraft &&
                          canPostSubmitted && (
                            <form action={submitAndPostAction}>
                              <input type="hidden" name="bill_id" value={bill.id} />
                              <Button type="submit" variant="default">
                                Submit &amp; Post
                              </Button>
                            </form>
                          )}
                        {bill.status === "submitted" && canPostSubmitted && (
                          <form action={postAction}>
                            <input type="hidden" name="bill_id" value={bill.id} />
                            <Button type="submit" variant="outline">
                              Post
                            </Button>
                          </form>
                        )}
                        {bill.status === "draft" && canDeleteDraft && (
                          <form action={deleteAction}>
                            <input type="hidden" name="bill_id" value={bill.id} />
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
