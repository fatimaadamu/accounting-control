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
  approveBill,
  createBillDraft,
  getApReconciliation,
  postBill,
  rejectBill,
  submitBill,
} from "@/lib/actions/arap";
import { getActiveCompanyId, getUserCompanyRoles, requireCompanyAccess, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function BillsPage() {
  const user = await requireUser();
  const companyId = await getActiveCompanyId();

  if (!companyId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Bills</CardTitle>
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
  }

  async function submitAction(formData: FormData) {
    "use server";
    const billId = String(formData.get("bill_id") ?? "");
    await submitBill(billId);
    revalidatePath("/staff/bills");
  }

  async function approveAction(formData: FormData) {
    "use server";
    const billId = String(formData.get("bill_id") ?? "");
    await approveBill(billId);
    revalidatePath("/staff/bills");
  }

  async function rejectAction(formData: FormData) {
    "use server";
    const billId = String(formData.get("bill_id") ?? "");
    const note = String(formData.get("reject_note") ?? "").trim();
    await rejectBill(billId, note || "Rejected");
    revalidatePath("/staff/bills");
  }

  async function postAction(formData: FormData) {
    "use server";
    const billId = String(formData.get("bill_id") ?? "");
    await postBill(billId);
    revalidatePath("/staff/bills");
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
          <CardTitle>New bill</CardTitle>
          <CardDescription>Create a bill draft for approval.</CardDescription>
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

            <DocumentLinesForm accounts={accounts ?? []} />
            <Button type="submit">Save draft</Button>
          </form>
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
                        {bill.status === "draft" && bill.created_by === user.id && (
                          <form action={submitAction}>
                            <input type="hidden" name="bill_id" value={bill.id} />
                            <Button type="submit" variant="outline">
                              Submit
                            </Button>
                          </form>
                        )}
                        {canApprove && bill.status === "submitted" && bill.created_by !== user.id && (
                          <form action={approveAction}>
                            <input type="hidden" name="bill_id" value={bill.id} />
                            <Button type="submit" variant="outline">
                              Approve
                            </Button>
                          </form>
                        )}
                        {canApprove && bill.status === "submitted" && bill.created_by !== user.id && (
                          <form action={rejectAction} className="flex items-center gap-2">
                            <input type="hidden" name="bill_id" value={bill.id} />
                            <Input name="reject_note" placeholder="Reject note" />
                            <Button type="submit" variant="ghost">
                              Reject
                            </Button>
                          </form>
                        )}
                        {canApprove && bill.status === "approved" && (
                          <form action={postAction}>
                            <input type="hidden" name="bill_id" value={bill.id} />
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
